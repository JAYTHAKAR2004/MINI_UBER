"""Thread-safe Circuit Breaker supporting CLOSED, OPEN, and HALF_OPEN states."""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Optional

from src.resilience.logging_config import get_logger

logger = get_logger("resilience.circuit_breaker")


class CircuitState(Enum):
    """Finite states of the circuit breaker."""

    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitOpenError(Exception):
    """Raised when a call is rejected because the circuit breaker is OPEN."""

    def __init__(self, circuit_name: str, retry_after_seconds: float = 0.0) -> None:
        self.circuit_name = circuit_name
        self.retry_after_seconds = max(0.0, retry_after_seconds)
        super().__init__(
            f"Circuit '{circuit_name}' is OPEN; rejecting call "
            f"(retry_after={self.retry_after_seconds:.2f}s)"
        )


class CircuitBreaker:
    """Reusable thread-safe circuit breaker with telemetry and fallback execution."""

    def __init__(
        self,
        failure_threshold: int = 3,
        recovery_timeout: float = 5,
        half_open_max_requests: int = 1,
        name: str = "default",
    ) -> None:
        if failure_threshold < 1:
            raise ValueError("failure_threshold must be >= 1")
        if recovery_timeout < 0:
            raise ValueError("recovery_timeout must be >= 0")
        if half_open_max_requests < 1:
            raise ValueError("half_open_max_requests must be >= 1")

        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_requests = half_open_max_requests

        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.state = CircuitState.CLOSED
        self.half_open_test_in_progress = False
        self.half_open_in_flight = 0

        self.total_successes = 0
        self.total_failures = 0
        self.total_rejections = 0
        self.state_changed_at = time.time()
        self.transition_history: list[dict[str, Any]] = []
        self.lock = threading.Lock()

    def _record_transition(self, new_state: CircuitState, reason: str) -> None:
        previous = self.state
        if previous == new_state:
            return
        self.state = new_state
        self.state_changed_at = time.time()
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "from_state": previous.value,
            "to_state": new_state.value,
            "reason": reason,
        }
        self.transition_history.append(entry)
        if len(self.transition_history) > 25:
            self.transition_history = self.transition_history[-25:]

    def allow_request(self) -> bool:
        """Determine whether a request is allowed under the current circuit state."""
        with self.lock:
            if self.state == CircuitState.OPEN:
                elapsed = (
                    time.time() - self.last_failure_time
                    if self.last_failure_time is not None
                    else 0.0
                )
                if self.last_failure_time is not None and elapsed >= self.recovery_timeout:
                    self._record_transition(
                        CircuitState.HALF_OPEN,
                        f"Recovery timeout ({self.recovery_timeout}s) elapsed",
                    )
                    self.half_open_in_flight = 1
                    self.half_open_test_in_progress = True
                    logger.warning(
                        "Circuit '%s': OPEN -> HALF_OPEN after %.2fs; allowing 1 health probe",
                        self.name,
                        elapsed,
                    )
                    return True

                self.total_rejections += 1
                remaining = max(0.0, self.recovery_timeout - elapsed)
                logger.warning(
                    "Circuit '%s': OPEN - Request blocked (retry in %.2fs)",
                    self.name,
                    remaining,
                )
                return False

            if self.state == CircuitState.HALF_OPEN:
                if self.half_open_in_flight >= self.half_open_max_requests:
                    self.total_rejections += 1
                    logger.warning(
                        "Circuit '%s': HALF_OPEN - Probe already in flight, rejecting concurrent request",
                        self.name,
                    )
                    return False

                self.half_open_in_flight += 1
                self.half_open_test_in_progress = True
                return True

            return True

    def record_success(self) -> None:
        """Record a successful dependency call and reset failure tracking."""
        with self.lock:
            previous_state = self.state
            self.total_successes += 1
            self.failure_count = 0
            self.last_failure_time = None
            self.half_open_in_flight = 0
            self.half_open_test_in_progress = False
            if previous_state != CircuitState.CLOSED:
                self._record_transition(
                    CircuitState.CLOSED,
                    "Dependency recovered on probe/request success",
                )
                logger.info(
                    "Circuit '%s': %s -> CLOSED - Service recovered; failure count reset to 0",
                    self.name,
                    previous_state.value,
                )
            else:
                logger.debug("Circuit '%s': CLOSED - Request succeeded", self.name)

    def record_failure(self) -> None:
        """Record a failed dependency call and open the circuit when threshold is reached."""
        with self.lock:
            previous_state = self.state
            self.total_failures += 1
            self.failure_count += 1
            self.last_failure_time = time.time()
            self.half_open_in_flight = 0
            self.half_open_test_in_progress = False

            if previous_state == CircuitState.HALF_OPEN:
                self._record_transition(
                    CircuitState.OPEN,
                    "HALF_OPEN probe request failed",
                )
                logger.error(
                    "Circuit '%s': HALF_OPEN -> OPEN - Recovery probe failed",
                    self.name,
                )
            elif self.failure_count >= self.failure_threshold:
                self._record_transition(
                    CircuitState.OPEN,
                    f"Failure threshold reached ({self.failure_count}/{self.failure_threshold})",
                )
                logger.error(
                    "Circuit '%s': %s -> OPEN - Failure threshold reached (%d/%d)",
                    self.name,
                    previous_state.value,
                    self.failure_count,
                    self.failure_threshold,
                )
            else:
                logger.warning(
                    "Circuit '%s': Failure recorded (%d/%d)",
                    self.name,
                    self.failure_count,
                    self.failure_threshold,
                )

    def call(
        self,
        func: Callable[..., Any],
        *args: Any,
        fallback: Optional[Callable[[BaseException], Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """Execute ``func`` through the circuit breaker, optionally returning ``fallback``."""
        if not self.allow_request():
            with self.lock:
                elapsed = (
                    time.time() - self.last_failure_time
                    if self.last_failure_time is not None
                    else 0.0
                )
                retry_after = max(0.0, self.recovery_timeout - elapsed)
            open_err = CircuitOpenError(self.name, retry_after_seconds=retry_after)
            if fallback is not None:
                logger.warning(
                    "Circuit '%s' OPEN — executing graceful fallback",
                    self.name,
                )
                return fallback(open_err)
            raise open_err

        try:
            result = func(*args, **kwargs)
        except BaseException as exc:
            self.record_failure()
            if fallback is not None:
                logger.warning(
                    "Circuit '%s' call failed (%s) — executing graceful fallback",
                    self.name,
                    exc,
                )
                return fallback(exc)
            raise
        else:
            self.record_success()
            return result

    def reset(self) -> None:
        """Reset circuit breaker state and counters back to CLOSED."""
        with self.lock:
            previous_state = self.state
            self.failure_count = 0
            self.last_failure_time = None
            self.half_open_in_flight = 0
            self.half_open_test_in_progress = False
            if previous_state != CircuitState.CLOSED:
                self._record_transition(CircuitState.CLOSED, "Manual reset")
            logger.info("Circuit '%s': Reset to CLOSED", self.name)

    def get_status(self) -> dict[str, Any]:
        """Return a JSON-serializable telemetry snapshot of the circuit breaker."""
        with self.lock:
            retry_after = 0.0
            if self.state == CircuitState.OPEN and self.last_failure_time is not None:
                retry_after = max(
                    0.0,
                    self.recovery_timeout - (time.time() - self.last_failure_time),
                )
            return {
                "name": self.name,
                "state": self.state.value,
                "failure_count": self.failure_count,
                "failure_threshold": self.failure_threshold,
                "recovery_timeout_seconds": self.recovery_timeout,
                "half_open_max_requests": self.half_open_max_requests,
                "half_open_in_flight": self.half_open_in_flight,
                "retry_after_seconds": round(retry_after, 3),
                "total_successes": self.total_successes,
                "total_failures": self.total_failures,
                "total_rejections": self.total_rejections,
                "recent_transitions": list(self.transition_history[-10:]),
            }
