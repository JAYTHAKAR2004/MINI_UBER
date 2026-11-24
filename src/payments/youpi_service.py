"""YouPI-PG (Self-Hosted UPI Gateway) Core Service Client & Multi-Replica Broadcaster.

Connects to the real isolated YouPI-PG Payment Core API (:6100) and Checkout
Portal (:7000) using server-side merchant authentication (`X-Merchant-Id` and
`X-Merchant-Key`), verifies signed webhooks over exact raw request bytes, and
distributes live payment status updates across API replicas via Redis Pub/Sub.
"""
import asyncio
import hashlib
import hmac
import json
import os
import re
import time
from typing import AsyncGenerator, Callable, Dict, Optional, Set, Tuple
import urllib.parse

import httpx
import redis.asyncio as aioredis


UTR_REGEX = re.compile(r"^[A-Za-z0-9-]{6,35}$")
TERMINAL_UI_STATES = {"RECONCILED", "FAILED", "EXPIRED", "CANCELLED"}


class YouPIGatewayError(Exception):
    """Structured error raised when YouPI-PG is unconfigured, unreachable, or rejects a request."""

    def __init__(self, status_code: int, detail: str, code: str = "YOUPI_GATEWAY_ERROR"):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.code = code


def get_youpi_config() -> dict:
    """Retrieve YouPI-PG merchant configuration from server-side environment variables."""
    api_url = (os.getenv("YOUPI_API_URL") or "http://localhost:6100").strip().rstrip("/")
    checkout_url = (os.getenv("YOUPI_CHECKOUT_URL") or "http://localhost:7000").strip().rstrip("/")
    merchant_id = (os.getenv("YOUPI_MERCHANT_ID") or "").strip()
    merchant_api_key = (os.getenv("YOUPI_MERCHANT_API_KEY") or "").strip()
    webhook_secret = (os.getenv("YOUPI_WEBHOOK_SECRET") or "").strip()
    raw_method = (os.getenv("YOUPI_UPI_METHOD") or "MANUAL_UPI").strip().upper()
    upi_method = raw_method if raw_method in ("MANUAL_UPI", "UPI") else "MANUAL_UPI"
    tolerance_raw = (os.getenv("YOUPI_WEBHOOK_TOLERANCE_SECONDS") or "300").strip()
    try:
        webhook_tolerance_seconds = max(30, min(3600, int(tolerance_raw)))
    except ValueError:
        webhook_tolerance_seconds = 300
    reconcile_admin_token = (os.getenv("YOUPI_RECONCILE_ADMIN_TOKEN") or "").strip()

    session_configured = bool(merchant_id and merchant_api_key)
    webhook_configured = bool(webhook_secret)
    configured = bool(session_configured and webhook_configured)

    return {
        "api_url": api_url,
        "checkout_url": checkout_url,
        "merchant_id": merchant_id,
        "merchant_api_key": merchant_api_key,
        "webhook_secret": webhook_secret,
        "upi_method": upi_method,
        "webhook_tolerance_seconds": webhook_tolerance_seconds,
        "reconcile_admin_token": reconcile_admin_token,
        "session_configured": session_configured,
        "webhook_configured": webhook_configured,
        "configured": configured,
    }


def validate_utr_format(utr: str) -> str:
    """Validate and normalize a customer-submitted UTR/transaction reference."""
    clean = (utr or "").strip()
    if not UTR_REGEX.fullmatch(clean):
        raise YouPIGatewayError(
            status_code=422,
            detail="Enter a valid UPI reference/UTR (6–35 letters, digits, or hyphens).",
            code="INVALID_UTR_FORMAT",
        )
    return clean


def _strip_sha256_prefix(sig_header: str) -> str:
    raw = (sig_header or "").strip()
    if raw.lower().startswith("sha256="):
        return raw[len("sha256="):].strip().lower()
    return raw.lower()


def verify_youpi_webhook(
    raw_body: bytes,
    signature_v1: Optional[str],
    signature_v2: Optional[str],
    timestamp_header: Optional[str],
    secret: str,
    tolerance_seconds: int = 300,
    now_seconds: Optional[float] = None,
) -> Tuple[bool, str]:
    """Verify YouPI-PG webhook HMAC-SHA256 signatures and replay timestamp window.

    Matches `packages/core/src/webhook-engine.js`:
    - `X-Gateway-Signature`: `sha256=${hmac_sha256(body, secret)}`
    - `X-Gateway-Signature-V2`: `sha256=${hmac_sha256(`${timestamp}.${body}`, secret)}`
    - `X-Gateway-Timestamp`: epoch milliseconds (or seconds) string
    """
    if not secret:
        return False, "YOUPI_WEBHOOK_SECRET is not configured."

    ts_raw = (timestamp_header or "").strip()
    if not ts_raw:
        return False, "Missing X-Gateway-Timestamp header."

    try:
        ts_num = float(ts_raw)
    except ValueError:
        return False, "Invalid X-Gateway-Timestamp header."

    # YouPI-PG emits Date.now().toString() (milliseconds), accept seconds too.
    ts_sec = ts_num / 1000.0 if ts_num > 1e11 else ts_num
    now = time.time() if now_seconds is None else float(now_seconds)
    if abs(now - ts_sec) > tolerance_seconds:
        return False, "Webhook timestamp is outside the allowed replay window."

    has_v2 = bool(signature_v2 and signature_v2.strip())
    has_v1 = bool(signature_v1 and signature_v1.strip())
    if not has_v2 and not has_v1:
        return False, "Missing webhook signature header."

    if has_v2:
        provided_v2 = _strip_sha256_prefix(signature_v2)
        expected_v2 = hmac.new(
            secret.encode("utf-8"),
            f"{ts_raw}.".encode("utf-8") + raw_body,
            hashlib.sha256,
        ).hexdigest().lower()
        if not hmac.compare_digest(expected_v2, provided_v2):
            return False, "Invalid X-Gateway-Signature-V2 HMAC signature."

    if has_v1:
        provided_v1 = _strip_sha256_prefix(signature_v1)
        expected_v1 = hmac.new(
            secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest().lower()
        if not hmac.compare_digest(expected_v1, provided_v1):
            return False, "Invalid X-Gateway-Signature HMAC signature."

    return True, "OK"


async def create_youpi_session(
    order_code: str,
    amount_inr: float,
    customer_name: str,
    customer_phone: str,
    idempotency_key: Optional[str] = None,
    return_url: Optional[str] = None,
) -> dict:
    """Create a real payment session in YouPI-PG (`POST /api/v1/payments`).

    Fails closed with `YouPIGatewayError` if credentials are missing or the gateway
    is unreachable or rejects the request. Never fabricates a mock session or VPA.
    """
    cfg = get_youpi_config()
    if not cfg["session_configured"]:
        raise YouPIGatewayError(
            status_code=503,
            detail=(
                "YouPI-PG merchant credentials (YOUPI_MERCHANT_ID and "
                "YOUPI_MERCHANT_API_KEY) are not configured on the backend."
            ),
            code="YOUPI_NOT_CONFIGURED",
        )

    payload = {
        "orderId": order_code,
        "amount": f"{amount_inr:.2f}",
        "currency": "INR",
        "method": cfg["upi_method"],
        "customer": {
            "name": customer_name,
            "phoneNumber": customer_phone,
        },
        "description": f"Order {order_code}",
    }
    if return_url:
        payload["returnUrl"] = return_url

    headers = {
        "Content-Type": "application/json",
        "X-Merchant-Id": cfg["merchant_id"],
        "X-Merchant-Key": cfg["merchant_api_key"],
    }
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{cfg['api_url']}/api/v1/payments",
                json=payload,
                headers=headers,
            )
    except httpx.HTTPError as exc:
        raise YouPIGatewayError(
            status_code=503,
            detail=f"YouPI-PG payment API at {cfg['api_url']} is unreachable: {exc}",
            code="YOUPI_UNREACHABLE",
        )

    try:
        body = resp.json()
    except Exception:
        body = {"error": resp.text}

    if resp.status_code not in (200, 201):
        err_detail = (
            body.get("message")
            or body.get("error")
            or f"YouPI-PG returned HTTP {resp.status_code}."
        )
        err_code = body.get("code") or "YOUPI_REJECTED"
        mapped_status = resp.status_code if resp.status_code in (400, 401, 403, 404, 409, 422, 429) else 502
        raise YouPIGatewayError(mapped_status, err_detail, err_code)

    payment_id = body.get("paymentId")
    checkout_url = body.get("checkoutUrl")
    if not payment_id or not checkout_url:
        raise YouPIGatewayError(
            status_code=502,
            detail="YouPI-PG response omitted paymentId or checkoutUrl.",
            code="YOUPI_INVALID_RESPONSE",
        )

    return {
        "payment_id": payment_id,
        "session_id": payment_id,
        "order_code": body.get("orderId") or order_code,
        "amount": float(body.get("amount") or amount_inr),
        "amount_paise": str(body.get("amountPaise") or int(round(amount_inr * 100))),
        "currency": body.get("currency") or "INR",
        "method": cfg["upi_method"],
        "gateway_status": body.get("status") or "INITIATED",
        "queue_position": int(body.get("queuePosition") or 0),
        "checkout_url": checkout_url,
        "qr_svg_proxy_path": f"/api/payments/youpi/qr/{urllib.parse.quote(order_code)}.svg",
        "expires_in_seconds": 300,
    }


async def submit_youpi_manual_utr(payment_id: str, utr: str) -> dict:
    """Forward customer-submitted UTR to YouPI-PG `/api/v1/checkout/:id/manual-utr`."""
    clean_utr = validate_utr_format(utr)
    cfg = get_youpi_config()
    if not cfg["session_configured"]:
        raise YouPIGatewayError(
            status_code=503,
            detail="YouPI-PG merchant credentials are not configured on the backend.",
            code="YOUPI_NOT_CONFIGURED",
        )

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{cfg['api_url']}/api/v1/checkout/{urllib.parse.quote(payment_id)}/manual-utr",
                json={"utr": clean_utr},
                headers={
                    "Content-Type": "application/json",
                    "X-Merchant-Id": cfg["merchant_id"],
                    "X-Merchant-Key": cfg["merchant_api_key"],
                },
            )
    except httpx.HTTPError as exc:
        raise YouPIGatewayError(
            status_code=503,
            detail=f"Unable to reach YouPI-PG to record UTR: {exc}",
            code="YOUPI_UNREACHABLE",
        )

    try:
        body = resp.json()
    except Exception:
        body = {"error": resp.text}

    if resp.status_code not in (200, 201):
        err_detail = body.get("error") or body.get("message") or f"UTR submission failed ({resp.status_code})."
        mapped_status = resp.status_code if resp.status_code in (400, 401, 404, 409, 422) else 502
        raise YouPIGatewayError(mapped_status, err_detail, "YOUPI_UTR_REJECTED")

    return body


async def fetch_youpi_qr_svg(payment_id: str) -> bytes:
    """Fetch real vector SVG QR generated by YouPI-PG Checkout Portal (`:7000`)."""
    cfg = get_youpi_config()
    url = f"{cfg['checkout_url']}/checkout/{urllib.parse.quote(payment_id)}/qr.svg"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
    except httpx.HTTPError as exc:
        raise YouPIGatewayError(
            status_code=503,
            detail=f"YouPI-PG Checkout Portal at {cfg['checkout_url']} is unreachable: {exc}",
            code="YOUPI_PORTAL_UNREACHABLE",
        )

    if resp.status_code != 200 or b"<svg" not in resp.content.lower():
        raise YouPIGatewayError(
            status_code=502,
            detail=f"YouPI-PG Checkout Portal returned invalid QR SVG (HTTP {resp.status_code}).",
            code="YOUPI_QR_INVALID",
        )
    return resp.content


async def fetch_youpi_payment_details(payment_id: str) -> dict:
    """Fetch authoritative merchant-private payment details from YouPI-PG."""
    cfg = get_youpi_config()
    if not cfg["session_configured"]:
        raise YouPIGatewayError(503, "YouPI-PG merchant credentials are not configured.", "YOUPI_NOT_CONFIGURED")

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                f"{cfg['api_url']}/api/v1/payments/{urllib.parse.quote(payment_id)}",
                headers={
                    "X-Merchant-Id": cfg["merchant_id"],
                    "X-Merchant-Key": cfg["merchant_api_key"],
                },
            )
    except httpx.HTTPError as exc:
        raise YouPIGatewayError(503, f"Unable to query YouPI-PG: {exc}", "YOUPI_UNREACHABLE")

    if resp.status_code != 200:
        raise YouPIGatewayError(resp.status_code if resp.status_code < 500 else 502, resp.text, "YOUPI_QUERY_FAILED")
    return resp.json()


# ---------------------------------------------------------------------------
# Multi-Replica Order Status Broadcaster (Redis Pub/Sub + Local Queue Fallback)
# ---------------------------------------------------------------------------
def _default_redis_factory() -> aioredis.Redis:
    host = os.getenv("REDIS_HOST", "localhost")
    port = int(os.getenv("REDIS_PORT", "6379"))
    return aioredis.Redis(
        host=host,
        port=port,
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=1,
    )


class MultiReplicaOrderBroadcaster:
    """Broadcasts order payment state across all FastAPI replicas via Redis Pub/Sub.

    Falls back gracefully to per-process queues + periodic DB polling if Redis is offline.
    """

    def __init__(self, redis_factory: Optional[Callable[[], aioredis.Redis]] = None):
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()
        self._redis_factory = redis_factory or _default_redis_factory

    @staticmethod
    def channel_name(order_code: str) -> str:
        return f"youpi:order_status:{order_code}"

    async def subscribe_local(self, order_code: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self._subscribers.setdefault(order_code, set()).add(queue)
        return queue

    async def unsubscribe_local(self, order_code: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            subs = self._subscribers.get(order_code)
            if subs:
                subs.discard(queue)
                if not subs:
                    del self._subscribers[order_code]

    async def broadcast(self, order_code: str, payload: dict) -> dict:
        """Deliver update locally and publish via Redis Pub/Sub to sibling API replicas."""
        message_json = json.dumps(payload)

        async with self._lock:
            local_queues = list(self._subscribers.get(order_code, ()))
        for q in local_queues:
            await q.put(payload)

        redis_published = False
        client = None
        try:
            client = self._redis_factory()
            await client.publish(self.channel_name(order_code), message_json)
            redis_published = True
        except Exception as exc:
            print(f"[YouPI PubSub] Redis publish skipped/fallback ({order_code}): {exc}")
        finally:
            if client is not None:
                try:
                    await client.aclose()
                except Exception:
                    pass

        return {"local_deliveries": len(local_queues), "redis_published": redis_published}

    async def stream_events(
        self,
        order_code: str,
        snapshot_fn: Callable[[], Optional[dict]],
        heartbeat_seconds: float = 15.0,
    ) -> AsyncGenerator[str, None]:
        """Yield SSE frames from initial DB snapshot, Redis Pub/Sub (or local queue), and keepalives."""
        initial = snapshot_fn()
        if initial is not None:
            yield f"data: {json.dumps(initial)}\n\n"
            if initial.get("ui_state") in TERMINAL_UI_STATES:
                return

        redis_client = None
        pubsub = None
        use_redis = False
        local_queue: Optional[asyncio.Queue] = None

        try:
            redis_client = self._redis_factory()
            pubsub = redis_client.pubsub()
            await pubsub.subscribe(self.channel_name(order_code))
            use_redis = True
        except Exception as exc:
            print(f"[YouPI SSE] Falling back to local queue + DB polling ({order_code}): {exc}")
            if pubsub is not None:
                try:
                    await pubsub.close()
                except Exception:
                    pass
            if redis_client is not None:
                try:
                    await redis_client.aclose()
                except Exception:
                    pass
            redis_client = None
            pubsub = None
            local_queue = await self.subscribe_local(order_code)

        last_sent = json.dumps(initial or {}, sort_keys=True)
        try:
            while True:
                event_payload = None
                if use_redis and pubsub is not None:
                    try:
                        msg = await asyncio.wait_for(
                            pubsub.get_message(ignore_subscribe_messages=True, timeout=heartbeat_seconds),
                            timeout=heartbeat_seconds + 1.0,
                        )
                        if msg and msg.get("type") == "message":
                            raw_data = msg.get("data")
                            if isinstance(raw_data, bytes):
                                raw_data = raw_data.decode("utf-8")
                            event_payload = json.loads(raw_data)
                    except asyncio.TimeoutError:
                        event_payload = None
                elif local_queue is not None:
                    try:
                        event_payload = await asyncio.wait_for(local_queue.get(), timeout=heartbeat_seconds)
                    except asyncio.TimeoutError:
                        event_payload = None

                if event_payload is not None:
                    encoded = json.dumps(event_payload, sort_keys=True)
                    if encoded != last_sent:
                        last_sent = encoded
                        yield f"data: {json.dumps(event_payload)}\n\n"
                    if event_payload.get("ui_state") in TERMINAL_UI_STATES:
                        break
                    continue

                # Heartbeat / DB fallback check in case an update occurred while offline
                latest = snapshot_fn()
                if latest is not None:
                    encoded_latest = json.dumps(latest, sort_keys=True)
                    if encoded_latest != last_sent:
                        last_sent = encoded_latest
                        yield f"data: {json.dumps(latest)}\n\n"
                        if latest.get("ui_state") in TERMINAL_UI_STATES:
                            break
                        continue
                yield ": ping\n\n"
        finally:
            if pubsub is not None:
                try:
                    await pubsub.unsubscribe(self.channel_name(order_code))
                    await pubsub.close()
                except Exception:
                    pass
            if redis_client is not None:
                try:
                    await redis_client.aclose()
                except Exception:
                    pass
            if local_queue is not None:
                await self.unsubscribe_local(order_code, local_queue)


broadcaster = MultiReplicaOrderBroadcaster()
