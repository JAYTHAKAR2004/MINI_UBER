"""Kafka producer with delivery timeouts, exponential-backoff retries, and telemetry."""

from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

from confluent_kafka import Producer
from dotenv import load_dotenv

from src.resilience.logging_config import get_logger
from src.resilience.retry import (
    PermanentError,
    RetryConfig,
    RetryExhaustedError,
    TransientError,
    execute_with_retry,
)
from src.resilience.timeout import TimeoutConfig

# Load environment variables
ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

logger = get_logger("messaging.kafka_producer")
timeout_config = TimeoutConfig.from_env()

KAFKA_BOOTSTRAP_SERVERS = os.getenv(
    "KAFKA_BOOTSTRAP_SERVERS",
    "localhost:19092",
)
KAFKA_TOPIC = os.getenv("KAFKA_ETA_TOPIC", "eta-predictions")
KAFKA_MESSAGE_TIMEOUT_MS = timeout_config.kafka_delivery_timeout_ms
KAFKA_FLUSH_TIMEOUT = timeout_config.kafka_flush_timeout
KAFKA_RETRY_MAX_ATTEMPTS = max(1, int(os.getenv("KAFKA_RETRY_MAX_ATTEMPTS", "3")))
KAFKA_RETRY_INITIAL_BACKOFF = max(0.0, float(os.getenv("KAFKA_RETRY_INITIAL_BACKOFF", "1.0")))


class KafkaTransientError(TransientError):
    """Temporary Kafka broker or network failure eligible for retry."""


class KafkaDeliveryTimeoutError(TransientError, TimeoutError):
    """Raised when Kafka message delivery does not complete within flush timeout."""


# Initialize Kafka producer
producer = Producer(
    {
        "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
        "client.id": "mini-uber-eta-api",
        "message.timeout.ms": KAFKA_MESSAGE_TIMEOUT_MS,
    }
)

_metrics_lock = threading.Lock()
_metrics: dict[str, Any] = {
    "published_count": 0,
    "failed_count": 0,
    "retry_count": 0,
    "timeout_count": 0,
    "permanent_error_count": 0,
    "last_error": None,
    "last_success_at": None,
}


def get_kafka_resilience_status() -> dict[str, Any]:
    """Return thread-safe Kafka producer resilience configuration and metrics."""
    with _metrics_lock:
        snapshot = dict(_metrics)
    return {
        "bootstrap_servers": KAFKA_BOOTSTRAP_SERVERS,
        "topic": KAFKA_TOPIC,
        "message_timeout_ms": KAFKA_MESSAGE_TIMEOUT_MS,
        "flush_timeout_seconds": KAFKA_FLUSH_TIMEOUT,
        "retry_max_attempts": KAFKA_RETRY_MAX_ATTEMPTS,
        "retry_initial_backoff_seconds": KAFKA_RETRY_INITIAL_BACKOFF,
        **snapshot,
    }


def _record_metric(field: str, error_msg: Optional[str] = None) -> None:
    with _metrics_lock:
        _metrics[field] = int(_metrics[field]) + 1
        if error_msg is not None:
            _metrics["last_error"] = error_msg


def publish_eta_event(
    event_data: dict,
    *,
    max_attempts: Optional[int] = None,
    initial_backoff: Optional[float] = None,
    flush_timeout: Optional[float] = None,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> bool:
    """Publish an ETA prediction event to Kafka with timeout and retry handling."""
    if not isinstance(event_data, dict) or "prediction_id" not in event_data:
        _record_metric("permanent_error_count", "Invalid ETA event payload: missing prediction_id")
        logger.error("Permanent Kafka payload error: missing 'prediction_id' — not retrying")
        return False

    effective_flush_timeout = KAFKA_FLUSH_TIMEOUT if flush_timeout is None else flush_timeout
    event_id = str(event_data.get("event_id") or f"eta-{event_data['prediction_id']}")

    # Build and serialize the payload once so retries stay idempotent.
    event = {
        **event_data,
        "event_id": event_id,
        "event_timestamp": event_data.get("event_timestamp")
        or datetime.now(timezone.utc).isoformat(),
    }
    try:
        serialized_payload = json.dumps(event)
    except (TypeError, ValueError) as exc:
        _record_metric("permanent_error_count", str(exc))
        logger.error("Permanent JSON serialization error for event %s: %s", event_id, exc)
        return False

    retry_cfg = RetryConfig(
        max_attempts=KAFKA_RETRY_MAX_ATTEMPTS if max_attempts is None else max_attempts,
        initial_backoff_seconds=(
            KAFKA_RETRY_INITIAL_BACKOFF if initial_backoff is None else initial_backoff
        ),
        backoff_multiplier=2.0,
        retryable_exceptions=(KafkaTransientError, KafkaDeliveryTimeoutError, TimeoutError),
        non_retryable_exceptions=(PermanentError, ValueError, TypeError, KeyError),
    )

    def _attempt_publish() -> bool:
        delivered: list[Any] = []
        try:
            producer.produce(
                topic=KAFKA_TOPIC,
                key=str(event_data["prediction_id"]),
                value=serialized_payload,
                callback=lambda err, msg: delivered.append(err),
            )
            remaining = producer.flush(effective_flush_timeout)
        except (BufferError, OSError) as exc:
            raise KafkaTransientError(f"Kafka producer transient error: {exc}") from exc
        except (ValueError, TypeError) as exc:
            raise PermanentError(f"Invalid Kafka message arguments: {exc}") from exc
        except Exception as exc:
            raise KafkaTransientError(f"Kafka produce/flush error: {exc}") from exc

        if remaining > 0 or not delivered:
            _record_metric(
                "timeout_count",
                f"Kafka delivery timed out after {effective_flush_timeout:.2f}s",
            )
            logger.error(
                "Kafka delivery timeout for event %s after %.2fs (remaining_in_queue=%s)",
                event_id,
                effective_flush_timeout,
                remaining,
            )
            raise KafkaDeliveryTimeoutError(
                f"Kafka delivery timed out after {effective_flush_timeout:.2f}s"
            )

        if delivered[0] is not None:
            raise KafkaTransientError(f"Kafka delivery callback error: {delivered[0]}")

        return True

    def _on_retry(attempt: int, exc: BaseException, delay: float) -> None:
        _record_metric("retry_count", str(exc))

    try:
        execute_with_retry(
            _attempt_publish,
            config=retry_cfg,
            operation_name="kafka_publish_eta_event",
            idempotency_key=event_id,
            sleep_fn=sleep_fn,
            on_retry=_on_retry,
        )
        with _metrics_lock:
            _metrics["published_count"] += 1
            _metrics["last_success_at"] = datetime.now(timezone.utc).isoformat()
        logger.info("Kafka event %s published to topic '%s'", event_id, KAFKA_TOPIC)
        return True
    except RetryExhaustedError as exc:
        _record_metric("failed_count", str(exc))
        logger.error("Kafka publishing exhausted retries for event %s: %s", event_id, exc)
        return False
    except PermanentError as exc:
        _record_metric("permanent_error_count", str(exc))
        _record_metric("failed_count", str(exc))
        logger.error("Kafka permanent error for event %s: %s", event_id, exc)
        return False
    except Exception as exc:
        _record_metric("failed_count", str(exc))
        logger.error("Unexpected Kafka publishing failure for event %s: %s", event_id, exc)
        return False
