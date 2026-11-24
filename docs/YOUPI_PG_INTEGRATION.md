# YouPI-PG Self-Hosted UPI Integration Guide (`MANUAL_UPI` Default)

> **Project:** Zomato – AI-Powered Food Delivery Platform (`Mini-Uber-ETA` workspace)  
> **Gateway:** `gxurav1710/YouPI-PG` (cloned separately at `D:\Downloads\BEST AI PROJECTS\YouPI-PG`)  
> **Status:** Experimental / Academic Integration Only

> [!CAUTION]
> ## Deployment & Licensing Blockers — Read Before Any Real-Money Use
> 1. **Commercial License Blocker:** The audited `YouPI-PG/package.json` explicitly declares `"license": "Commercial"`. **Do not deploy to commercial or public production without obtaining licensing clarification/permission from the YouPI-PG copyright holder.**
> 2. **Not RBI / NPCI Certified:** YouPI-PG is an experimental self-hosted gateway, **not** an RBI-authorized Payment Aggregator or NPCI-certified switch.
> 3. **Alerts Are Not Settlement:** Neither customer-submitted UTRs nor SMS/Gmail notifications (`OBSERVED_SUCCESS`) constitute bank settlement proof. Every `MANUAL_UPI` order stays in **`PENDING_VERIFICATION`** until independently reconciled against official bank records.

---

## 1. Architecture (`MANUAL_UPI` Flow)

```text
React Checkout (CheckoutPage.jsx + UpiPaymentModal.jsx)
  │  1. POST /api/orders                  -> creates PENDING order in PostgreSQL
  │  2. POST /api/payments/youpi/order    -> fail-closed server-side session creation
  ▼
FastAPI Backend (api1 / api2 / api3 behind Nginx :8000)
  │  3. POST :6100/api/v1/payments        (headers: X-Merchant-Id, X-Merchant-Key, method: MANUAL_UPI)
  │  4. GET  :7000/checkout/<id>/qr.svg   -> proxied via GET /api/payments/youpi/qr/<order>.svg
  ▼
Customer Pays via UPI App & Submits UTR
  │  5. POST /api/payments/youpi/utr      -> forwarded to :6100/api/v1/checkout/<id>/manual-utr
  │     Order remains PENDING_VERIFICATION (settlement_state = UTR_SUBMITTED)
  ▼
Independent Bank Statement Verification / Signed Webhook
  │  6a. POST /api/payments/youpi/webhook (X-Gateway-Signature-V2 + X-Gateway-Timestamp + Delivery-Id)
  │      - MANUAL_REVIEW     -> keeps PENDING_VERIFICATION
  │      - OBSERVED_SUCCESS  -> keeps PENDING_VERIFICATION (OBSERVED_UNRECONCILED)
  │      - RECONCILED        -> transitions to RECONCILED (only when settlementState == RECONCILED)
  │  6b. POST /api/payments/youpi/reconcile (Authorization: Bearer <YOUPI_RECONCILE_ADMIN_TOKEN>)
  │      - Reviewer transitions PENDING_VERIFICATION -> RECONCILED or FAILED with verified UTR
  ▼
Redis Pub/Sub (`youpi:order_status:<order_code>`)
  └─▶ Multi-replica SSE stream (`GET /api/payments/youpi/status/<order_code>/stream`)
      updates connected browser regardless of which FastAPI replica handles the request.
```

---

## 2. Fail-Closed Security & Isolation Controls

- **Zero Fake Credentials or Mock QR Codes:** No fallback `merchant@upi`, no `api.qrserver.com`, and no payment simulation endpoints exist in production or development code. When YouPI-PG is unconfigured or offline, `/api/payments/youpi/order` fails closed with HTTP `503`.
- **Merchant Key Auth (`X-Merchant-Id` + `X-Merchant-Key`):** Stored strictly in server-side environment variables and never exposed via `GET /payments/youpi/config` or `VITE_*` client env vars.
- **Webhook Verification (`POST /payments/youpi/webhook`):**
  - Verifies HMAC-SHA256 over **exact raw request bytes** using `hmac.compare_digest`.
  - Supports both `X-Gateway-Signature-V2` (`hmac(secret, "${timestamp}.${rawBody}")`) and `X-Gateway-Signature`.
  - Enforces `X-Gateway-Timestamp` replay tolerance (`YOUPI_WEBHOOK_TOLERANCE_SECONDS`, default `300` seconds).
  - Enforces replay/idempotency deduplication via `X-Gateway-Delivery-Id` stored in unique column `webhook_event_id`.
  - Validates `currency == "INR"`, exact order total (`abs(amount - order.amount_inr) <= 0.01`), and unique UTR across orders inside PostgreSQL `SELECT ... FOR UPDATE` row locks.
- **Disabled Observers & Loopback Admin Surfaces:** Android APK observer (`com.youpi.observer`), Gmail OAuth (`6003`), Google Messages CDP (`6002`), and WhatsApp Berry Protocol are **not** required or enabled for `MANUAL_UPI`. Keep `6001`, `6002`, `6003`, and `8090` bound to `127.0.0.1` only.
- **Razorpay Untouched:** Existing Razorpay Test Mode endpoints remain intact alongside YouPI-PG.

---

## 3. Environment Variables (`.env` Placeholders Only)

Set these on your **FastAPI backend** `.env` (see [.env.example](../.env.example); never commit `.env`):

```env
YOUPI_API_URL=http://localhost:6100
YOUPI_CHECKOUT_URL=http://localhost:7000
YOUPI_MERCHANT_ID=
YOUPI_MERCHANT_API_KEY=
YOUPI_WEBHOOK_SECRET=
YOUPI_UPI_METHOD=MANUAL_UPI
YOUPI_WEBHOOK_TOLERANCE_SECONDS=300
YOUPI_RECONCILE_ADMIN_TOKEN=
```

> **Windows Docker Desktop Note:** When FastAPI runs inside `api1`–`api3` Docker containers while YouPI-PG runs in its own sibling Docker Compose stack exposing host ports `6100`/`7000`, set:
> - `YOUPI_API_URL=http://host.docker.internal:6100`
> - `YOUPI_CHECKOUT_URL=http://host.docker.internal:7000` (browser-visible `checkoutUrl` inside YouPI-PG stays `http://localhost:7000/...`).

---

## 4. Safe Additive Database Changes

Implemented safely in `src/models/db_models.py` (`CustomerOrder`) and `ensure_orders_table()` in `src/api/main.py` using advisory locks and idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements (never dropping or truncating existing data):

- `youpi_session_id VARCHAR(128)` (unique indexed)
- `youpi_payment_id VARCHAR(128)` (indexed)
- `youpi_checkout_url VARCHAR(500)`
- `utr VARCHAR(64)` (indexed)
- `webhook_event_id VARCHAR(128)` (unique indexed)
- `settlement_state VARCHAR(40)` (`INITIATED`, `QR_READY`, `UTR_SUBMITTED`, `OBSERVED_UNRECONCILED`, `RECONCILED`, `FAILED`, `EXPIRED`, `CANCELLED`)
- `reconciled_by VARCHAR(128)`
- `payment_confirmed_at TIMESTAMPTZ`

---

## 5. Backend Endpoints & Frontend UI States

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/payments/youpi/config` | `GET` | Public config flags & `MANUAL_UPI` notice (no secrets) |
| `/payments/youpi/order` | `POST` | Validates DB order & calls YouPI-PG `POST /api/v1/payments` |
| `/payments/youpi/qr/{order_code}.svg` | `GET` | Proxies dynamic vector SVG QR from YouPI-PG `:7000` |
| `/payments/youpi/utr` | `POST` | Validates & forwards UTR to `:6100/api/v1/checkout/:id/manual-utr` (keeps `PENDING_VERIFICATION`) |
| `/payments/youpi/webhook` | `POST` | Raw-byte HMAC-SHA256 + timestamp + delivery-ID deduplication |
| `/payments/youpi/reconcile` | `POST` | Bearer-protected independent reconciliation (`RECONCILED` / `FAILED`) |
| `/payments/youpi/status/{order_code}` | `GET` | Pollable order payment snapshot |
| `/payments/youpi/status/{order_code}/stream` | `GET` | Multi-replica Redis Pub/Sub SSE status stream |

**Frontend UI States (`frontend/src/components/UpiPaymentModal.jsx`):**
1. `Initiated` (`INITIATED`)
2. `QR Ready` (`QR_READY`)
3. `UTR Submitted` (`UTR_SUBMITTED`)
4. `Pending Verification` (`PENDING_VERIFICATION`)
5. `Reconciled` (`RECONCILED`)
6. `Failed` (`FAILED`)
7. `Expired` (`EXPIRED`)

---

## 6. Installation & Startup Procedure (Isolated Containers)

### Step A: Start Isolated YouPI-PG Stack (`node:24-alpine`)
> Local host Node `v22.17.0` is below YouPI-PG's `>= 24.22.1` engine requirement; running YouPI-PG via its own Docker Compose avoids host upgrades and keeps `Mini-Uber-ETA`'s Postgres, Redis, and Redpanda completely isolated.

```powershell
cd "D:\Downloads\BEST AI PROJECTS\YouPI-PG"
Copy-Item .env.example .env

# Configure strong secrets & storefront return origins inside YouPI-PG\.env:
#   YOUPI_ALLOWED_ORIGINS=http://localhost:4173,http://localhost:5173
#   YOUPI_ALLOWED_RETURN_ORIGINS=http://localhost:4173,http://localhost:5173
#   CHECKOUT_FRAME_ANCESTORS=http://localhost:4173 http://localhost:5173

docker compose up -d --build

# Verify YouPI-PG ports:
curl.exe -sS http://localhost:6100/health
curl.exe -sS http://localhost:7000/health
```

### Step B: Configure Merchant & Secrets
1. Open the loopback-only Merchant Admin dashboard on `http://127.0.0.1:6001` (never expose `6001` or `8090` publicly).
2. Configure your test receiving UPI VPA, webhook URL (`http://host.docker.internal:8000/payments/youpi/webhook`), merchant ID, API key, and webhook secret.
3. Copy `YOUPI_MERCHANT_ID`, `YOUPI_MERCHANT_API_KEY`, `YOUPI_WEBHOOK_SECRET`, and a strong generated `YOUPI_RECONCILE_ADMIN_TOKEN` into `Mini-Uber-ETA\.env`.
4. With explicit approval, rebuild only `api1`, `api2`, and `api3` in `Mini-Uber-ETA` (`docker compose up -d --build api1 api2 api3`) without touching `postgres`, `redis`, or `redpanda` volumes.

---

## 7. Verification & Testing

Run the automated test suite (mocked gateway HTTP + in-memory SQLite + multi-replica Redis Pub/Sub simulation):

```powershell
& "D:\Downloads\BEST AI PROJECTS\Mini-Uber-ETA\.venv\Scripts\python.exe" -m pytest tests/test_youpi_payments.py -v
```

Build the React frontend bundle:

```powershell
cd "D:\Downloads\BEST AI PROJECTS\Mini-Uber-ETA\frontend"
npm run build
```

---

## 8. Troubleshooting

| Symptom | Cause | Resolution |
| :--- | :--- | :--- |
| Checkout shows **"YouPI-PG Gateway Not Configured / Unavailable"** or `404` on `/payments/youpi/config` | Running `api1`–`api3` containers haven't been rebuilt with new routes, or `YOUPI_MERCHANT_ID`/`YOUPI_MERCHANT_API_KEY` are blank | Set `YOUPI_*` vars in `Mini-Uber-ETA\.env` and rebuild `api1 api2 api3` when approved |
| `503 YouPI-PG payment API is unreachable` | YouPI-PG container is not running on `:6100`, or container URL uses `localhost` instead of `host.docker.internal` | Start `D:\Downloads\BEST AI PROJECTS\YouPI-PG` and use `http://host.docker.internal:6100` inside `api1`–`api3` |
| QR image fails to load in modal | Checkout Portal `:7000` is down or `YOUPI_CHECKOUT_URL` points to wrong host/port | Verify `curl http://localhost:7000/health` returns `UP` |
| `401 Invalid webhook HMAC signature` or timestamp error | `YOUPI_WEBHOOK_SECRET` mismatch or clock drift > `300s` | Match `YOUPI_WEBHOOK_SECRET` in both `.env`/admin and check system UTC clock |
| Webhook `400/502` blocked by YouPI-PG SSRF guard | YouPI-PG blocks private/loopback webhook URLs in strict production mode | In local `YOUPI_MODE=localhost`, allow localhost/bridge webhook receiver; in production use HTTPS domain |
