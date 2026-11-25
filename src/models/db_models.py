from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, JSON, String
from src.database import Base


class Restaurant(Base):
    __tablename__ = "restaurants"

    id = Column(Integer, primary_key=True, index=True)
    restaurant_key = Column(String(64), unique=True, index=True, nullable=False)
    slug = Column(String(160), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    city = Column(String(80), nullable=False)
    city_normalized = Column(String(80), index=True, nullable=False)
    model_city = Column(String(40), nullable=False, default="Metropolitian")
    area = Column(String(120), nullable=False)
    address = Column(String(400), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    cuisine = Column(String(200), nullable=False)
    categories = Column(JSON, nullable=False)
    rating = Column(Float, nullable=False, default=4.5)
    review_count = Column(Integer, nullable=False, default=500)
    delivery_available = Column(Boolean, nullable=False, default=True)
    avg_prep_time_minutes = Column(Integer, nullable=False, default=22)
    delivery_fee = Column(Integer, nullable=False, default=25)
    cost_for_two = Column(Integer, nullable=False, default=500)
    is_pure_veg = Column(Boolean, nullable=False, default=False)
    dining_out = Column(Boolean, nullable=False, default=True)
    offer = Column(String(120), nullable=True)
    open_hours = Column(String(80), nullable=False, default="10:30 AM – 11:30 PM")
    image = Column(String(500), nullable=False)
    hero_image = Column(String(500), nullable=False)
    gallery = Column(JSON, nullable=False)
    menu = Column(JSON, nullable=False)
    is_demo = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ETAPrediction(Base):
    __tablename__ = "eta_predictions"

    id = Column(Integer, primary_key=True, index=True)

    input_features = Column(JSON, nullable=False)

    predicted_eta_minutes = Column(Float, nullable=False)

    model_name = Column(String(100), nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class CustomerOrder(Base):
    __tablename__ = "customer_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_code = Column(String(64), unique=True, index=True, nullable=False)
    idempotency_key = Column(String(128), unique=True, index=True, nullable=True)
    restaurant_id = Column(String(64), index=True, nullable=True)
    restaurant_name = Column(String(200), nullable=False)
    city = Column(String(80), index=True, nullable=True)
    customer_name = Column(String(150), nullable=False)
    customer_phone = Column(String(40), nullable=False)
    delivery_address = Column(String(500), nullable=False)
    restaurant_lat = Column(Float, nullable=True)
    restaurant_lon = Column(Float, nullable=True)
    delivery_lat = Column(Float, nullable=True)
    delivery_lon = Column(Float, nullable=True)
    distance_km = Column(Float, nullable=True)
    items = Column(JSON, nullable=False)
    amount_inr = Column(Float, nullable=False)
    predicted_eta_minutes = Column(Float, nullable=True)
    payment_method = Column(String(64), nullable=False)
    payment_status = Column(String(32), nullable=False, default="PENDING")
    order_status = Column(String(64), nullable=False, default="Order placed")
    razorpay_order_id = Column(String(128), unique=True, index=True, nullable=True)
    razorpay_payment_id = Column(String(128), nullable=True)

    # YouPI-PG Self-Hosted UPI Payment Gateway Integration
    youpi_session_id = Column(String(128), unique=True, index=True, nullable=True)
    youpi_payment_id = Column(String(128), index=True, nullable=True)
    youpi_checkout_url = Column(String(500), nullable=True)
    utr = Column(String(64), index=True, nullable=True)
    webhook_event_id = Column(String(128), unique=True, index=True, nullable=True)
    settlement_state = Column(String(40), nullable=True)
    reconciled_by = Column(String(128), nullable=True)
    payment_confirmed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
