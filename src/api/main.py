

import os

import json

import hashlib

import socket

from pathlib import Path

import time

from typing import Optional

import joblib

import numpy as np

import pandas as pd

import redis
from strawberry.fastapi import GraphQLRouter
from src.api.graphql_schema import schema

from fastapi import FastAPI, HTTPException

from pydantic import BaseModel, Field

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
    """Safely initialize application tables across multiple API instances."""
    with engine.begin() as connection:
        # Serialize database initialization across API instances.
        connection.exec_driver_sql(
            "SELECT pg_advisory_xact_lock(7420192601)"
        )

        # Create missing tables only after acquiring the lock.
        Base.metadata.create_all(bind=connection)


@app.on_event("startup")
def initialize_database():
    """Initialize database tables when each API instance starts."""
    ensure_orders_table()



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
    allowed_statuses = {"DEMO", "COD_DEMO"}
    status_value = payload.payment_status if payload.payment_status in allowed_statuses else "DEMO"

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
            order_status="Restaurant confirmed",
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
