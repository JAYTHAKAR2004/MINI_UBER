
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


# Project paths
ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "models" / "eta_model.joblib"

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
    version="1.0.0",
)


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


@app.get("/")
def root():
    return {
        "message": "Mini Uber ETA Prediction API",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy" if model is not None else "unhealthy",
        "model_loaded": model is not None,
    }


@app.post("/predict")
def predict_eta(request: ETAPredictionRequest):

    if model is None:
        raise HTTPException(
            status_code=503,
            detail="ETA model is not available.",
        )

    try:
        input_data = request.model_dump()

        if all(value is None for value in input_data.values()):
            raise HTTPException(
                status_code=422,
                detail="At least one prediction feature must be provided.",
            )

        # Create input DataFrame in exact training feature order.
        input_df = pd.DataFrame(
            [input_data],
            columns=FEATURES,
        )

        # Convert categorical missing values to np.nan.
        for col in CATEGORICAL_FEATURES:
            input_df[col] = input_df[col].astype(object).where(
                input_df[col].notna(), np.nan
            )

        prediction = float(model.predict(input_df)[0])

        return {
            "predicted_eta_minutes": round(max(0, prediction), 2),
            "unit": "minutes",
            "model": "Random Forest",
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(exc)}",
        )
