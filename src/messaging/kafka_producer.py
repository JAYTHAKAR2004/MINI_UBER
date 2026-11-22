
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from confluent_kafka import Producer
from dotenv import load_dotenv

# Load environment variables
ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

KAFKA_BOOTSTRAP_SERVERS = os.getenv(
    "KAFKA_BOOTSTRAP_SERVERS",
    "localhost:19092",
)

# Initialize Kafka producer
producer = Producer({
    "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
    "client.id": "mini-uber-eta-api",
    "message.timeout.ms": 5000,
})


def publish_eta_event(event_data: dict) -> bool:
    """Publish an ETA prediction event to Kafka."""

    delivered = []

    event = {
        **event_data,
        "event_timestamp": datetime.now(timezone.utc).isoformat(),
    }

    try:
        producer.produce(
            topic="eta-predictions",
            key=str(event_data["prediction_id"]),
            value=json.dumps(event),
            callback=lambda err, msg: delivered.append(err),
        )

        # Wait up to 5 seconds for delivery
        producer.flush(5)

        return bool(delivered) and delivered[0] is None

    except Exception as exc:
        print(f"Kafka publishing failed: {exc}")
        return False
