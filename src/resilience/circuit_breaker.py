
import time
import threading
from enum import Enum


class CircuitState(Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitBreaker:
    def __init__(self, failure_threshold=3, recovery_timeout=5):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = CircuitState.CLOSED
        self.half_open_test_in_progress = False
        self.lock = threading.Lock()

    def allow_request(self):
        with self.lock:
            if self.state == CircuitState.OPEN:
                if (
                    self.last_failure_time is not None
                    and time.time() - self.last_failure_time >= self.recovery_timeout
                ):
                    self.state = CircuitState.HALF_OPEN
                    self.half_open_test_in_progress = True
                    print("Circuit: HALF_OPEN - Testing service")
                    return True

                print("Circuit: OPEN - Request blocked")
                return False

            if self.state == CircuitState.HALF_OPEN:
                if self.half_open_test_in_progress:
                    return False

                self.half_open_test_in_progress = True
                return True

            return True

    def record_success(self):
        with self.lock:
            self.failure_count = 0
            self.last_failure_time = None
            self.half_open_test_in_progress = False
            self.state = CircuitState.CLOSED
            print("Circuit: CLOSED - Service healthy")

    def record_failure(self):
        with self.lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            self.half_open_test_in_progress = False

            if (
                self.state == CircuitState.HALF_OPEN
                or self.failure_count >= self.failure_threshold
            ):
                self.state = CircuitState.OPEN
                print("Circuit: OPEN - Failure threshold reached")
            else:
                print(
                    f"Failure count: "
                    f"{self.failure_count}/{self.failure_threshold}"
                )
