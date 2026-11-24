"""Automated test suite for Razorpay Test Mode and Demo COD order endpoints.

Covers:
1. Public Razorpay config endpoint (configured=True, mode="test", no secret leakage)
2. Razorpay order creation creating PENDING DB order + returning key_id/order_id/mode="test" + idempotency
3. Valid HMAC-SHA256 signature verification transitioning order to PAID_TEST (and idempotent retry)
4. Invalid HMAC-SHA256 signature rejection (HTTP 400) marking order FAILED (never PAID_TEST)
5. Demo COD order persistence (/orders with payment_status="COD_DEMO")
"""
import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.database import Base
from src.models.db_models import CustomerOrder


TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


class MockRazorpayResponse:
    def __init__(self, status_code: int, json_body: dict):
        self.status_code = status_code
        self._json_body = json_body
        self.text = json.dumps(json_body)

    def json(self):
        return self._json_body


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def razorpay_env(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_unitTestKey123")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "unitTestSecretSuperPrivate999")


@pytest.fixture
def client(monkeypatch, razorpay_env):
    import src.api.main as api_main

    monkeypatch.setattr(api_main, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(api_main, "ensure_orders_table", lambda: None)

    with TestClient(api_main.app) as test_client:
        yield test_client


def test_razorpay_config_never_leaks_secret(client):
    resp = client.get("/payments/razorpay/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["mode"] == "test"
    assert data["key_id"] == "rzp_test_unitTestKey123"
    assert "unitTestSecretSuperPrivate999" not in json.dumps(data)


def test_razorpay_order_verify_and_idempotency(client, monkeypatch):
    import src.api.main as api_main

    captured_auth = []

    def fake_httpx_post(url, auth=None, json=None, timeout=10.0):
        assert url == "https://api.razorpay.com/v1/orders"
        captured_auth.append(auth)
        return MockRazorpayResponse(
            200,
            {
                "id": "order_RzpTest001",
                "amount": json["amount"],
                "currency": json["currency"],
                "receipt": json["receipt"],
            },
        )

    monkeypatch.setattr(api_main.httpx, "post", fake_httpx_post)

    order_payload = {
        "order_code": "MU-RZP-1001",
        "idempotency_key": "idem-rzp-1001",
        "restaurant_name": "Forno Neapolitan Kitchen",
        "customer_name": "Test User",
        "customer_phone": "+91 98765 43210",
        "delivery_address": "Indiranagar, Bengaluru",
        "items": [{"id": "m1", "name": "Margherita", "price": 320.0, "quantity": 1}],
        "amount_inr": 320.0,
        "predicted_eta_minutes": 26.0,
        "payment_method": "razorpay",
        "payment_status": "PENDING",
    }

    create_resp = client.post("/payments/razorpay/order", json=order_payload)
    assert create_resp.status_code == 200
    created = create_resp.json()
    assert created["razorpay_order_id"] == "order_RzpTest001"
    assert created["amount"] == 32000
    assert created["currency"] == "INR"
    assert created["key_id"] == "rzp_test_unitTestKey123"
    assert created["mode"] == "test"
    assert captured_auth == [("rzp_test_unitTestKey123", "unitTestSecretSuperPrivate999")]

    # Idempotent retry returns the same Razorpay order without making a second API call
    retry_resp = client.post("/payments/razorpay/order", json=order_payload)
    assert retry_resp.status_code == 200
    assert retry_resp.json()["razorpay_order_id"] == "order_RzpTest001"
    assert len(captured_auth) == 1

    # Order stays PENDING in DB until backend signature verification runs
    db = TestingSessionLocal()
    try:
        db_row = db.query(CustomerOrder).filter_by(order_code="MU-RZP-1001").first()
        assert db_row is not None
        assert db_row.payment_status == "PENDING"
    finally:
        db.close()

    payment_id = "pay_RzpTestSuccess001"
    valid_sig = hmac.new(
        b"unitTestSecretSuperPrivate999",
        f"order_RzpTest001|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    verify_resp = client.post(
        "/payments/razorpay/verify",
        json={
            "order_code": "MU-RZP-1001",
            "razorpay_order_id": "order_RzpTest001",
            "razorpay_payment_id": payment_id,
            "razorpay_signature": valid_sig,
        },
    )
    assert verify_resp.status_code == 200
    verified = verify_resp.json()
    assert verified["verified"] is True
    assert verified["mode"] == "test"
    assert verified["payment_status"] == "PAID_TEST"
    assert verified["order_status"] == "Restaurant confirmed"
    assert verified["razorpay_payment_id"] == payment_id

    # Repeat verification with same payment_id is idempotent
    verify_again = client.post(
        "/payments/razorpay/verify",
        json={
            "order_code": "MU-RZP-1001",
            "razorpay_order_id": "order_RzpTest001",
            "razorpay_payment_id": payment_id,
            "razorpay_signature": valid_sig,
        },
    )
    assert verify_again.status_code == 200
    assert verify_again.json()["payment_status"] == "PAID_TEST"


def test_razorpay_invalid_signature_marks_failed(client, monkeypatch):
    import src.api.main as api_main

    monkeypatch.setattr(
        api_main.httpx,
        "post",
        lambda *args, **kwargs: MockRazorpayResponse(
            200,
            {"id": "order_RzpTestBadSig", "amount": 15000, "currency": "INR"},
        ),
    )

    create_resp = client.post(
        "/payments/razorpay/order",
        json={
            "order_code": "MU-RZP-FAIL-1",
            "idempotency_key": "idem-rzp-fail-1",
            "restaurant_name": "Burger Lab",
            "customer_name": "Test User",
            "customer_phone": "+91 98765 43210",
            "delivery_address": "Indiranagar, Bengaluru",
            "items": [{"id": "b1", "name": "Smash Burger", "price": 150.0, "quantity": 1}],
            "amount_inr": 150.0,
            "payment_method": "card",
            "payment_status": "PENDING",
        },
    )
    assert create_resp.status_code == 200

    bad_verify = client.post(
        "/payments/razorpay/verify",
        json={
            "order_code": "MU-RZP-FAIL-1",
            "razorpay_order_id": "order_RzpTestBadSig",
            "razorpay_payment_id": "pay_Forged001",
            "razorpay_signature": "0" * 64,
        },
    )
    assert bad_verify.status_code == 400

    db = TestingSessionLocal()
    try:
        db_row = db.query(CustomerOrder).filter_by(order_code="MU-RZP-FAIL-1").first()
        assert db_row is not None
        assert db_row.payment_status == "FAILED"
        assert db_row.razorpay_payment_id is None
    finally:
        db.close()


def test_demo_cod_order_still_works(client):
    resp = client.post(
        "/orders",
        json={
            "order_code": "MU-COD-1001",
            "idempotency_key": "idem-cod-1001",
            "restaurant_name": "Biryani House",
            "customer_name": "Test User",
            "customer_phone": "+91 98765 43210",
            "delivery_address": "Indiranagar, Bengaluru",
            "items": [{"id": "c1", "name": "Veg Biryani", "price": 240.0, "quantity": 1}],
            "amount_inr": 240.0,
            "predicted_eta_minutes": 22.0,
            "payment_method": "cod",
            "payment_status": "COD_DEMO",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["order"]["payment_status"] == "COD_DEMO"
    assert body["order"]["payment_method"] == "cod"
