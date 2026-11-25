"""Kafka ETA analytics consumer with exponential-backoff retries and manual ACK commits."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable, Optional

from confluent_kafka import Consumer, KafkaException
from dotenv import load_dotenv

from src.resilience.logging_config import get_logger
from src.resilience.retry import (
    PermanentError,
    RetryConfig,
    RetryExhaustedError,
    TransientError,
    execute_with_retry,
)

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

logger = get_logger("kafka.consumer")

MAX_ATTEMPTS = max(1, int(os.getenv("KAFKA_CONSUMER_MAX_ATTEMPTS", "3")))
INITIAL_BACKOFF = max(0.0, float(os.getenv("KAFKA_CONSUMER_INITIAL_BACKOFF", "1.0")))
KAFKA_TOPIC = os.getenv("KAFKA_ETA_TOPIC", "eta-predictions")


def build_consumer() -> Consumer:
    """Create and subscribe a manual-commit Kafka consumer."""
    consumer = Consumer(
        {
            "bootstrap.servers": os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:19092"),
            "group.id": os.getenv("KAFKA_CONSUMER_GROUP", "eta-analytics-consumer"),
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        }
    )
    consumer.subscribe([KAFKA_TOPIC])
    return consumer


def process_event(msg: Any) -> dict:
    """Decode and process one ETA prediction event."""
    raw_bytes = msg.value()
    if raw_bytes is None:
        raise PermanentError("Kafka message payload is empty")

    try:
        event = json.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PermanentError(f"Malformed JSON event payload: {exc}") from exc

    if not isinstance(event, dict):
        raise PermanentError("Invalid event format: expected JSON object")

    logger.info(
        "Processed ETA event prediction_id=%s eta=%s",
        event.get("prediction_id"),
        event.get("predicted_eta_minutes"),
    )
    return event


def process_message_with_retry(
    msg: Any,
    *,
    processor: Callable[[Any], Any] = process_event,
    max_attempts: int = MAX_ATTEMPTS,
    initial_backoff: float = INITIAL_BACKOFF,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> bool:
    """Process one Kafka message using bounded exponential backoff retries."""
    retry_cfg = RetryConfig(
        max_attempts=max_attempts,
        initial_backoff_seconds=initial_backoff,
        backoff_multiplier=2.0,
        retryable_exceptions=(TransientError, TimeoutError, ConnectionError, OSError, RuntimeError),
        non_retryable_exceptions=(PermanentError, ValueError, TypeError, KeyError),
    )

    try:
        execute_with_retry(
            processor,
            msg,
            config=retry_cfg,
            operation_name="kafka_consume_eta_event",
            sleep_fn=sleep_fn,
        )
        return True
    except PermanentError as exc:
        logger.error("Skipping permanently invalid Kafka message: %s", exc)
        return False
    except RetryExhaustedError as exc:
        logger.error(
            "All %d consumer retry attempts exhausted (%s). Offset will NOT be committed.",
            max_attempts,
            exc,
        )
        return False


def run_consumer(consumer: Optional[Consumer] = None) -> None:
    """Poll Kafka continuously with retry-on-failure and manual offset commits."""
    active_consumer = consumer or build_consumer()
    logger.info("Listening for ETA prediction events on topic '%s'...", KAFKA_TOPIC)

    try:
        while True:
            msg = active_consumer.poll(1.0)
            if msg is None:
                continue

            if msg.error():
                logger.warning("Kafka consumer poll error: %s", msg.error())
                continue

            processed = process_message_with_retry(msg)
            if not processed:
                logger.error("Stopping consumer without committing offset so message can be reprocessed.")
                break

            try:
                active_consumer.commit(message=msg, asynchronous=False)
                logger.info("ACK: Message offset committed successfully.")
            except KafkaException as exc:
                logger.error("Offset commit failed: %s", exc)
                break
    except KeyboardInterrupt:
        logger.info("Consumer stopped by user.")
    finally:
        active_consumer.close()
        logger.info("Consumer connection closed.")


if __name__ == "__main__":
    run_consumer()
