
import json
import os
import time
from pathlib import Path

from confluent_kafka import Consumer, KafkaException
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

MAX_ATTEMPTS = 3
INITIAL_BACKOFF = 1

consumer = Consumer({
    "bootstrap.servers": os.getenv(
        "KAFKA_BOOTSTRAP_SERVERS",
        "localhost:19092"
    ),
    "group.id": "eta-analytics-consumer",
    "auto.offset.reset": "earliest",
    "enable.auto.commit": False,
})

consumer.subscribe(["eta-predictions"])


def process_event(msg):
    """Process one ETA prediction event."""
    event = json.loads(msg.value().decode("utf-8"))

    if not isinstance(event, dict):
        raise ValueError("Invalid event format")

    print("\n========== ETA EVENT ==========")
    print(json.dumps(event, indent=4))
    print("================================")

    return event


print("Listening for ETA prediction events...")
print("Press Ctrl+C to stop.\n")

try:
    while True:
        msg = consumer.poll(1.0)

        if msg is None:
            continue

        if msg.error():
            print("Consumer error:", msg.error())
            continue

        processed = False

        # Retry failed processing with exponential backoff.
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                process_event(msg)
                processed = True
                break

            except Exception as exc:
                print(
                    f"Processing failed: attempt "
                    f"{attempt}/{MAX_ATTEMPTS}: {exc}"
                )

                if attempt < MAX_ATTEMPTS:
                    delay = INITIAL_BACKOFF * (2 ** (attempt - 1))
                    print(f"Retrying in {delay} seconds...")
                    time.sleep(delay)

        if not processed:
            print(
                "All retry attempts failed. "
                "Stopping without committing the offset."
            )
            print(
                "Restart the consumer to reprocess this message."
            )
            break

        # ACK: Commit only after successful processing.
        try:
            consumer.commit(
                message=msg,
                asynchronous=False
            )
            print("ACK: Message offset committed successfully.")

        except KafkaException as exc:
            print("Offset commit failed:", exc)
            print("Message may be processed again after restart.")
            break

except KeyboardInterrupt:
    print("\nConsumer stopped by user.")

finally:
    consumer.close()
    print("Consumer connection closed.")
