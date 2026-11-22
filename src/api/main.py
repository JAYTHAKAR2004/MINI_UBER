

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

