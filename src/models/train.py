
from pathlib import Path

import numpy as np
import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "processed"
MODEL_DIR = ROOT / "models"
REPORT_DIR = ROOT / "reports"

TARGET = "Time_taken (min)"

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


def build_preprocessor():

    numeric_pipeline = Pipeline([
        ("imputer", SimpleImputer(
            strategy="median",
            add_indicator=True
        )),
        ("scaler", StandardScaler()),
    ])

    categorical_pipeline = Pipeline([
        ("imputer", SimpleImputer(
            strategy="most_frequent"
        )),
        ("encoder", OneHotEncoder(
            handle_unknown="ignore"
        )),
    ])

    return ColumnTransformer([
        ("numeric", numeric_pipeline, NUMERIC_FEATURES),
        ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
    ])


def evaluate_model(name, model, X, y):

    predictions = model.predict(X)

    mae = mean_absolute_error(y, predictions)
    rmse = mean_squared_error(y, predictions) ** 0.5
    r2 = r2_score(y, predictions)

    print(f"\n{name}")
    print("-" * 40)
    print(f"MAE  : {mae:.3f} minutes")
    print(f"RMSE : {rmse:.3f} minutes")
    print(f"R2   : {r2:.4f}")

    return {
        "model": name,
        "MAE": mae,
        "RMSE": rmse,
        "R2": r2,
    }


def main():

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    train_df = pd.read_parquet(
        DATA_DIR / "train_processed.parquet"
    )

    test_df = pd.read_parquet(
        DATA_DIR / "test_processed.parquet"
    )

    # Separate features and target.
    X = train_df[
        NUMERIC_FEATURES + CATEGORICAL_FEATURES
    ].copy()

    y = train_df[TARGET]

    X_test = test_df[
        NUMERIC_FEATURES + CATEGORICAL_FEATURES
    ].copy()

    y_test = test_df[TARGET]

    # Convert Pandas pd.NA into NumPy np.nan.
    for col in CATEGORICAL_FEATURES:

        X[col] = X[col].astype(object).where(
            X[col].notna(), np.nan
        )

        X_test[col] = X_test[col].astype(object).where(
            X_test[col].notna(), np.nan
        )

    # Split training data into train and validation.
    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
    )

    models = {
        "Linear Regression": LinearRegression(),

        "Random Forest": RandomForestRegressor(
            n_estimators=200,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        ),

        "Gradient Boosting": GradientBoostingRegressor(
            n_estimators=150,
            learning_rate=0.05,
            max_depth=3,
            random_state=42,
        ),
    }

    validation_results = []

    # Compare models on validation data.
    for name, estimator in models.items():

        print(f"\nTraining {name}...")

        pipeline = Pipeline([
            ("preprocessor", build_preprocessor()),
            ("model", estimator),
        ])

        pipeline.fit(X_train, y_train)

        result = evaluate_model(
            name,
            pipeline,
            X_val,
            y_val,
        )

        validation_results.append(result)

    results_df = pd.DataFrame(validation_results)
    results_df = results_df.sort_values("MAE")

    results_df.to_csv(
        REPORT_DIR / "validation_model_comparison.csv",
        index=False,
    )

    print("\nVALIDATION MODEL COMPARISON")
    print(results_df.to_string(index=False))

    best_name = results_df.iloc[0]["model"]

    print(f"\nBest validation model: {best_name}")

    # Refit selected model on complete training data.
    best_pipeline = Pipeline([
        ("preprocessor", build_preprocessor()),
        ("model", models[best_name]),
    ])

    print("\nRefitting selected model on full training data...")

    best_pipeline.fit(X, y)

    # Final evaluation on untouched test data.
    print("\nFINAL TEST EVALUATION")

    test_result = evaluate_model(
        best_name,
        best_pipeline,
        X_test,
        y_test,
    )

    # Save model.
    joblib.dump(
        best_pipeline,
        MODEL_DIR / "eta_model.joblib",
    )

    # Save test metrics.
    pd.DataFrame([test_result]).to_csv(
        REPORT_DIR / "final_test_metrics.csv",
        index=False,
    )

    print("\nSaved model:", MODEL_DIR / "eta_model.joblib")
    print("Saved reports in:", REPORT_DIR)


if __name__ == "__main__":
    main()
