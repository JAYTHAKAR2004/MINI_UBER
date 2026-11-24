from datetime import datetime, timezone

from sqlalchemy import Column, Integer, Float, String, DateTime, JSON
from src.database import Base


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
    restaurant_name = Column(String(200), nullable=False)
    customer_name = Column(String(150), nullable=False)
    customer_phone = Column(String(40), nullable=False)
    delivery_address = Column(String(500), nullable=False)
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
