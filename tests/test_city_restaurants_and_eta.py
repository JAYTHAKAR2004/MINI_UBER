"""Tests for strict 12-city restaurant filtering, catalog seeding, ETA validation, and cross-city order rejection."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.database import Base
from src.models.db_models import Restaurant
from src.restaurants.catalog import SUPPORTED_CITIES, seed_restaurants


TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    try:
        seed_restaurants(db)
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client(monkeypatch):
    import src.api.main as api_main

    monkeypatch.setattr(api_main, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(api_main, "ensure_orders_table", lambda: None)
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_unitKeyCity123")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "unitSecretCity999")

    with TestClient(api_main.app) as test_client:
        yield test_client


def test_seed_covers_all_12_cities_and_is_idempotent():
    db = TestingSessionLocal()
    try:
        # Re-seeding inserts 0 duplicates
        assert seed_restaurants(db) == 0
        total = db.query(Restaurant).count()
        assert total == 120
        for city_spec in SUPPORTED_CITIES:
            cnt = (
                db.query(Restaurant)
                .filter(Restaurant.city_normalized == city_spec["id"])
                .count()
            )
            assert cnt == 10, f"Expected 10 restaurants for {city_spec['name']}, got {cnt}"
    finally:
        db.close()


def test_city_filtering_prevents_cross_city_leakage(client):
    for expected_city in ("Bengaluru", "Mumbai", "Delhi", "Ahmedabad"):
        resp = client.get("/restaurants", params={"city": expected_city})
        assert resp.status_code == 200
        body = resp.json()
        assert body["count"] == 10
        assert len(body["restaurants"]) == 10
        assert all(r["city"] == expected_city for r in body["restaurants"])

    # Whitespace & alias normalization ("  new delhi  " -> Delhi only)
    alias_resp = client.get("/restaurants", params={"city": "  new delhi  "})
    assert alias_resp.status_code == 200
    alias_body = alias_resp.json()
    assert alias_body["city"] == "Delhi"
    assert alias_body["count"] == 10
    assert all(r["city"] == "Delhi" for r in alias_body["restaurants"])

    # Unknown city returns empty list (never silently falls back to Delhi or another city)
    unknown_resp = client.get("/restaurants", params={"city": "Atlantis"})
    assert unknown_resp.status_code == 200
    unknown_body = unknown_resp.json()
    assert unknown_body["count"] == 0
    assert unknown_body["restaurants"] == []


def test_cities_endpoint_reports_all_12_cities(client):
    resp = client.get("/cities")
    assert resp.status_code == 200
    cities = resp.json()["cities"]
    assert len(cities) == 12
    assert all(c["restaurantCount"] == 10 for c in cities)


def test_cross_city_order_rejected_and_same_city_accepted(client):
    # Fetch a Bengaluru restaurant
    blr = client.get("/restaurants", params={"city": "Bengaluru"}).json()["restaurants"][0]
    base_item = [{"id": blr["menu"][0]["id"], "name": blr["menu"][0]["name"], "price": 250.0, "quantity": 1}]

    # 1. Cross-city order on /orders (Bengaluru restaurant + Delhi city/coords)
    cross_resp = client.post(
        "/orders",
        json={
            "order_code": "MU-CROSS-01",
            "idempotency_key": "idem-cross-01",
            "restaurant_id": blr["id"],
            "restaurant_name": blr["name"],
            "selected_city": "Delhi",
            "delivery_city": "Delhi",
            "customer_name": "Test Customer",
            "customer_phone": "+91 98765 43210",
            "delivery_address": "Connaught Place, Delhi 110001",
            "restaurant_lat": blr["coordinates"]["lat"],
            "restaurant_lon": blr["coordinates"]["lng"],
            "delivery_lat": 28.6442,
            "delivery_lon": 77.2273,
            "items": base_item,
            "amount_inr": 250.0,
            "predicted_eta_minutes": 25.0,
            "payment_method": "cod",
            "payment_status": "COD_DEMO",
        },
    )
    assert cross_resp.status_code == 400
    assert "cross-city" in cross_resp.json()["detail"].lower()

    # 2. Cross-city order on /payments/razorpay/order (same city label, out-of-range Delhi coordinates)
    far_rzp = client.post(
        "/payments/razorpay/order",
        json={
            "order_code": "MU-CROSS-02",
            "idempotency_key": "idem-cross-02",
            "restaurant_id": blr["id"],
            "restaurant_name": blr["name"],
            "selected_city": "Bengaluru",
            "delivery_city": "Bengaluru",
            "customer_name": "Test Customer",
            "customer_phone": "+91 98765 43210",
            "delivery_address": "100 Feet Road, Indiranagar, Bengaluru",
            "restaurant_lat": blr["coordinates"]["lat"],
            "restaurant_lon": blr["coordinates"]["lng"],
            "delivery_lat": 28.6442,
            "delivery_lon": 77.2273,
            "items": base_item,
            "amount_inr": 250.0,
            "predicted_eta_minutes": 25.0,
            "payment_method": "razorpay",
            "payment_status": "PENDING",
        },
    )
    assert far_rzp.status_code == 400

    # 3. Same-city valid order succeeds
    ok_resp = client.post(
        "/orders",
        json={
            "order_code": "MU-OK-BLR-01",
            "idempotency_key": "idem-ok-blr-01",
            "restaurant_id": blr["id"],
            "restaurant_name": blr["name"],
            "selected_city": "Bengaluru",
            "delivery_city": "Bengaluru",
            "customer_name": "Test Customer",
            "customer_phone": "+91 98765 43210",
            "delivery_address": "100 Feet Road, Indiranagar, Bengaluru 560038",
            "restaurant_lat": blr["coordinates"]["lat"],
            "restaurant_lon": blr["coordinates"]["lng"],
            "delivery_lat": 12.9855,
            "delivery_lon": 77.6412,
            "items": base_item,
            "amount_inr": 250.0,
            "predicted_eta_minutes": 24.0,
            "payment_method": "cod",
            "payment_status": "COD_DEMO",
        },
    )
    assert ok_resp.status_code == 200
    order_data = ok_resp.json()["order"]
    assert order_data["city"] == "Bengaluru"
    assert order_data["restaurant_id"] == blr["id"]
    assert order_data["distance_km"] is not None and order_data["distance_km"] < 20


def test_unavailable_restaurant_rejected(client):
    db = TestingSessionLocal()
    try:
        target = db.query(Restaurant).filter_by(restaurant_key="mumbai-demo-01").first()
        target.delivery_available = False
        db.commit()
    finally:
        db.close()

    try:
        resp = client.post(
            "/orders",
            json={
                "order_code": "MU-UNAVAIL-01",
                "restaurant_id": "mumbai-demo-01",
                "restaurant_name": "Bandra West Spice Courtyard (Demo)",
                "selected_city": "Mumbai",
                "delivery_city": "Mumbai",
                "customer_name": "Test User",
                "customer_phone": "+91 98765 43210",
                "delivery_address": "Hill Road, Bandra West, Mumbai",
                "delivery_lat": 19.0821,
                "delivery_lon": 72.8411,
                "items": [{"id": "x1", "name": "Dish", "price": 200.0, "quantity": 1}],
                "amount_inr": 200.0,
                "payment_method": "cod",
                "payment_status": "COD_DEMO",
            },
        )
        assert resp.status_code == 400
        assert "not available" in resp.json()["detail"].lower()
    finally:
        db = TestingSessionLocal()
        try:
            target = db.query(Restaurant).filter_by(restaurant_key="mumbai-demo-01").first()
            target.delivery_available = True
            db.commit()
        finally:
            db.close()


def test_predict_eta_with_valid_and_invalid_coordinates(client, monkeypatch):
    import src.api.main as api_main

    monkeypatch.setattr(api_main, "publish_eta_event", lambda event: False)
    monkeypatch.setattr(api_main, "get_from_cache", lambda key: (None, "BYPASS"))
    monkeypatch.setattr(api_main, "save_to_cache", lambda key, val: False)

    blr = client.get("/restaurants", params={"city": "Bengaluru"}).json()["restaurants"][0]

    # Valid same-city coordinates succeed using trained Random Forest model
    ok_eta = client.post(
        "/predict",
        json={
            "restaurant_id": blr["id"],
            "selected_city": "Bengaluru",
            "restaurant_lat": blr["coordinates"]["lat"],
            "restaurant_lon": blr["coordinates"]["lng"],
            "delivery_lat": 12.9855,
            "delivery_lon": 77.6412,
            "Delivery_person_Age": 28,
            "Delivery_person_Ratings": 4.7,
            "Vehicle_condition": 2,
            "multiple_deliveries": 0,
            "order_time_missing": 0,
            "order_hour": 20,
            "order_day": 15,
            "order_month": 5,
            "order_weekday": 2,
            "Weather_conditions": "Cloudy",
            "Road_traffic_density": "Medium",
            "Type_of_order": "Meal",
            "Type_of_vehicle": "motorcycle",
            "Festival": "No",
            "City": "Metropolitian",
        },
    )
    assert ok_eta.status_code == 200
    eta_body = ok_eta.json()
    assert isinstance(eta_body["predicted_eta_minutes"], (int, float))
    assert eta_body["predicted_eta_minutes"] > 0

    # Invalid / out-of-bounds coordinates rejected (422), never invented
    bad_eta = client.post(
        "/predict",
        json={
            "restaurant_id": blr["id"],
            "selected_city": "Bengaluru",
            "delivery_lat": 0.0,
            "delivery_lon": 0.0,
            "City": "Metropolitian",
        },
    )
    assert bad_eta.status_code == 422

    # Missing coordinates when restaurant_id supplied -> 422
    missing_eta = client.post(
        "/predict",
        json={
            "restaurant_id": blr["id"],
            "selected_city": "Bengaluru",
            "City": "Metropolitian",
        },
    )
    assert missing_eta.status_code == 422

    # Cross-city ETA call -> 400
    cross_eta = client.post(
        "/predict",
        json={
            "restaurant_id": blr["id"],
            "selected_city": "Delhi",
            "delivery_lat": 28.6442,
            "delivery_lon": 77.2273,
            "City": "Metropolitian",
        },
    )
    assert cross_eta.status_code == 400
