"""Automated unit and live-integration test suite for P9 fault-tolerance mechanisms.

Section A (@pytest.mark.unit):
    Deterministic unit tests using mocks/in-memory SQLite for retry, timeout,
    circuit breaker state machine, FastAPI fallback, Kafka producer/consumer, and HTTP timeouts.

Section B (@pytest.mark.integration):
    Live Docker Compose integration tests verifying normal API operation, cache HIT/MISS,
    resilience telemetry, and Nginx round-robin load balancing across replicas.
"""

from __future__ import annotations

import json
import time
from types import SimpleNamespace

import httpx
import pytest
import redis
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.database import Base
from src.kafka.consumer import process_event, process_message_with_retry
from src.messaging import kafka_producer
from src.resilience import (
    CircuitBreaker,
    CircuitOpenError,
    CircuitState,
    OperationTimeoutError,
    PermanentError,
    RetryConfig,
    RetryExhaustedError,
    TransientError,
    execute_with_retry,
    run_with_timeout,
)

# ---------------------------------------------------------------------------
# Shared Unit Test Fixtures
# ---------------------------------------------------------------------------
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

SAMPLE_ETA_PAYLOAD = {
    "Delivery_person_Age": 27,
    "Delivery_person_Ratings": 4.8,
    "Vehicle_condition": 2,
    "multiple_deliveries": 0,
    "distance_km": 4.2,
    "coordinates_valid": 1,
    "order_time_missing": 0,
    "order_hour": 19,
    "order_day": 20,
    "order_month": 5,
    "order_weekday": 2,
    "Weather_conditions": "Sunny",
    "Road_traffic_density": "Medium",
    "Type_of_order": "Meal",
    "Type_of_vehicle": "motorcycle",
    "Festival": "No",
    "City": "Metropolitian",
}


@pytest.fixture(scope="module", autouse=True)
def setup_fault_tolerance_test_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def isolated_api_client(monkeypatch):
    import src.api.main as api_main

    monkeypatch.setattr(api_main, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(api_main, "ensure_orders_table", lambda: None)
    api_main.redis_circuit_breaker.reset()
    monkeypatch.setattr(
        api_main,
        "REDIS_RETRY_CONFIG",
        RetryConfig(
            max_attempts=3,
            initial_backoff_seconds=0.01,
            backoff_multiplier=2.0,
            retryable_exceptions=(
                redis.ConnectionError,
                redis.TimeoutError,
                redis.BusyLoadingError,
                TimeoutError,
            ),
            non_retryable_exceptions=(
                redis.AuthenticationError,
                redis.ResponseError,
                redis.DataError,
                ValueError,
                TypeError,
            ),
        ),
    )

    with TestClient(api_main.app) as client:
        yield client, api_main

    api_main.redis_circuit_breaker.reset()


# ===========================================================================
# SECTION A: DETERMINISTIC UNIT TESTS
# ===========================================================================


@pytest.mark.unit
def test_retry_success_after_transient_failures():
    """Verify retry recovers after 2 transient errors with [1.0, 2.0] exponential backoff."""
    attempts = 0
    recorded_sleeps: list[float] = []

    def flaky_service() -> str:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise TransientError(f"temporary network glitch #{attempts}")
        return "OK"

    cfg = RetryConfig(max_attempts=3, initial_backoff_seconds=1.0, backoff_multiplier=2.0)
    result = execute_with_retry(
        flaky_service,
        config=cfg,
        operation_name="unit_flaky_service",
        sleep_fn=recorded_sleeps.append,
    )

    assert result == "OK"
    assert attempts == 3
    assert recorded_sleeps == [1.0, 2.0]


@pytest.mark.unit
def test_retry_exhaustion_after_max_attempts():
    """Verify retry stops at max_attempts=3 and raises RetryExhaustedError."""
    attempts = 0
    recorded_sleeps: list[float] = []

    def always_failing() -> None:
        nonlocal attempts
        attempts += 1
        raise TransientError(f"down on attempt {attempts}")

    cfg = RetryConfig(max_attempts=3, initial_backoff_seconds=1.0, backoff_multiplier=2.0)
    with pytest.raises(RetryExhaustedError) as exc_info:
        execute_with_retry(
            always_failing,
            config=cfg,
            operation_name="unit_always_failing",
            sleep_fn=recorded_sleeps.append,
        )

    assert attempts == 3
    assert exc_info.value.attempts == 3
    assert exc_info.value.delays == [1.0, 2.0]
    assert recorded_sleeps == [1.0, 2.0]


@pytest.mark.unit
def test_retry_does_not_retry_permanent_errors():
    """Verify PermanentError and ValueError fail immediately with zero retries."""
    recorded_sleeps: list[float] = []

    for err in (PermanentError("invalid credentials"), ValueError("bad input")):
        calls = 0

        def fail_once(exception_to_raise=err):
            nonlocal calls
            calls += 1
            raise exception_to_raise

        with pytest.raises(type(err)):
            execute_with_retry(
                fail_once,
                config=RetryConfig(max_attempts=3, initial_backoff_seconds=1.0),
                operation_name="unit_permanent_error",
                sleep_fn=recorded_sleeps.append,
            )
        assert calls == 1

    assert recorded_sleeps == []


@pytest.mark.unit
def test_retry_preserves_idempotency_key_no_duplicate_execution():
    """Verify idempotency key deduplicates logical writes when ack fails transiently."""
    committed_store: dict[str, dict] = {}
    write_executions = 0
    ack_calls = 0

    def idempotent_write(idem_key: str) -> dict:
        nonlocal write_executions, ack_calls
        ack_calls += 1
        if idem_key not in committed_store:
            write_executions += 1
            committed_store[idem_key] = {"order_id": "ORD-900", "status": "CREATED"}
        if ack_calls == 1:
            raise TransientError("Transient ACK timeout after store commit")
        return committed_store[idem_key]

    result = execute_with_retry(
        idempotent_write,
        "idem-p9-001",
        config=RetryConfig(max_attempts=3, initial_backoff_seconds=0.01),
        operation_name="idempotent_order_write",
        idempotency_key="idem-p9-001",
        sleep_fn=lambda _: None,
    )

    assert result == {"order_id": "ORD-900", "status": "CREATED"}
    assert ack_calls == 2
    assert write_executions == 1


@pytest.mark.unit
def test_timeout_handling_terminates_within_limit():
    """Verify a slow operation (2.0s) terminates near the 0.25s timeout limit."""

    def slow_dependency() -> str:
        time.sleep(2.0)
        return "too_late"

    start = time.perf_counter()
    with pytest.raises(OperationTimeoutError) as exc_info:
        run_with_timeout(slow_dependency, 0.25, operation_name="slow_dependency")
    elapsed = time.perf_counter() - start

    assert elapsed < 0.75
    assert exc_info.value.timeout_seconds == 0.25
    assert "slow_dependency" in str(exc_info.value)


@pytest.mark.unit
def test_timeout_handling_executes_fallback():
    """Verify run_with_timeout returns the fallback value gracefully on timeout."""

    def hung_dependency() -> dict:
        time.sleep(1.5)
        return {"source": "live"}

    result = run_with_timeout(
        hung_dependency,
        0.15,
        operation_name="hung_dependency",
        fallback=lambda err: {"source": "fallback", "reason": str(err)},
    )

    assert result["source"] == "fallback"
    assert "timed out" in result["reason"].lower()


@pytest.mark.unit
def test_circuit_breaker_closed_state_normal_requests():
    """Healthy requests keep the circuit CLOSED with failure_count == 0."""
    cb = CircuitBreaker(failure_threshold=3, recovery_timeout=5, name="test_closed")
    results = [cb.call(lambda x=i: x * 2) for i in range(4)]

    assert results == [0, 2, 4, 6]
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0
    assert cb.total_successes == 4


@pytest.mark.unit
def test_circuit_breaker_transitions_to_open_after_threshold():
    """Three failures trip CLOSED -> OPEN; 4th request fails fast without calling target."""
    cb = CircuitBreaker(failure_threshold=3, recovery_timeout=5, name="test_open")
    target_calls = 0

    def failing_dep() -> None:
        nonlocal target_calls
        target_calls += 1
        raise TransientError("Redis unavailable")

    for _ in range(3):
        with pytest.raises(TransientError):
            cb.call(failing_dep)

    assert cb.state == CircuitState.OPEN
    assert target_calls == 3

    with pytest.raises(CircuitOpenError):
        cb.call(failing_dep)

    # Underlying dependency was NOT called while circuit is OPEN
    assert target_calls == 3
    assert cb.total_rejections == 1


@pytest.mark.unit
def test_circuit_breaker_transitions_to_half_open_after_recovery_timeout():
    """After recovery_timeout, circuit transitions to HALF_OPEN and permits 1 probe."""
    cb = CircuitBreaker(
        failure_threshold=3,
        recovery_timeout=0.15,
        half_open_max_requests=1,
        name="test_half_open",
    )
    for _ in range(3):
        cb.record_failure()
    assert cb.state == CircuitState.OPEN

    time.sleep(0.20)
    assert cb.allow_request() is True
    assert cb.state == CircuitState.HALF_OPEN
    # Concurrent second request in HALF_OPEN must be rejected
    assert cb.allow_request() is False


@pytest.mark.unit
def test_circuit_breaker_recovers_to_closed_on_probe_success():
    """Successful HALF_OPEN probe transitions circuit back to CLOSED and resets failures."""
    cb = CircuitBreaker(failure_threshold=3, recovery_timeout=0.1, name="test_recovery")
    for _ in range(3):
        cb.record_failure()
    assert cb.state == CircuitState.OPEN

    time.sleep(0.15)
    result = cb.call(lambda: "recovered")
    assert result == "recovered"
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0


@pytest.mark.unit
def test_circuit_breaker_reopens_on_failed_half_open_probe():
    """Failed HALF_OPEN probe immediately transitions circuit back to OPEN."""
    cb = CircuitBreaker(failure_threshold=3, recovery_timeout=0.1, name="test_reopen")
    for _ in range(3):
        cb.record_failure()

    time.sleep(0.15)
    with pytest.raises(TransientError):
        cb.call(lambda: (_ for _ in ()).throw(TransientError("still broken")))

    assert cb.state == CircuitState.OPEN


@pytest.mark.unit
def test_fastapi_predict_redis_retry_circuit_breaker_and_fallback(
    isolated_api_client, monkeypatch
):
    """Verify /predict retries Redis failures, opens circuit, falls back to ML, and recovers."""
    client, api_main = isolated_api_client
    redis_calls = {"get": 0, "setex": 0}

    class FailingRedis:
        def get(self, key):
            redis_calls["get"] += 1
            raise redis.ConnectionError("Simulated Redis outage")

        def setex(self, key, ttl, value):
            redis_calls["setex"] += 1
            raise redis.ConnectionError("Simulated Redis outage")

    monkeypatch.setattr(api_main, "redis_client", FailingRedis())
    monkeypatch.setattr(api_main, "publish_eta_event", lambda event: False)

    # First 3 requests: each exhausts 3 retry attempts on get() -> 9 Redis calls total -> trips circuit OPEN
    for expected_failures in (1, 2, 3):
        resp = client.post("/predict", json=SAMPLE_ETA_PAYLOAD)
        assert resp.status_code == 200
        body = resp.json()
        assert body["predicted_eta_minutes"] > 0
        assert body["cache"]["status"] == "BYPASS"
        expected_state = "OPEN" if expected_failures == 3 else "CLOSED"
        assert body["cache"]["circuit_state"] == expected_state

    assert redis_calls["get"] == 9
    assert api_main.redis_circuit_breaker.state == CircuitState.OPEN

    # 4th request while OPEN: fail-fast bypasses Redis (0 new Redis calls)
    resp4 = client.post("/predict", json=SAMPLE_ETA_PAYLOAD)
    assert resp4.status_code == 200
    assert resp4.json()["cache"]["status"] == "BYPASS"
    assert resp4.json()["cache"]["circuit_state"] == "OPEN"
    assert redis_calls["get"] == 9

    # Restore Redis and fast-forward recovery timeout -> probe recovers circuit to CLOSED
    store: dict[str, str] = {}

    class HealthyRedis:
        def get(self, key):
            return store.get(key)

        def setex(self, key, ttl, value):
            store[key] = value
            return True

    monkeypatch.setattr(api_main, "redis_client", HealthyRedis())
    api_main.redis_circuit_breaker.last_failure_time = time.time() - 10.0

    resp5 = client.post("/predict", json=SAMPLE_ETA_PAYLOAD)
    assert resp5.status_code == 200
    assert resp5.json()["cache"]["status"] == "MISS"
    assert resp5.json()["cache"]["circuit_state"] == "CLOSED"

    resp6 = client.post("/predict", json=SAMPLE_ETA_PAYLOAD)
    assert resp6.status_code == 200
    assert resp6.json()["cache"]["status"] == "HIT"


@pytest.mark.unit
def test_resilience_status_endpoint(isolated_api_client):
    """Verify GET /resilience/status exposes circuit breaker, retry, timeout, and Kafka metrics."""
    client, _ = isolated_api_client
    resp = client.get("/resilience/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["redis_circuit_breaker"]["state"] == "CLOSED"
    assert data["redis_retry_config"]["max_attempts"] == 3
    assert data["timeouts"]["redis_connect_timeout_seconds"] > 0
    assert data["timeouts"]["kafka_delivery_timeout_ms"] > 0
    assert "published_count" in data["kafka_producer"]


@pytest.mark.unit
def test_kafka_producer_retry_timeout_and_permanent_error(monkeypatch):
    """Verify Kafka producer retries transient timeouts, stops on exhaustion, and skips permanent errors."""
    # 1. Permanent invalid payload (missing prediction_id) returns False without producing
    assert kafka_producer.publish_eta_event({"event_type": "NO_ID"}) is False

    # 2. Transient timeout twice, succeeds on 3rd attempt
    attempts = 0
    sleeps: list[float] = []

    class FlakyProducer:
        def produce(self, topic, key, value, callback=None):
            self._cb = callback

        def flush(self, timeout):
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                return 1  # remaining > 0 -> KafkaDeliveryTimeoutError
            if self._cb:
                self._cb(None, SimpleNamespace(topic=lambda: "eta-predictions"))
            return 0

    monkeypatch.setattr(kafka_producer, "producer", FlakyProducer())
    ok = kafka_producer.publish_eta_event(
        {"prediction_id": 101, "predicted_eta_minutes": 24.5},
        max_attempts=3,
        initial_backoff=1.0,
        flush_timeout=0.5,
        sleep_fn=sleeps.append,
    )
    assert ok is True
    assert attempts == 3
    assert sleeps == [1.0, 2.0]

    # 3. Persistent failure exhausts all 3 attempts and returns False
    dead_attempts = 0
    dead_sleeps: list[float] = []

    class DeadProducer:
        def produce(self, topic, key, value, callback=None):
            self._cb = callback

        def flush(self, timeout):
            nonlocal dead_attempts
            dead_attempts += 1
            if self._cb:
                self._cb("Broker unreachable", None)
            return 0

    monkeypatch.setattr(kafka_producer, "producer", DeadProducer())
    failed = kafka_producer.publish_eta_event(
        {"prediction_id": 102, "predicted_eta_minutes": 30.0},
        max_attempts=3,
        initial_backoff=1.0,
        flush_timeout=0.5,
        sleep_fn=dead_sleeps.append,
    )
    assert failed is False
    assert dead_attempts == 3
    assert dead_sleeps == [1.0, 2.0]


@pytest.mark.unit
def test_kafka_consumer_retry_and_permanent_error_handling():
    """Verify consumer retries transient errors with [1.0, 2.0] backoff and skips malformed JSON."""
    payload = json.dumps({"prediction_id": 501, "predicted_eta_minutes": 18.2}).encode("utf-8")
    valid_msg = SimpleNamespace(value=lambda: payload)

    # 1. Transient processor failure -> exhausts 3 attempts -> returns False (no ACK commit)
    sleeps: list[float] = []
    calls = 0

    def failing_processor(msg):
        nonlocal calls
        calls += 1
        raise TransientError("Downstream analytics DB temporarily locked")

    assert (
        process_message_with_retry(
            valid_msg,
            processor=failing_processor,
            max_attempts=3,
            initial_backoff=1.0,
            sleep_fn=sleeps.append,
        )
        is False
    )
    assert calls == 3
    assert sleeps == [1.0, 2.0]

    # 2. Malformed JSON -> PermanentError inside process_event -> 0 retries
    bad_msg = SimpleNamespace(value=lambda: b"{not-valid-json")
    bad_sleeps: list[float] = []
    assert (
        process_message_with_retry(
            bad_msg,
            processor=process_event,
            max_attempts=3,
            initial_backoff=1.0,
            sleep_fn=bad_sleeps.append,
        )
        is False
    )
    assert bad_sleeps == []


@pytest.mark.unit
def test_http_client_timeout_returns_504(isolated_api_client, monkeypatch):
    """Verify Razorpay outbound HTTP timeout returns graceful HTTP 504 Gateway Timeout."""
    client, api_main = isolated_api_client
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_timeoutKey1")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "unitTestSecretTimeout")

    def timed_out_post(*args, **kwargs):
        raise httpx.ReadTimeout("Simulated Razorpay API read timeout")

    monkeypatch.setattr(api_main.httpx, "post", timed_out_post)

    resp = client.post(
        "/payments/razorpay/order",
        json={
            "order_code": "MU-TIMEOUT-01",
            "idempotency_key": "idem-timeout-01",
            "restaurant_name": "Forno Neapolitan Kitchen",
            "customer_name": "Test Customer",
            "customer_phone": "+91 98765 43210",
            "delivery_address": "Indiranagar, Bengaluru",
            "items": [{"id": "m1", "name": "Pizza", "price": 250.0, "quantity": 1}],
            "amount_inr": 250.0,
            "payment_method": "razorpay",
            "payment_status": "PENDING",
        },
    )
    assert resp.status_code == 504
    assert "timed out" in resp.json()["detail"].lower()


# ===========================================================================
# SECTION B: LIVE DOCKER INTEGRATION TESTS
# ===========================================================================


def _require_live_stack(base_url: str = "http://localhost:8000") -> None:
    try:
        r = httpx.get(f"{base_url}/health", timeout=2.0)
        if r.status_code != 200:
            pytest.skip(f"Live Docker stack returned HTTP {r.status_code} on /health")
    except httpx.HTTPError as exc:
        pytest.skip(f"Live Docker stack not reachable at {base_url}: {exc}")


@pytest.mark.integration
def test_live_normal_operation_and_cache_hit_miss():
    """Experiment 1 live check: /health, /resilience/status, and /predict cache MISS -> HIT."""
    base_url = "http://localhost:8000"
    _require_live_stack(base_url)

    health_resp = httpx.get(f"{base_url}/health", timeout=5.0)
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] == "healthy"
    assert health_resp.json()["redis_circuit"] == "CLOSED"

    res_resp = httpx.get(f"{base_url}/resilience/status", timeout=5.0)
    assert res_resp.status_code == 200
    assert res_resp.json()["redis_circuit_breaker"]["state"] == "CLOSED"

    unique_payload = {
        **SAMPLE_ETA_PAYLOAD,
        "distance_km": round(3.0 + (int(time.time()) % 100) / 100.0, 2),
    }
    first = httpx.post(f"{base_url}/predict", json=unique_payload, timeout=15.0)
    assert first.status_code == 200
    first_data = first.json()
    assert first_data["predicted_eta_minutes"] > 0
    assert first_data["cache"]["status"] == "MISS"
    assert first_data["cache"]["circuit_state"] == "CLOSED"
    assert first_data["kafka"]["status"] == "PUBLISHED"

    second = httpx.post(f"{base_url}/predict", json=unique_payload, timeout=15.0)
    assert second.status_code == 200
    second_data = second.json()
    assert second_data["predicted_eta_minutes"] == first_data["predicted_eta_minutes"]
    assert second_data["cache"]["status"] == "HIT"
    assert second_data["cache"]["circuit_state"] == "CLOSED"


@pytest.mark.integration
def test_live_nginx_round_robin_across_replicas():
    """Verify Nginx distributes /health requests across multiple FastAPI container instances."""
    base_url = "http://localhost:8000"
    _require_live_stack(base_url)

    instances = []
    for _ in range(6):
        resp = httpx.get(f"{base_url}/health", timeout=5.0)
        assert resp.status_code == 200
        instances.append(resp.json()["instance"])

    assert len(set(instances)) >= 2

