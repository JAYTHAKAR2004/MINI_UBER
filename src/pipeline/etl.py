
import logging
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
REPORT_DIR = ROOT / "reports"

TARGET = "Time_taken (min)"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger(__name__)


def parse_time(value):
    """Convert HH:MM, HH:MM:SS or Excel day fractions to minutes."""

    if pd.isna(value):
        return np.nan

    value = str(value).strip()

    if not value:
        return np.nan

    try:
        # Excel-style fraction of a day
        number = float(value)

        if 0 <= number < 1:
            return number * 1440

    except ValueError:
        pass

    try:
        parts = value.split(":")
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = int(parts[2]) if len(parts) > 2 else 0

        if not (0 <= minutes < 60 and 0 <= seconds < 60):
            return np.nan

        if hours > 24:
            return np.nan

        return hours * 60 + minutes + seconds / 60

    except (ValueError, IndexError):
        return np.nan


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate geographical distance in kilometres."""

    earth_radius = 6371.0

    lat1, lon1, lat2, lon2 = map(
        np.radians, [lat1, lon1, lat2, lon2]
    )

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(lat1) * np.cos(lat2)
        * np.sin(dlon / 2) ** 2
    )

    return 2 * earth_radius * np.arcsin(np.sqrt(a))


def clean_and_engineer(df, dataset_name):

    df = df.copy()

    logger.info("Processing %s: %s", dataset_name, df.shape)

    # Normalize categorical columns
    categorical_columns = [
        "Weather_conditions",
        "Road_traffic_density",
        "Type_of_order",
        "Type_of_vehicle",
        "Festival",
        "City"
    ]

    for col in categorical_columns:
        df[col] = (
            df[col]
            .astype("string")
            .str.strip()
            .replace("", pd.NA)
        )

    # Validate ratings
    invalid_ratings = (
        (df["Delivery_person_Ratings"] < 1)
        | (df["Delivery_person_Ratings"] > 5)
    )

    df.loc[invalid_ratings, "Delivery_person_Ratings"] = np.nan

    # Validate geographic coordinates using broad India bounds
    restaurant_valid = (
        df["Restaurant_latitude"].between(6, 38)
        & df["Restaurant_longitude"].between(68, 98)
    )

    delivery_valid = (
        df["Delivery_location_latitude"].between(6, 38)
        & df["Delivery_location_longitude"].between(68, 98)
    )

    coordinate_valid = restaurant_valid & delivery_valid

    # Calculate distance only for valid coordinate pairs
    df["distance_km"] = np.nan

    df.loc[coordinate_valid, "distance_km"] = haversine_distance(
        df.loc[coordinate_valid, "Restaurant_latitude"],
        df.loc[coordinate_valid, "Restaurant_longitude"],
        df.loc[coordinate_valid, "Delivery_location_latitude"],
        df.loc[coordinate_valid, "Delivery_location_longitude"]
    )

    df["coordinates_valid"] = coordinate_valid.astype("int8")

    # Time feature engineering
    df["order_minutes"] = df["Time_Orderd"].apply(parse_time)
    df["pickup_minutes"] = df["Time_Order_picked"].apply(parse_time)

    df["order_time_missing"] = df["order_minutes"].isna().astype("int8")
    df["pickup_time_missing"] = df["pickup_minutes"].isna().astype("int8")

    # Clock time features
    df["order_hour"] = (df["order_minutes"] // 60) % 24
    df["pickup_hour"] = (df["pickup_minutes"] // 60) % 24

    # Preparation duration, handling midnight crossover
    preparation = df["pickup_minutes"] - df["order_minutes"]

    preparation = preparation.where(preparation >= 0, preparation + 1440)

    # Avoid treating missing or implausible durations as valid
    preparation = preparation.where(preparation.between(0, 180))

    df["preparation_time_min"] = preparation

    # Date features
    dates = pd.to_datetime(
        df["Order_Date"],
        format="%d-%m-%Y",
        errors="coerce"
    )

    df["order_day"] = dates.dt.day
    df["order_month"] = dates.dt.month
    df["order_weekday"] = dates.dt.dayofweek

    # Remove identifiers and raw columns not needed by the model
    df = df.drop(
        columns=[
            "ID",
            "Delivery_person_ID",
            "Restaurant_latitude",
            "Restaurant_longitude",
            "Delivery_location_latitude",
            "Delivery_location_longitude",
            "Order_Date",
            "Time_Orderd",
            "Time_Order_picked"
        ],
        errors="ignore"
    )

    logger.info(
        "%s processing complete. Valid coordinate rows: %d/%d",
        dataset_name,
        coordinate_valid.sum(),
        len(df)
    )

    return df


def validate_dataset(df, dataset_name):

    if df.empty:
        raise ValueError(f"{dataset_name} dataset is empty")

    if df.isna().all(axis=1).any():
        raise ValueError(f"{dataset_name} contains completely empty rows")

    if "distance_km" in df.columns:
        valid_distances = df["distance_km"].dropna()

        if (valid_distances < 0).any():
            raise ValueError("Negative geographical distance detected")

    if TARGET in df.columns:
        if df[TARGET].isna().any():
            raise ValueError(f"{dataset_name} contains missing ETA targets")

        if not df[TARGET].between(1, 180).all():
            raise ValueError(f"{dataset_name} contains invalid ETA targets")

    logger.info("%s validation passed", dataset_name)


def main():

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    train = pd.read_parquet(RAW_DIR / "train.parquet")
    test = pd.read_parquet(RAW_DIR / "test.parquet")

    logger.info("Raw train shape: %s", train.shape)
    logger.info("Raw test shape: %s", test.shape)

    train_processed = clean_and_engineer(train, "train")
    test_processed = clean_and_engineer(test, "test")

    validate_dataset(train_processed, "train")
    validate_dataset(test_processed, "test")

    train_processed.to_parquet(
        PROCESSED_DIR / "train_processed.parquet",
        index=False
    )

    test_processed.to_parquet(
        PROCESSED_DIR / "test_processed.parquet",
        index=False
    )

    report = pd.DataFrame({
        "column": train_processed.columns,
        "missing_values": [
            train_processed[col].isna().sum()
            for col in train_processed.columns
        ]
    })

    report.to_csv(REPORT_DIR / "etl_missing_values.csv", index=False)

    logger.info("ETL pipeline completed successfully")
    logger.info("Processed train shape: %s", train_processed.shape)
    logger.info("Processed test shape: %s", test_processed.shape)


if __name__ == "__main__":
    main()
