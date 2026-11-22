import time
from src.resilience.circuit_breaker import CircuitBreaker, CircuitState

cb = CircuitBreaker(failure_threshold=3, recovery_timeout=0.1)

print("TEST 1: Three failures should OPEN the circuit")
for _ in range(3):
    cb.record_failure()

assert cb.state == CircuitState.OPEN
print("PASSED\n")

print("TEST 2: OPEN circuit should block requests")
assert cb.allow_request() is False
print("PASSED\n")

print("TEST 3: HALF_OPEN should allow only one test request")
time.sleep(0.15)

assert cb.allow_request() is True
assert cb.state == CircuitState.HALF_OPEN
assert cb.allow_request() is False
print("PASSED\n")

print("TEST 4: Successful recovery should CLOSE the circuit")
cb.record_success()
assert cb.state == CircuitState.CLOSED
assert cb.failure_count == 0
print("PASSED\n")

print("TEST 5: Failed HALF_OPEN test should reopen the circuit")
for _ in range(3):
    cb.record_failure()

time.sleep(0.15)
assert cb.allow_request() is True
cb.record_failure()

assert cb.state == CircuitState.OPEN
print("PASSED\n")

print("ALL CIRCUIT BREAKER TESTS PASSED!")
