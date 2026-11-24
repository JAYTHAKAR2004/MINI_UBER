

import asyncio
import os
import json
import hashlib
import socket
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

import joblib

import numpy as np

import pandas as pd

import redis
from strawberry.fastapi import GraphQLRouter
from src.api.graphql_schema import schema

from fastapi import FastAPI, HTTPException, Request, Response
from starlette.responses import StreamingResponse

from pydantic import BaseModel, Field

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError

from src.resilience.circuit_breaker import CircuitBreaker

from src.database import SessionLocal

from src.models.db_models import ETAPrediction

from src.messaging.kafka_producer import publish_eta_event

# Project paths

ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = ROOT / "models" / "eta_model.joblib"

INSTANCE_ID = os.getenv("HOSTNAME", socket.gethostname())

# Redis configuration

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")

REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

CACHE_TTL = 300

redis_client = redis.Redis(

          host=REDIS_HOST,

          port=REDIS_PORT,

          decode_responses=True,

          socket_connect_timeout=1,

          socket_timeout=1,

)

# Redis Circuit Breaker

redis_circuit_breaker = CircuitBreaker(

          failure_threshold=3,

          recovery_timeout=5,

)

# Feature order must match the training pipeline.

NUMERIC_FEATURES = [

          "Delivery_person_Age",

          "Delivery_person_Ratings",

          "Vehicle_condition",

          "multiple_deliveries",

          "distance_km",

          "coordinates_valid",

          "order_time_missing",

          "order_hour",

          "order_day",

          "order_month",

          "order_weekday",

]

CATEGORICAL_FEATURES = [

          "Weather_conditions",

          "Road_traffic_density",

          "Type_of_order",

          "Type_of_vehicle",

          "Festival",

          "City",

]

FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

# Load trained model

model = None

try:

          model = joblib.load(MODEL_PATH)

except Exception as exc:

          print(f"Model loading failed: {exc}")

app = FastAPI(

          title="Mini Uber ETA Prediction API",

          description="Predict food delivery time using a trained ML model.",

          version="1.3.0",

)
graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")

class ETAPredictionRequest(BaseModel):

          Delivery_person_Age: Optional[float] = None

          Delivery_person_Ratings: Optional[float] = None

          Vehicle_condition: Optional[float] = None

          multiple_deliveries: Optional[float] = None

          distance_km: Optional[float] = Field(default=None, ge=0)

          coordinates_valid: Optional[int] = Field(default=None, ge=0, le=1)

          order_time_missing: Optional[int] = Field(default=None, ge=0, le=1)

          order_hour: Optional[float] = Field(default=None, ge=0, le=23)

          order_day: Optional[int] = Field(default=None, ge=1, le=31)

          order_month: Optional[int] = Field(default=None, ge=1, le=12)

          order_weekday: Optional[int] = Field(default=None, ge=0, le=6)

          Weather_conditions: Optional[str] = None

          Road_traffic_density: Optional[str] = None

          Type_of_order: Optional[str] = None

          Type_of_vehicle: Optional[str] = None

          Festival: Optional[str] = None

          City: Optional[str] = None

def generate_cache_key(input_data):

          """Generate a deterministic cache key from prediction inputs."""

          serialized_data = json.dumps(

                    input_data,

                    sort_keys=True,

                    separators=(",", ":"),

          )

          input_hash = hashlib.sha256(

                    serialized_data.encode("utf-8")

          ).hexdigest()

          return f"eta:rf-v1:{input_hash}"

# Redis Circuit Breaker helper functions

def get_from_cache(cache_key):

          """Read Redis cache through the circuit breaker."""

          if not redis_circuit_breaker.allow_request():

                    return None, "BYPASS"

          try:

                    cached_value = redis_client.get(cache_key)

                    redis_circuit_breaker.record_success()

                    if cached_value is not None:

                              return cached_value, "HIT"

                    return None, "MISS"

          except redis.RedisError as exc:

                    redis_circuit_breaker.record_failure()

                    print(f"Redis read failed: {exc}")

                    return None, "BYPASS"

def save_to_cache(cache_key, predicted_eta):

          """Write prediction to Redis through the circuit breaker."""

          if not redis_circuit_breaker.allow_request():

                    return False

          try:

                    redis_client.setex(

                              cache_key,

                              CACHE_TTL,

                              str(predicted_eta),

                    )

                    redis_circuit_breaker.record_success()

                    return True

          except redis.RedisError as exc:

                    redis_circuit_breaker.record_failure()

                    print(f"Redis write failed: {exc}")

                    return False

@app.get("/")

def root():

          return {

                    "message": "Mini Uber ETA Prediction API",

                    "instance": INSTANCE_ID,

                    "status": "running",

                    "version": "1.3.0",

                    "docs": "/docs",

          }

@app.get("/health")

def health():

          return {

                    "status": "healthy" if model is not None else "unhealthy",

                    "model_loaded": model is not None,

                    "instance": INSTANCE_ID,

                    "redis_circuit": redis_circuit_breaker.state.value,

          }

@app.post("/predict")

def predict_eta(request: ETAPredictionRequest):

          request_start = time.perf_counter()

          def log_stage(message):

                    elapsed = time.perf_counter() - request_start

                    print(

                              f"[PREDICT DEBUG] +{elapsed:.3f}s | {message}",

                              flush=True

                    )

          log_stage("Request received")

          if model is None:

                    raise HTTPException(

                              status_code=503,

                              detail="ETA model is not available.",

                    )

          input_data = request.model_dump()

          if all(value is None for value in input_data.values()):

                    raise HTTPException(

                              status_code=422,

                              detail="At least one prediction feature must be provided.",

                    )

          try:

                    # 1. Generate cache key

                    cache_key = generate_cache_key(input_data)

                    predicted_eta = None

                    # 2. Redis cache lookup

                    log_stage("Starting Redis cache lookup")

                    cached_value, cache_status = get_from_cache(cache_key)

                    log_stage(f"Redis lookup completed: {cache_status}")

                    if cached_value is not None:

                              predicted_eta = float(cached_value)

                    # 3. ML prediction

                    if predicted_eta is None:

                              log_stage("Starting ML prediction")

                              input_df = pd.DataFrame(

                                        [input_data],

                                        columns=FEATURES,

                              )

                              for col in CATEGORICAL_FEATURES:

                                        input_df[col] = input_df[col].astype(object).where(

                                                  input_df[col].notna(), np.nan

                                        )

                              prediction = float(model.predict(input_df)[0])

                              predicted_eta = round(max(0, prediction), 2)

                              log_stage(f"ML prediction completed: {predicted_eta} minutes")

                              # 4. Redis cache write

                              if cache_status != "BYPASS":

                                        log_stage("Starting Redis cache write")

                                        cache_saved = save_to_cache(

                                                  cache_key,

                                                  predicted_eta,

                                        )

                                        if not cache_saved:

                                                  cache_status = "BYPASS"

                                        log_stage(f"Redis write completed: {cache_status}")

                    # 5. PostgreSQL persistence

                    log_stage("Creating PostgreSQL session")

                    db = SessionLocal()

                    try:

                              record = ETAPrediction(

                                        input_features=input_data,

                                        predicted_eta_minutes=predicted_eta,

                                        model_name="Random Forest",

                              )

                              db.add(record)

                              log_stage("Starting PostgreSQL commit")

                              db.commit()

                              log_stage("PostgreSQL commit completed")

                              db.refresh(record)

                              prediction_id = record.id

                              log_stage(f"PostgreSQL refresh completed: ID {prediction_id}")

                    except SQLAlchemyError as exc:

                              db.rollback()

                              log_stage(f"PostgreSQL failed: {exc}")

                              raise HTTPException(

                                        status_code=503,

                                        detail="Prediction generated, but database storage failed.",

                              )

                    finally:

                              db.close()

                              log_stage("PostgreSQL session closed")

                    # 6. Kafka publishing

                    kafka_status = "FAILED"

                    try:

                              log_stage("Starting Kafka publishing")

                              event_published = publish_eta_event({

                                        "event_type": "ETA_PREDICTION_CREATED",

                                        "prediction_id": prediction_id,

                                        "instance": INSTANCE_ID,

                                        "predicted_eta_minutes": predicted_eta,

                                        "model_name": "Random Forest",

                                        "input_features": input_data,

                              })

                              if event_published:

                                        kafka_status = "PUBLISHED"

                              log_stage(f"Kafka publishing completed: {kafka_status}")

                    except Exception as exc:

                              log_stage(f"Kafka publishing failed: {exc}")

                    # 7. Return response

                    total_time = time.perf_counter() - request_start

                    log_stage(f"Request completed successfully in {total_time:.3f}s")

                    return {

                              "prediction_id": prediction_id,

                              "predicted_eta_minutes": predicted_eta,

                              "unit": "minutes",

                              "model": "Random Forest",

                              "storage": "PostgreSQL",

                              "cache": {

                                        "status": cache_status,

                                        "ttl_seconds": CACHE_TTL,

                                        "circuit_state": redis_circuit_breaker.state.value,

                              },

                              "kafka": {

                                        "topic": "eta-predictions",

                                        "status": kafka_status,

                              },

                              "processing_time_seconds": round(total_time, 3),

                    }

          except HTTPException:

                    raise

          except Exception as exc:

                    log_stage(f"Unexpected prediction error: {exc}")

                    raise HTTPException(

                              status_code=500,

                              detail=f"Prediction failed: {str(exc)}",

                    )

from pydantic import BaseModel, Field


class ETAPredictionUpdate(BaseModel):
    input_features: Optional[dict] = None
    predicted_eta_minutes: Optional[float] = Field(default=None, gt=0)
    model_name: Optional[str] = Field(default=None, min_length=1, max_length=100)


def prediction_to_dict(record):
    return {
        "prediction_id": record.id,
        "input_features": record.input_features,
        "predicted_eta_minutes": record.predicted_eta_minutes,
        "model_name": record.model_name,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


@app.get("/predictions")
def get_predictions(limit: int = 100, offset: int = 0):
    if limit < 1 or limit > 500 or offset < 0:
        raise HTTPException(
            status_code=422,
            detail="limit must be 1-500 and offset must be non-negative."
        )

    db = SessionLocal()
    try:
        total = db.query(ETAPrediction).count()
        records = (
            db.query(ETAPrediction)
            .order_by(ETAPrediction.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "predictions": [prediction_to_dict(record) for record in records],
        }
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database read failed.")
    finally:
        db.close()


@app.get("/predictions/{prediction_id}")
def get_prediction(prediction_id: int):
    db = SessionLocal()
    try:
        record = db.query(ETAPrediction).filter(
            ETAPrediction.id == prediction_id
        ).first()

        if record is None:
            raise HTTPException(status_code=404, detail="Prediction not found.")

        return prediction_to_dict(record)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database read failed.")
    finally:
        db.close()


@app.patch("/predictions/{prediction_id}")
def update_prediction(prediction_id: int, payload: ETAPredictionUpdate):
    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(status_code=400, detail="No update fields provided.")

    if any(value is None for value in updates.values()):
        raise HTTPException(status_code=422, detail="Update values cannot be null.")

    db = SessionLocal()
    try:
        record = db.query(ETAPrediction).filter(
            ETAPrediction.id == prediction_id
        ).first()

        if record is None:
            raise HTTPException(status_code=404, detail="Prediction not found.")

        for field, value in updates.items():
            setattr(record, field, value)

        db.commit()
        db.refresh(record)

        return {
            "message": "Prediction updated successfully.",
            "prediction": prediction_to_dict(record),
        }
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database update failed.")
    finally:
        db.close()


@app.delete("/predictions/{prediction_id}")
def delete_prediction(prediction_id: int):
    db = SessionLocal()
    try:
        record = db.query(ETAPrediction).filter(
            ETAPrediction.id == prediction_id
        ).first()

        if record is None:
            raise HTTPException(status_code=404, detail="Prediction not found.")

        db.delete(record)
        db.commit()

        return {
            "message": "Prediction deleted successfully.",
            "prediction_id": prediction_id,
        }
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database delete failed.")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Additive Customer Orders & Razorpay Test-Mode Payment Integration
# ---------------------------------------------------------------------------
import hmac
import httpx
from src.database import engine, Base
from src.models.db_models import CustomerOrder



def ensure_orders_table():
    """Safely initialize and additively migrate application tables across API instances."""
    with engine.begin() as connection:
        is_postgres = connection.dialect.name == "postgresql"
        if is_postgres:
            # Serialize database initialization across API instances.
            connection.exec_driver_sql(
                "SELECT pg_advisory_xact_lock(7420192601)"
            )

        # Create missing tables only after acquiring the lock.
        Base.metadata.create_all(bind=connection)

        if is_postgres:
            additive_statements = [
                "ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS youpi_session_id VARCHAR(128)",
                "ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS youpi_payment_id VARCHAR(128)",
                "ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS youpi_checkout_url VARCHAR(500)",
                "ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS utr VARCHAR(64)",
                "ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS webhook_event_id VARCHAR(128)",
                "ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS settlement_state VARCHAR(40)",
                "ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS reconciled_by VARCHAR(128)",
                "ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ",
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_customer_orders_youpi_session_id ON customer_orders (youpi_session_id)",
                "CREATE INDEX IF NOT EXISTS ix_customer_orders_youpi_payment_id ON customer_orders (youpi_payment_id)",
                "CREATE INDEX IF NOT EXISTS ix_customer_orders_utr ON customer_orders (utr)",
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_customer_orders_webhook_event_id ON customer_orders (webhook_event_id)",
            ]
            for stmt in additive_statements:
                connection.exec_driver_sql(stmt)


@app.on_event("startup")
def initialize_database():
    """Initialize database tables when each API instance starts."""
    try:
        ensure_orders_table()
    except SQLAlchemyError as exc:
        print(f"Database startup initialization skipped: {exc}")



def get_razorpay_credentials():
    key_id = (os.getenv("RAZORPAY_KEY_ID") or "").strip()
    key_secret = (os.getenv("RAZORPAY_KEY_SECRET") or "").strip()
    return key_id, key_secret


class CustomerOrderCreateRequest(BaseModel):
    order_code: str = Field(min_length=3, max_length=64)
    idempotency_key: Optional[str] = Field(default=None, max_length=128)
    restaurant_name: str = Field(min_length=1, max_length=200)
    customer_name: str = Field(min_length=1, max_length=150)
    customer_phone: str = Field(min_length=5, max_length=40)
    delivery_address: str = Field(min_length=3, max_length=500)
    items: list = Field(min_length=1)
    amount_inr: float = Field(gt=0)
    predicted_eta_minutes: Optional[float] = Field(default=None, ge=0)
    payment_method: str = Field(min_length=1, max_length=64)
    payment_status: Optional[str] = Field(default="DEMO", max_length=32)


class RazorpayVerifyRequest(BaseModel):
    order_code: str = Field(min_length=3, max_length=64)
    razorpay_order_id: str = Field(min_length=3, max_length=128)
    razorpay_payment_id: str = Field(min_length=3, max_length=128)
    razorpay_signature: str = Field(min_length=10, max_length=256)


def customer_order_to_dict(record: CustomerOrder) -> dict:
    return {
        "id": record.id,
        "order_code": record.order_code,
        "idempotency_key": record.idempotency_key,
        "restaurant_name": record.restaurant_name,
        "customer_name": record.customer_name,
        "customer_phone": record.customer_phone,
        "delivery_address": record.delivery_address,
        "items": record.items,
        "amount_inr": record.amount_inr,
        "predicted_eta_minutes": record.predicted_eta_minutes,
        "payment_method": record.payment_method,
        "payment_status": record.payment_status,
        "order_status": record.order_status,
        "razorpay_order_id": record.razorpay_order_id,
        "razorpay_payment_id": record.razorpay_payment_id,
        "youpi_session_id": record.youpi_session_id,
        "youpi_payment_id": record.youpi_payment_id,
        "youpi_checkout_url": record.youpi_checkout_url,
        "utr": record.utr,
        "webhook_event_id": record.webhook_event_id,
        "settlement_state": record.settlement_state,
        "reconciled_by": record.reconciled_by,
        "payment_confirmed_at": record.payment_confirmed_at.isoformat() if record.payment_confirmed_at else None,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


@app.get("/payments/razorpay/config")
def razorpay_config():
    key_id, key_secret = get_razorpay_credentials()
    configured = bool(key_id and key_secret)
    return {
        "configured": configured,
        "mode": "test" if not key_id or key_id.startswith("rzp_test_") else "configured",
        "key_id": key_id if configured else None,
    }


@app.post("/payments/razorpay/order")
def create_razorpay_order(payload: CustomerOrderCreateRequest):
    key_id, key_secret = get_razorpay_credentials()
    if not key_id or not key_secret:
        raise HTTPException(
            status_code=503,
            detail="Razorpay test credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured on the backend.",
        )

    try:
        ensure_orders_table()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database initialization failed: {exc}")

    db = SessionLocal()
    try:
        if payload.idempotency_key:
            existing = (
                db.query(CustomerOrder)
                .filter(CustomerOrder.idempotency_key == payload.idempotency_key)
                .first()
            )
            if existing and existing.razorpay_order_id:
                if existing.payment_status == "PAID_TEST":
                    raise HTTPException(
                        status_code=409,
                        detail="This order has already been paid and confirmed.",
                    )
                return {
                    "razorpay_order_id": existing.razorpay_order_id,
                    "amount": int(round(existing.amount_inr * 100)),
                    "currency": "INR",
                    "key_id": key_id,
                    "order_code": existing.order_code,
                    "mode": "test",
                }

        amount_paise = int(round(payload.amount_inr * 100))
        if amount_paise < 100:
            raise HTTPException(status_code=422, detail="Minimum Razorpay order amount is ₹1.00 (100 paise).")

        response = httpx.post(
            "https://api.razorpay.com/v1/orders",
            auth=(key_id, key_secret),
            json={
                "amount": amount_paise,
                "currency": "INR",
                "receipt": payload.order_code[:40],
                "notes": {
                    "project": "Mini-Uber-ETA",
                    "restaurant": payload.restaurant_name[:80],
                },
            },
            timeout=10.0,
        )

        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Razorpay order creation failed ({response.status_code}): {response.text}",
            )

        rzp_order = response.json()
        rzp_order_id = rzp_order.get("id")
        if not rzp_order_id:
            raise HTTPException(status_code=502, detail="Razorpay did not return an order ID.")

        record = CustomerOrder(
            order_code=payload.order_code,
            idempotency_key=payload.idempotency_key,
            restaurant_name=payload.restaurant_name,
            customer_name=payload.customer_name,
            customer_phone=payload.customer_phone,
            delivery_address=payload.delivery_address,
            items=payload.items,
            amount_inr=payload.amount_inr,
            predicted_eta_minutes=payload.predicted_eta_minutes,
            payment_method=payload.payment_method,
            payment_status="PENDING",
            order_status="Order placed",
            razorpay_order_id=rzp_order_id,
        )
        db.add(record)
        db.commit()

        return {
            "razorpay_order_id": rzp_order_id,
            "amount": amount_paise,
            "currency": "INR",
            "key_id": key_id,
            "order_code": payload.order_code,
            "mode": "test",
        }
    except HTTPException:
        db.rollback()
        raise
    except httpx.HTTPError as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"Unable to reach Razorpay API: {exc}")
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Database error saving payment order: {exc}")
    finally:
        db.close()


@app.post("/payments/razorpay/verify")
def verify_razorpay_payment(payload: RazorpayVerifyRequest):
    _, key_secret = get_razorpay_credentials()
    if not key_secret:
        raise HTTPException(
            status_code=503,
            detail="RAZORPAY_KEY_SECRET is not configured on the backend.",
        )

    db = SessionLocal()
    try:
        record = (
            db.query(CustomerOrder)
            .filter(
                CustomerOrder.order_code == payload.order_code,
                CustomerOrder.razorpay_order_id == payload.razorpay_order_id,
            )
            .first()
        )
        if record is None:
            raise HTTPException(status_code=404, detail="Matching payment order not found.")

        if record.payment_status == "PAID_TEST" and record.razorpay_payment_id == payload.razorpay_payment_id:
            return {
                "verified": True,
                "mode": "test",
                "payment_status": record.payment_status,
                "order_status": record.order_status,
                "order_code": record.order_code,
                "razorpay_payment_id": record.razorpay_payment_id,
            }

        message = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8")
        expected_signature = hmac.new(
            key_secret.encode("utf-8"),
            message,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_signature, payload.razorpay_signature):
            record.payment_status = "FAILED"
            db.commit()
            raise HTTPException(status_code=400, detail="Invalid Razorpay payment signature.")

        record.payment_status = "PAID_TEST"
        record.order_status = "Restaurant confirmed"
        record.razorpay_payment_id = payload.razorpay_payment_id
        db.commit()

        return {
            "verified": True,
            "mode": "test",
            "payment_status": "PAID_TEST",
            "order_status": "Restaurant confirmed",
            "order_code": record.order_code,
            "razorpay_payment_id": record.razorpay_payment_id,
        }
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Database error verifying payment: {exc}")
    finally:
        db.close()


@app.post("/orders")
def create_customer_order(payload: CustomerOrderCreateRequest):
    allowed_statuses = {"DEMO", "COD_DEMO", "PENDING"}
    status_value = payload.payment_status if payload.payment_status in allowed_statuses else "DEMO"
    is_pending = status_value == "PENDING"

    try:
        ensure_orders_table()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database initialization failed: {exc}")

    db = SessionLocal()
    try:
        if payload.idempotency_key:
            existing = (
                db.query(CustomerOrder)
                .filter(CustomerOrder.idempotency_key == payload.idempotency_key)
                .first()
            )
            if existing:
                return {
                    "message": "Existing order returned (idempotent).",
                    "order": customer_order_to_dict(existing),
                }

        record = CustomerOrder(
            order_code=payload.order_code,
            idempotency_key=payload.idempotency_key,
            restaurant_name=payload.restaurant_name,
            customer_name=payload.customer_name,
            customer_phone=payload.customer_phone,
            delivery_address=payload.delivery_address,
            items=payload.items,
            amount_inr=payload.amount_inr,
            predicted_eta_minutes=payload.predicted_eta_minutes,
            payment_method=payload.payment_method,
            payment_status=status_value,
            order_status="Order placed" if is_pending else "Restaurant confirmed",
            settlement_state="INITIATED" if is_pending else None,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        return {
            "message": "Order stored successfully.",
            "order": customer_order_to_dict(record),
        }
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Database write failed: {exc}")
    finally:
        db.close()


@app.get("/orders")
def list_customer_orders(limit: int = 20):
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 100.")
    try:
        ensure_orders_table()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database initialization failed: {exc}")

    db = SessionLocal()
    try:
        records = (
            db.query(CustomerOrder)
            .order_by(CustomerOrder.id.desc())
            .limit(limit)
            .all()
        )
        return {"orders": [customer_order_to_dict(r) for r in records]}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database read failed: {exc}")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# YouPI-PG Self-Hosted UPI Payment Gateway Integration Endpoints (MANUAL_UPI)
# ---------------------------------------------------------------------------
from src.payments.youpi_service import (
    YouPIGatewayError,
    broadcaster,
    create_youpi_session,
    fetch_youpi_qr_svg,
    get_youpi_config,
    submit_youpi_manual_utr,
    validate_utr_format,
    verify_youpi_webhook,
)


class YouPIOrderInitRequest(BaseModel):
    order_code: str = Field(min_length=3, max_length=64)
    amount_inr: float = Field(gt=0)
    idempotency_key: Optional[str] = Field(default=None, max_length=128)
    customer_name: Optional[str] = "Customer"
    customer_phone: Optional[str] = ""
    return_url: Optional[str] = None


class YouPIUtrSubmitRequest(BaseModel):
    order_code: str = Field(min_length=3, max_length=64)
    utr: str = Field(min_length=6, max_length=35)


class YouPIReconcileRequest(BaseModel):
    order_code: str = Field(min_length=3, max_length=64)
    decision: Literal["RECONCILED", "FAILED"]
    verified_utr: str = Field(min_length=6, max_length=35)
    reviewer: str = Field(min_length=2, max_length=120)
    note: Optional[str] = Field(default=None, max_length=300)


def _derive_youpi_ui_state(record: CustomerOrder) -> str:
    if record.payment_status == "RECONCILED" or record.settlement_state == "RECONCILED":
        return "RECONCILED"
    if record.payment_status in ("FAILED", "EXPIRED", "CANCELLED"):
        return record.payment_status
    if record.settlement_state == "UTR_SUBMITTED":
        return "UTR_SUBMITTED"
    if record.payment_status == "PENDING_VERIFICATION" and (
        record.settlement_state == "OBSERVED_UNRECONCILED" or bool(record.utr)
    ):
        return "PENDING_VERIFICATION"
    if record.settlement_state == "QR_READY" or record.youpi_payment_id:
        return "QR_READY"
    return "INITIATED"


def _order_status_snapshot(record: CustomerOrder) -> dict:
    return {
        "order_code": record.order_code,
        "ui_state": _derive_youpi_ui_state(record),
        "payment_status": record.payment_status,
        "settlement_state": record.settlement_state or "INITIATED",
        "order_status": record.order_status,
        "utr": record.utr,
        "payment_id": record.youpi_payment_id,
        "checkout_url": record.youpi_checkout_url,
        "reconciled_by": record.reconciled_by,
        "payment_confirmed_at": (
            record.payment_confirmed_at.isoformat() if record.payment_confirmed_at else None
        ),
    }


def _load_order_snapshot_sync(order_code: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        record = (
            db.query(CustomerOrder)
            .filter(CustomerOrder.order_code == order_code)
            .first()
        )
        return _order_status_snapshot(record) if record else None
    finally:
        db.close()


@app.get("/payments/youpi/config")
def youpi_config():
    """Public configuration status for YouPI-PG MANUAL_UPI checkout (no secrets exposed)."""
    cfg = get_youpi_config()
    method = cfg["upi_method"]
    if not cfg["session_configured"]:
        notice = (
            "YouPI-PG merchant credentials (YOUPI_MERCHANT_ID and YOUPI_MERCHANT_API_KEY) "
            "are not configured on the backend."
        )
    elif not cfg["webhook_configured"]:
        notice = (
            "YouPI-PG session credentials are set, but YOUPI_WEBHOOK_SECRET is missing. "
            "Signed webhook verification fails closed until configured."
        )
    else:
        notice = (
            "YouPI-PG MANUAL_UPI configured. Orders remain PENDING_VERIFICATION after "
            "UTR submission or observer alerts until independently reconciled against bank records."
        )

    return {
        "configured": cfg["configured"],
        "session_configured": cfg["session_configured"],
        "webhook_configured": cfg["webhook_configured"],
        "method": method,
        "checkout_portal_configured": bool(cfg["checkout_url"]),
        "requires_manual_reconciliation": method == "MANUAL_UPI",
        "notice": notice,
    }


@app.post("/payments/youpi/order")
async def create_youpi_payment(payload: YouPIOrderInitRequest):
    """Create a real YouPI-PG session for an existing order (fail-closed if unavailable)."""
    try:
        ensure_orders_table()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database error: {exc}")

    db = SessionLocal()
    try:
        record = (
            db.query(CustomerOrder)
            .filter(CustomerOrder.order_code == payload.order_code)
            .with_for_update()
            .first()
        )
        if not record:
            raise HTTPException(
                status_code=404,
                detail=f"Order {payload.order_code} not found. Place order before initiating UPI payment.",
            )

        if record.payment_status in ("RECONCILED", "PAID_TEST"):
            raise HTTPException(
                status_code=409,
                detail="This order has already been reconciled/paid.",
            )

        if abs(record.amount_inr - payload.amount_inr) > 0.01:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Payment amount mismatch: order total is ₹{record.amount_inr:.2f}, "
                    f"requested ₹{payload.amount_inr:.2f}."
                ),
            )

        session = await create_youpi_session(
            order_code=record.order_code,
            amount_inr=record.amount_inr,
            customer_name=payload.customer_name or record.customer_name,
            customer_phone=payload.customer_phone or record.customer_phone,
            idempotency_key=payload.idempotency_key or record.idempotency_key,
            return_url=payload.return_url,
        )

        record.youpi_session_id = session["session_id"]
        record.youpi_payment_id = session["payment_id"]
        record.youpi_checkout_url = session["checkout_url"]
        record.payment_method = f"YouPI-PG ({session['method']})"
        record.payment_status = "PENDING_VERIFICATION"
        record.settlement_state = "QR_READY"
        record.order_status = "Awaiting UPI Payment"
        db.commit()
        db.refresh(record)

        snapshot = _order_status_snapshot(record)
        await broadcaster.broadcast(record.order_code, snapshot)

        return {
            **session,
            "ui_state": snapshot["ui_state"],
            "payment_status": record.payment_status,
            "settlement_state": record.settlement_state,
            "order_status": record.order_status,
        }
    except YouPIGatewayError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Database error: {exc}")
    finally:
        db.close()


@app.get("/payments/youpi/qr/{order_code}.svg")
async def get_youpi_qr_svg(order_code: str):
    """Proxy the real dynamic SVG QR generated by YouPI-PG Checkout Portal (`:7000`)."""
    db = SessionLocal()
    try:
        record = (
            db.query(CustomerOrder)
            .filter(CustomerOrder.order_code == order_code)
            .first()
        )
        if not record or not record.youpi_payment_id:
            raise HTTPException(
                status_code=404,
                detail=f"No active YouPI-PG payment session found for order {order_code}.",
            )
        payment_id = record.youpi_payment_id
    finally:
        db.close()

    try:
        svg_bytes = await fetch_youpi_qr_svg(payment_id)
    except YouPIGatewayError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    return Response(
        content=svg_bytes,
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@app.post("/payments/youpi/utr")
async def submit_youpi_utr(payload: YouPIUtrSubmitRequest):
    """Record a customer-submitted UTR and forward it to YouPI-PG `manual-utr`.

    IMPORTANT: Submitting a UTR never marks an order paid or confirmed. Status remains
    `PENDING_VERIFICATION` until an authorized reviewer independently reconciles it.
    """
    try:
        clean_utr = validate_utr_format(payload.utr)
    except YouPIGatewayError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    db = SessionLocal()
    try:
        record = (
            db.query(CustomerOrder)
            .filter(CustomerOrder.order_code == payload.order_code)
            .with_for_update()
            .first()
        )
        if not record:
            raise HTTPException(status_code=404, detail=f"Order {payload.order_code} not found.")
        if not record.youpi_payment_id:
            raise HTTPException(
                status_code=400,
                detail="No YouPI-PG payment session exists for this order.",
            )
        if record.payment_status in ("RECONCILED", "PAID_TEST"):
            raise HTTPException(status_code=409, detail="Order is already reconciled/paid.")
        if record.payment_status in ("EXPIRED", "CANCELLED", "FAILED"):
            raise HTTPException(
                status_code=409,
                detail=f"Cannot submit UTR while order payment is {record.payment_status}.",
            )

        duplicate_utr = (
            db.query(CustomerOrder)
            .filter(
                func.upper(CustomerOrder.utr) == clean_utr.upper(),
                CustomerOrder.order_code != payload.order_code,
            )
            .first()
        )
        if duplicate_utr:
            raise HTTPException(
                status_code=409,
                detail="This UPI transaction reference (UTR) has already been submitted for another order.",
            )

        gateway_resp = await submit_youpi_manual_utr(record.youpi_payment_id, clean_utr)

        record.utr = clean_utr
        record.payment_status = "PENDING_VERIFICATION"
        record.settlement_state = "UTR_SUBMITTED"
        record.order_status = "Pending Payment Verification"
        db.commit()
        db.refresh(record)

        snapshot = _order_status_snapshot(record)
        await broadcaster.broadcast(record.order_code, snapshot)

        return {
            **snapshot,
            "gateway_response": {
                "status": gateway_resp.get("status"),
                "settlementState": gateway_resp.get("settlementState"),
                "message": gateway_resp.get("message"),
            },
            "message": (
                "UTR submitted for independent bank verification. "
                "Payment stays PENDING_VERIFICATION until reconciled."
            ),
        }
    except YouPIGatewayError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Database error saving UTR: {exc}")
    finally:
        db.close()


@app.post("/payments/youpi/webhook")
async def youpi_webhook(request: Request):
    """Receive, cryptographically verify, and idempotently process YouPI-PG webhooks."""
    cfg = get_youpi_config()
    if not cfg["webhook_configured"]:
        raise HTTPException(
            status_code=503,
            detail="YOUPI_WEBHOOK_SECRET is not configured on the backend; failing closed.",
        )

    raw_body = await request.body()
    sig_v1 = request.headers.get("X-Gateway-Signature")
    sig_v2 = request.headers.get("X-Gateway-Signature-V2")
    ts_header = request.headers.get("X-Gateway-Timestamp")

    verified, verify_reason = verify_youpi_webhook(
        raw_body=raw_body,
        signature_v1=sig_v1,
        signature_v2=sig_v2,
        timestamp_header=ts_header,
        secret=cfg["webhook_secret"],
        tolerance_seconds=cfg["webhook_tolerance_seconds"],
    )
    if not verified:
        raise HTTPException(status_code=401, detail=verify_reason)

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON webhook body.")

    event = str(payload.get("event") or request.headers.get("X-Gateway-Event") or "").strip().upper()
    order_code = (payload.get("orderId") or payload.get("order_code") or "").strip()
    currency = str(payload.get("currency") or "INR").strip().upper()
    settlement_state_in = str(payload.get("settlementState") or "").strip().upper()
    utr = (payload.get("utr") or "").strip() or None
    payment_id = (payload.get("paymentId") or "").strip() or None
    delivery_id = (
        (request.headers.get("X-Gateway-Delivery-Id") or payload.get("deliveryId") or "").strip()
    )

    if not event or not order_code:
        raise HTTPException(status_code=422, detail="Webhook requires both event and orderId.")
    if currency != "INR":
        raise HTTPException(status_code=422, detail=f"Unsupported currency '{currency}'; expected INR.")

    try:
        webhook_amount = float(payload.get("amount"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Webhook payload missing numeric amount.")

    db = SessionLocal()
    try:
        if delivery_id:
            duplicate_delivery = (
                db.query(CustomerOrder)
                .filter(CustomerOrder.webhook_event_id == delivery_id)
                .first()
            )
            if duplicate_delivery:
                return {
                    "received": True,
                    "status": "duplicate_ignored",
                    "order_code": duplicate_delivery.order_code,
                    "delivery_id": delivery_id,
                }

        record = (
            db.query(CustomerOrder)
            .filter(CustomerOrder.order_code == order_code)
            .with_for_update()
            .first()
        )
        if not record:
            raise HTTPException(status_code=404, detail=f"Order {order_code} not found.")

        if abs(record.amount_inr - webhook_amount) > 0.01:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Amount mismatch in webhook: expected ₹{record.amount_inr:.2f}, "
                    f"received ₹{webhook_amount:.2f}."
                ),
            )

        if record.payment_status in ("RECONCILED", "PAID_TEST"):
            return {
                "received": True,
                "status": "already_reconciled",
                "order_code": order_code,
            }

        if utr:
            try:
                utr = validate_utr_format(utr)
            except YouPIGatewayError as exc:
                raise HTTPException(status_code=422, detail=exc.detail)
            reused = (
                db.query(CustomerOrder)
                .filter(
                    func.upper(CustomerOrder.utr) == utr.upper(),
                    CustomerOrder.order_code != order_code,
                )
                .first()
            )
            if reused:
                raise HTTPException(status_code=409, detail="UTR already bound to another order.")

        if delivery_id:
            record.webhook_event_id = delivery_id
        if payment_id and not record.youpi_payment_id:
            record.youpi_payment_id = payment_id
        if utr:
            record.utr = utr

        if event == "MANUAL_REVIEW":
            record.payment_status = "PENDING_VERIFICATION"
            record.settlement_state = "UTR_SUBMITTED"
            record.order_status = "Pending Payment Verification"
        elif event in ("OBSERVED_SUCCESS", "SUCCESS"):
            # Observer SMS/Gmail alerts are NEVER proof of bank settlement.
            record.payment_status = "PENDING_VERIFICATION"
            record.settlement_state = "OBSERVED_UNRECONCILED"
            record.order_status = "Pending Payment Verification"
        elif event == "RECONCILED":
            if settlement_state_in != "RECONCILED" or not (record.utr or utr):
                raise HTTPException(
                    status_code=422,
                    detail="RECONCILED webhook requires settlementState='RECONCILED' and a valid UTR.",
                )
            record.payment_status = "RECONCILED"
            record.settlement_state = "RECONCILED"
            record.order_status = "Restaurant confirmed"
            record.reconciled_by = "youpi_bank_reconciliation"
            record.payment_confirmed_at = datetime.now(timezone.utc)
        elif event in ("FAILED", "EXPIRED", "CANCELLED"):
            record.payment_status = event
            record.settlement_state = event
            record.order_status = f"Payment {event.title()}"
        else:
            raise HTTPException(status_code=422, detail=f"Unsupported webhook event '{event}'.")

        db.commit()
        db.refresh(record)

        snapshot = _order_status_snapshot(record)
        await broadcaster.broadcast(record.order_code, snapshot)

        return {
            "received": True,
            "status": snapshot["ui_state"],
            "order_code": record.order_code,
            "payment_status": record.payment_status,
            "settlement_state": record.settlement_state,
            "utr": record.utr,
        }
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Database error processing webhook: {exc}")
    finally:
        db.close()


@app.post("/payments/youpi/reconcile")
async def reconcile_youpi_payment(payload: YouPIReconcileRequest, request: Request):
    """Independent merchant/admin bank reconciliation endpoint.

    Only an authenticated admin holding `YOUPI_RECONCILE_ADMIN_TOKEN` may transition an
    order from `PENDING_VERIFICATION` to `RECONCILED` (or `FAILED`) after checking bank statements.
    """
    cfg = get_youpi_config()
    admin_token = cfg["reconcile_admin_token"]
    if not admin_token:
        raise HTTPException(
            status_code=503,
            detail="YOUPI_RECONCILE_ADMIN_TOKEN is not configured on the backend.",
        )

    auth_header = request.headers.get("Authorization") or ""
    presented = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else ""
    if not presented or not hmac.compare_digest(presented, admin_token):
        raise HTTPException(status_code=401, detail="Invalid or missing reconciliation bearer token.")

    try:
        clean_utr = validate_utr_format(payload.verified_utr)
    except YouPIGatewayError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    db = SessionLocal()
    try:
        record = (
            db.query(CustomerOrder)
            .filter(CustomerOrder.order_code == payload.order_code)
            .with_for_update()
            .first()
        )
        if not record:
            raise HTTPException(status_code=404, detail=f"Order {payload.order_code} not found.")

        if record.payment_status == "RECONCILED":
            raise HTTPException(status_code=409, detail="Order is already RECONCILED.")

        if payload.decision == "RECONCILED":
            if record.utr and record.utr.upper() != clean_utr.upper():
                raise HTTPException(
                    status_code=409,
                    detail=f"UTR mismatch: customer submitted '{record.utr}', reconciliation received '{clean_utr}'.",
                )
            utr_owner = (
                db.query(CustomerOrder)
                .filter(
                    func.upper(CustomerOrder.utr) == clean_utr.upper(),
                    CustomerOrder.order_code != payload.order_code,
                    CustomerOrder.payment_status == "RECONCILED",
                )
                .first()
            )
            if utr_owner:
                raise HTTPException(
                    status_code=409,
                    detail="This UTR has already been reconciled against another order.",
                )

            record.utr = clean_utr
            record.payment_status = "RECONCILED"
            record.settlement_state = "RECONCILED"
            record.order_status = "Restaurant confirmed"
            record.reconciled_by = payload.reviewer.strip()
            record.payment_confirmed_at = datetime.now(timezone.utc)
        else:
            record.payment_status = "FAILED"
            record.settlement_state = "FAILED"
            record.order_status = "Payment Failed"
            record.reconciled_by = payload.reviewer.strip()

        db.commit()
        db.refresh(record)

        snapshot = _order_status_snapshot(record)
        await broadcaster.broadcast(record.order_code, snapshot)
        return snapshot
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Database error during reconciliation: {exc}")
    finally:
        db.close()


@app.get("/payments/youpi/status/{order_code}")
def get_youpi_status(order_code: str):
    """Fetch current server-side payment status snapshot for polling/SSE reconnect."""
    snapshot = _load_order_snapshot_sync(order_code)
    if snapshot is None:
        raise HTTPException(status_code=404, detail=f"Order {order_code} not found.")
    return snapshot


@app.get("/payments/youpi/status/{order_code}/stream")
async def stream_youpi_status(order_code: str):
    """Multi-replica SSE stream backed by Redis Pub/Sub and PostgreSQL snapshot polling."""
    if _load_order_snapshot_sync(order_code) is None:
        raise HTTPException(status_code=404, detail=f"Order {order_code} not found.")

    return StreamingResponse(
        broadcaster.stream_events(
            order_code=order_code,
            snapshot_fn=lambda: _load_order_snapshot_sync(order_code),
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

