"""Automated test suite for fail-closed YouPI-PG (MANUAL_UPI) integration.

Covers:
1. Public config & zero secret leakage
2. Fail-closed 503 behavior when unconfigured or gateway unreachable
3. Outbound X-Merchant-Id / X-Merchant-Key auth headers & MANUAL_UPI session creation
4. Real YouPI-PG SVG QR proxy
5. Customer UTR submission keeping payment PENDING_VERIFICATION + duplicate UTR blocking
6. Webhook HMAC-SHA256 V1/V2 raw-body verification, timestamp replay tolerance, and delivery-ID deduplication
7. Ensuring SMS/Gmail OBSERVED_SUCCESS never marks an order paid without reconciliation
8. Admin bank reconciliation & RECONCILED/FAILED/EXPIRED webhook transitions
9. Multi-replica Redis Pub/Sub SSE delivery across api1, api2, and api3 instances
"""
import asyncio
import hashlib
import hmac
import json
import os
import time
from typing import Dict, List

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.database import Base
from src.models.db_models import CustomerOrder
from src.payments.youpi_service import (
    MultiReplicaOrderBroadcaster,
    verify_youpi_webhook,
)


TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


class MockHttpResponse:
    def __init__(self, status_code: int, json_body=None, content: bytes = b""):
        self.status_code = status_code
        self._json_body = json_body
        self.content = content or (json.dumps(json_body).encode("utf-8") if json_body is not None else b"")
        self.text = self.content.decode("utf-8", errors="ignore")

    def json(self):
        if self._json_body is not None:
            return self._json_body
        return json.loads(self.text)


class FakeRedisBroker:
    """Thread/task-safe in-memory Pub/Sub broker simulating shared Redis across api1/api2/api3."""

    def __init__(self):
        self.channels: Dict[str, List[asyncio.Queue]] = {}

    def make_client(self):
        return FakeAsyncRedisClient(self)


class FakeAsyncRedisPubSub:
    def __init__(self, broker: FakeRedisBroker):
        self.broker = broker
        self.queue: asyncio.Queue = asyncio.Queue()
        self.subscribed: List[str] = []

    async def subscribe(self, channel: str):
        self.broker.channels.setdefault(channel, []).append(self.queue)
        self.subscribed.append(channel)

    async def unsubscribe(self, channel: str):
        subs = self.broker.channels.get(channel, [])
        if self.queue in subs:
            subs.remove(self.queue)

    async def get_message(self, ignore_subscribe_messages: bool = True, timeout: float = 1.0):
        try:
            data = await asyncio.wait_for(self.queue.get(), timeout=timeout)
            return {"type": "message", "data": data}
        except asyncio.TimeoutError:
            return None

    async def close(self):
        for ch in list(self.subscribed):
            await self.unsubscribe(ch)


class FakeAsyncRedisClient:
    def __init__(self, broker: FakeRedisBroker):
        self.broker = broker

    def pubsub(self):
        return FakeAsyncRedisPubSub(self.broker)

    async def publish(self, channel: str, message: str):
        queues = list(self.broker.channels.get(channel, []))
        for q in queues:
            await q.put(message)
        return len(queues)

    async def aclose(self):
        return None


def _seed_order(order_code: str, amount_inr: float = 450.0, **extra) -> CustomerOrder:
    db = TestingSessionLocal()
    try:
        order = CustomerOrder(
            order_code=order_code,
            restaurant_name="Forno Neapolitan Kitchen",
            customer_name="Jay Thakar",
            customer_phone="+91 98765 43210",
            delivery_address="Indiranagar, Bengaluru",
            items=[{"name": "Margherita", "price": amount_inr, "quantity": 1}],
            amount_inr=amount_inr,
            payment_method="YouPI-PG (MANUAL_UPI)",
            payment_status="PENDING",
            order_status="Order placed",
            **extra,
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        return order
    finally:
        db.close()


def _sign_webhook(payload: dict, secret: str, ts_ms: int | None = None):
    ts = str(ts_ms if ts_ms is not None else int(time.time() * 1000))
    raw_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    sig_v1 = hmac.new(secret.encode("utf-8"), raw_bytes, hashlib.sha256).hexdigest()
    sig_v2 = hmac.new(
        secret.encode("utf-8"),
        f"{ts}.".encode("utf-8") + raw_bytes,
        hashlib.sha256,
    ).hexdigest()
    return raw_bytes, {
        "Content-Type": "application/json",
        "X-Gateway-Event": str(payload.get("event", "")),
        "X-Gateway-Timestamp": ts,
        "X-Gateway-Delivery-Id": str(payload.get("deliveryId", "")),
        "X-Gateway-Signature": f"sha256={sig_v1}",
        "X-Gateway-Signature-V2": f"sha256={sig_v2}",
    }


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def env_configured(monkeypatch):
    monkeypatch.setenv("YOUPI_API_URL", "http://mock-youpi:6100")
    monkeypatch.setenv("YOUPI_CHECKOUT_URL", "http://mock-youpi:7000")
    monkeypatch.setenv("YOUPI_MERCHANT_ID", "00000000-0000-0000-0000-000000000001")
    monkeypatch.setenv("YOUPI_MERCHANT_API_KEY", "merch_api_secret_test_key")
    monkeypatch.setenv("YOUPI_WEBHOOK_SECRET", "wh_secret_test_key_98765")
    monkeypatch.setenv("YOUPI_UPI_METHOD", "MANUAL_UPI")
    monkeypatch.setenv("YOUPI_WEBHOOK_TOLERANCE_SECONDS", "300")
    monkeypatch.setenv("YOUPI_RECONCILE_ADMIN_TOKEN", "admin_reconcile_token_xyz")


@pytest.fixture
def client(monkeypatch, env_configured):
    import src.api.main as api_main
    monkeypatch.setattr(api_main, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(api_main, "ensure_orders_table", lambda: None)

    with TestClient(api_main.app) as test_client:
        yield test_client


def test_webhook_crypto_and_timestamp_validation():
    """Verify raw-byte V1/V2 HMAC verification and timestamp replay window."""
    secret = "wh_secret_test_key_98765"
    now_sec = 1_795_500_000.0
    ts_ms = str(int(now_sec * 1000))
    body = b'{"event":"MANUAL_REVIEW","orderId":"MU-100","amount":"450.00","currency":"INR"}'

    sig_v1 = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    sig_v2 = hmac.new(secret.encode("utf-8"), f"{ts_ms}.".encode("utf-8") + body, hashlib.sha256).hexdigest()

    assert verify_youpi_webhook(body, f"sha256={sig_v1}", f"sha256={sig_v2}", ts_ms, secret, 300, now_sec)[0] is True
    assert verify_youpi_webhook(body, None, f"sha256={sig_v2}", ts_ms, secret, 300, now_sec)[0] is True
    assert verify_youpi_webhook(body, f"sha256={sig_v1}", None, ts_ms, secret, 300, now_sec)[0] is True

    # Stale timestamp (400s old > 300s tolerance)
    stale_ts = str(int((now_sec - 400) * 1000))
    ok, reason = verify_youpi_webhook(body, f"sha256={sig_v1}", None, stale_ts, secret, 300, now_sec)
    assert ok is False
    assert "replay window" in reason.lower()

    # Tampered body fails constant-time check
    tampered = b'{"event":"RECONCILED","orderId":"MU-100","amount":"1.00","currency":"INR"}'
    ok, _ = verify_youpi_webhook(tampered, f"sha256={sig_v1}", f"sha256={sig_v2}", ts_ms, secret, 300, now_sec)
    assert ok is False


def test_config_endpoint_never_leaks_secrets(client):
    """GET /payments/youpi/config reports MANUAL_UPI without exposing secrets or fake VPAs."""
    resp = client.get("/payments/youpi/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["session_configured"] is True
    assert data["webhook_configured"] is True
    assert data["method"] == "MANUAL_UPI"
    assert data["requires_manual_reconciliation"] is True
    serialized = json.dumps(data)
    assert "merch_api_secret_test_key" not in serialized
    assert "wh_secret_test_key_98765" not in serialized
    assert "merchant@upi" not in serialized


def test_fail_closed_when_unconfigured_or_gateway_down(client, monkeypatch):
    """Fail closed with HTTP 503 if credentials missing or gateway unreachable (zero fake QR)."""
    _seed_order("MU-FAIL-01", 299.0)

    monkeypatch.setenv("YOUPI_MERCHANT_API_KEY", "")
    resp = client.post(
        "/payments/youpi/order",
        json={"order_code": "MU-FAIL-01", "amount_inr": 299.0},
    )
    assert resp.status_code == 503
    assert "not configured" in resp.json()["detail"].lower()

    monkeypatch.setenv("YOUPI_MERCHANT_API_KEY", "merch_api_secret_test_key")

    class OfflineAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, *args, **kwargs):
            raise httpx.ConnectError("Connection refused")

    monkeypatch.setattr("src.payments.youpi_service.httpx.AsyncClient", OfflineAsyncClient)
    resp2 = client.post(
        "/payments/youpi/order",
        json={"order_code": "MU-FAIL-01", "amount_inr": 299.0},
    )
    assert resp2.status_code == 503
    assert "unreachable" in resp2.json()["detail"].lower()


def test_session_creation_qr_proxy_and_utr_flow(client, monkeypatch):
    """Test real MANUAL_UPI flow: X-Merchant-Key auth -> checkoutUrl + SVG QR -> UTR -> PENDING_VERIFICATION."""
    _seed_order("MU-REAL-001", 450.0, idempotency_key="idem-real-001")
    _seed_order("MU-REAL-002", 200.0)
    captured_calls = []

    class MockYouPIClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json=None, headers=None):
            captured_calls.append({"url": url, "json": json, "headers": headers})
            if url.endswith("/api/v1/payments"):
                pid = f"pay-uuid-{json['orderId']}"
                return MockHttpResponse(
                    201,
                    {
                        "paymentId": pid,
                        "orderId": json["orderId"],
                        "amount": json["amount"],
                        "amountPaise": str(int(round(float(json["amount"]) * 100))),
                        "currency": "INR",
                        "status": "INITIATED",
                        "queuePosition": 0,
                        "checkoutUrl": f"http://mock-youpi:7000/checkout/{pid}",
                    },
                )
            if "/manual-utr" in url:
                return MockHttpResponse(
                    200,
                    {
                        "paymentId": "pay-uuid-001",
                        "orderId": "MU-REAL-001",
                        "status": "PENDING_VERIFICATION",
                        "settlementState": "PENDING_VERIFICATION",
                        "customerUtr": json["utr"],
                        "message": "Payment submitted. The merchant must verify it in the bank account.",
                    },
                )
            return MockHttpResponse(404, {"error": "Unexpected URL"})

        async def get(self, url, headers=None):
            if url.endswith("/checkout/pay-uuid-MU-REAL-001/qr.svg"):
                return MockHttpResponse(200, content=b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')
            return MockHttpResponse(404, {"error": "Not found"})

    monkeypatch.setattr("src.payments.youpi_service.httpx.AsyncClient", MockYouPIClient)

    # Amount mismatch rejected
    bad_amt = client.post("/payments/youpi/order", json={"order_code": "MU-REAL-001", "amount_inr": 1.0})
    assert bad_amt.status_code == 422

    # Valid session creation
    resp = client.post(
        "/payments/youpi/order",
        json={"order_code": "MU-REAL-001", "amount_inr": 450.0, "customer_name": "Jay Thakar"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["payment_id"] == "pay-uuid-MU-REAL-001"
    assert data["checkout_url"] == "http://mock-youpi:7000/checkout/pay-uuid-MU-REAL-001"
    assert data["qr_svg_proxy_path"] == "/api/payments/youpi/qr/MU-REAL-001.svg"
    assert data["ui_state"] == "QR_READY"
    assert data["payment_status"] == "PENDING_VERIFICATION"

    # Assert exact outbound auth headers and MANUAL_UPI payload
    create_call = captured_calls[0]
    assert create_call["headers"]["X-Merchant-Id"] == "00000000-0000-0000-0000-000000000001"
    assert create_call["headers"]["X-Merchant-Key"] == "merch_api_secret_test_key"
    assert create_call["headers"]["Idempotency-Key"] == "idem-real-001"
    assert create_call["json"]["method"] == "MANUAL_UPI"
    assert create_call["json"]["amount"] == "450.00"

    # QR SVG proxy returns real gateway SVG
    qr_resp = client.get("/payments/youpi/qr/MU-REAL-001.svg")
    assert qr_resp.status_code == 200
    assert "image/svg+xml" in qr_resp.headers["content-type"]
    assert b"<svg" in qr_resp.content

    # Invalid UTR format rejected
    bad_utr = client.post("/payments/youpi/utr", json={"order_code": "MU-REAL-001", "utr": "123"})
    assert bad_utr.status_code == 422

    # Submit valid UTR -> order MUST stay PENDING_VERIFICATION (never paid!)
    utr_resp = client.post("/payments/youpi/utr", json={"order_code": "MU-REAL-001", "utr": "432819045612"})
    assert utr_resp.status_code == 200
    utr_data = utr_resp.json()
    assert utr_data["ui_state"] == "UTR_SUBMITTED"
    assert utr_data["payment_status"] == "PENDING_VERIFICATION"
    assert utr_data["settlement_state"] == "UTR_SUBMITTED"
    assert utr_data["order_status"] == "Pending Payment Verification"
    assert utr_data["utr"] == "432819045612"

    # Duplicate UTR submission on a second order must be blocked (409)
    ord2 = client.post("/payments/youpi/order", json={"order_code": "MU-REAL-002", "amount_inr": 200.0})
    assert ord2.status_code == 200
    dup_utr = client.post("/payments/youpi/utr", json={"order_code": "MU-REAL-002", "utr": "432819045612"})
    assert dup_utr.status_code == 409


def test_webhook_security_observed_not_paid_and_reconciliation(client):
    """Verify SMS/Gmail OBSERVED_SUCCESS never marks paid, while independent reconciliation succeeds."""
    secret = "wh_secret_test_key_98765"
    _seed_order("MU-WH-OBS", 350.0)
    _seed_order("MU-WH-REC", 500.0)
    _seed_order("MU-WH-EXP", 199.0)

    # 1. Invalid signature -> 401
    bad_raw = json.dumps({"event": "MANUAL_REVIEW", "orderId": "MU-WH-OBS", "amount": "350.00", "currency": "INR"}).encode()
    resp_bad_sig = client.post(
        "/payments/youpi/webhook",
        content=bad_raw,
        headers={
            "Content-Type": "application/json",
            "X-Gateway-Timestamp": str(int(time.time() * 1000)),
            "X-Gateway-Signature-V2": "sha256=deadbeef",
        },
    )
    assert resp_bad_sig.status_code == 401

    # 2. Stale timestamp -> 401
    obs_payload = {
        "event": "OBSERVED_SUCCESS",
        "deliveryId": "deliv-obs-001",
        "orderId": "MU-WH-OBS",
        "amount": "350.00",
        "currency": "INR",
        "utr": "511223344556",
        "paymentId": "pay-obs-001",
        "settlementState": "NOT_RECONCILED",
    }
    stale_raw, stale_headers = _sign_webhook(obs_payload, secret, ts_ms=int((time.time() - 900) * 1000))
    assert client.post("/payments/youpi/webhook", content=stale_raw, headers=stale_headers).status_code == 401

    # 3. Valid OBSERVED_SUCCESS (SMS/Gmail alert match) MUST keep order PENDING_VERIFICATION!
    raw_obs, hdr_obs = _sign_webhook(obs_payload, secret)
    obs_resp = client.post("/payments/youpi/webhook", content=raw_obs, headers=hdr_obs)
    assert obs_resp.status_code == 200
    obs_json = obs_resp.json()
    assert obs_json["payment_status"] == "PENDING_VERIFICATION"
    assert obs_json["settlement_state"] == "OBSERVED_UNRECONCILED"
    assert obs_json["status"] == "PENDING_VERIFICATION"

    db = TestingSessionLocal()
    rec_obs = db.query(CustomerOrder).filter(CustomerOrder.order_code == "MU-WH-OBS").first()
    assert rec_obs.payment_status == "PENDING_VERIFICATION"
    assert rec_obs.payment_confirmed_at is None  # Never confirmed from observer alert alone!
    db.close()

    # 4. Replay of same deliveryId -> duplicate_ignored
    replay_resp = client.post("/payments/youpi/webhook", content=raw_obs, headers=hdr_obs)
    assert replay_resp.status_code == 200
    assert replay_resp.json()["status"] == "duplicate_ignored"

    # 5. Unauthorized reconcile rejected (401), authorized reconcile -> RECONCILED
    unauth_rec = client.post(
        "/payments/youpi/reconcile",
        json={
            "order_code": "MU-WH-OBS",
            "decision": "RECONCILED",
            "verified_utr": "511223344556",
            "reviewer": "finance-lead",
        },
        headers={"Authorization": "Bearer wrong_token"},
    )
    assert unauth_rec.status_code == 401

    auth_rec = client.post(
        "/payments/youpi/reconcile",
        json={
            "order_code": "MU-WH-OBS",
            "decision": "RECONCILED",
            "verified_utr": "511223344556",
            "reviewer": "finance-lead",
        },
        headers={"Authorization": "Bearer admin_reconcile_token_xyz"},
    )
    assert auth_rec.status_code == 200
    assert auth_rec.json()["payment_status"] == "RECONCILED"
    assert auth_rec.json()["settlement_state"] == "RECONCILED"
    assert auth_rec.json()["ui_state"] == "RECONCILED"
    assert auth_rec.json()["reconciled_by"] == "finance-lead"

    # Second reconcile blocked (409)
    assert client.post(
        "/payments/youpi/reconcile",
        json={
            "order_code": "MU-WH-OBS",
            "decision": "RECONCILED",
            "verified_utr": "511223344556",
            "reviewer": "finance-lead",
        },
        headers={"Authorization": "Bearer admin_reconcile_token_xyz"},
    ).status_code == 409

    # 6. RECONCILED webhook with wrong amount rejected (422), valid RECONCILED -> RECONCILED
    bad_amt_raw, bad_amt_hdr = _sign_webhook(
        {
            "event": "RECONCILED",
            "deliveryId": "deliv-rec-bad",
            "orderId": "MU-WH-REC",
            "amount": "10.00",
            "currency": "INR",
            "utr": "622334455667",
            "settlementState": "RECONCILED",
        },
        secret,
    )
    assert client.post("/payments/youpi/webhook", content=bad_amt_raw, headers=bad_amt_hdr).status_code == 422

    good_rec_raw, good_rec_hdr = _sign_webhook(
        {
            "event": "RECONCILED",
            "deliveryId": "deliv-rec-ok",
            "orderId": "MU-WH-REC",
            "amount": "500.00",
            "currency": "INR",
            "utr": "622334455667",
            "settlementState": "RECONCILED",
        },
        secret,
    )
    good_rec = client.post("/payments/youpi/webhook", content=good_rec_raw, headers=good_rec_hdr)
    assert good_rec.status_code == 200
    assert good_rec.json()["payment_status"] == "RECONCILED"

    # 7. EXPIRED webhook transitions cleanly
    exp_raw, exp_hdr = _sign_webhook(
        {
            "event": "EXPIRED",
            "deliveryId": "deliv-exp-001",
            "orderId": "MU-WH-EXP",
            "amount": "199.00",
            "currency": "INR",
        },
        secret,
    )
    exp_resp = client.post("/payments/youpi/webhook", content=exp_raw, headers=exp_hdr)
    assert exp_resp.status_code == 200
    assert exp_resp.json()["status"] == "EXPIRED"


def test_multi_replica_redis_pubsub_across_three_api_instances():
    """Verify webhook broadcast on api2 is streamed live by api1 and api3 via Redis Pub/Sub."""
    broker = FakeRedisBroker()
    api1 = MultiReplicaOrderBroadcaster(redis_factory=broker.make_client)
    api2 = MultiReplicaOrderBroadcaster(redis_factory=broker.make_client)
    api3 = MultiReplicaOrderBroadcaster(redis_factory=broker.make_client)

    async def scenario():
        order_code = "MU-REPLICA-001"
        state = {
            "order_code": order_code,
            "ui_state": "QR_READY",
            "payment_status": "PENDING_VERIFICATION",
        }

        async def collect_stream(replica_broadcaster):
            received = []
            async for frame in replica_broadcaster.stream_events(
                order_code=order_code,
                snapshot_fn=lambda: dict(state),
                heartbeat_seconds=1.0,
            ):
                if frame.startswith("data: "):
                    received.append(json.loads(frame[len("data: "):].strip()))
                    if len(received) >= 2:
                        break
            return received

        t1 = asyncio.create_task(collect_stream(api1))
        t3 = asyncio.create_task(collect_stream(api3))
        await asyncio.sleep(0.05)

        # Simulate webhook or admin reconciliation hitting api2 behind Nginx round-robin
        updated_event = {
            "order_code": order_code,
            "ui_state": "RECONCILED",
            "payment_status": "RECONCILED",
            "settlement_state": "RECONCILED",
            "utr": "733445566778",
        }
        state.update(updated_event)
        result = await api2.broadcast(order_code, updated_event)
        assert result["redis_published"] is True

        frames_api1, frames_api3 = await asyncio.wait_for(asyncio.gather(t1, t3), timeout=3.0)
        assert frames_api1[-1]["ui_state"] == "RECONCILED"
        assert frames_api1[-1]["utr"] == "733445566778"
        assert frames_api3[-1]["ui_state"] == "RECONCILED"
        assert frames_api3[-1]["utr"] == "733445566778"

    asyncio.run(scenario())
