"""Live and deterministic fault-tolerance experiment runner for P9 practical evaluation.

Executes Experiments 1 through 9 against the Mini-Uber-ETA codebase and live Docker
Compose services, printing structured terminal logs and recording actual timings/results
to reports/P9_experiment_results.json.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.resilience import (  # noqa: E402
    CircuitBreaker,
    CircuitOpenError,
    CircuitState,
    OperationTimeoutError,
    PermanentError,
    RetryConfig,
    RetryExhaustedError,
    TransientError,
    configure_logging,
    execute_with_retry,
    run_with_timeout,
)

BASE_URL = os.getenv("MINI_UBER_API_URL", "http://localhost:8000").rstrip("/")
RESULTS_PATH = ROOT / "reports" / "P9_experiment_results.json"

BASE_PREDICT_PAYLOAD = {
    "Delivery_person_Age": 28,
    "Delivery_person_Ratings": 4.8,
    "Vehicle_condition": 2,
    "multiple_deliveries": 0,
    "distance_km": 5.25,
    "coordinates_valid": 1,
    "order_time_missing": 0,
    "order_hour": 20,
    "order_day": 15,
    "order_month": 5,
    "order_weekday": 2,
    "Weather_conditions": "Cloudy",
    "Road_traffic_density": "Medium",
    "Type_of_order": "Meal",
    "Type_of_vehicle": "motorcycle",
    "Festival": "No",
    "City": "Metropolitian",
}


def _banner(title: str) -> None:
    print("\n" + "=" * 78)
    print(f"  {title}")
    print("=" * 78)


def _run_cmd(cmd: list[str], timeout: int = 60) -> tuple[int, str]:
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    combined = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, combined.strip()


def _get_api_containers() -> list[str]:
    names: list[str] = []
    for svc in ("api1", "api2", "api3"):
        rc, out = _run_cmd(
            ["docker", "ps", "--filter", f"label=com.docker.compose.service={svc}", "--format", "{{.Names}}"]
        )
        if rc == 0 and out.strip():
            names.append(out.strip().splitlines()[0])
    return names or ["mini_uber_api1", "mini_uber_api2", "mini_uber_api3"]


def _wait_for_http_health(timeout_sec: int = 45) -> dict[str, Any]:
    deadline = time.time() + timeout_sec
    last_err = ""
    while time.time() < deadline:
        try:
            r = httpx.get(f"{BASE_URL}/health", timeout=3.0)
            if r.status_code == 200:
                return r.json()
            last_err = f"HTTP {r.status_code}"
        except Exception as exc:
            last_err = str(exc)
        time.sleep(1.0)
    raise RuntimeError(f"API health check did not recover within {timeout_sec}s: {last_err}")


def _wait_for_container_healthy(container: str, timeout_sec: int = 60) -> None:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        rc, out = _run_cmd(
            ["docker", "inspect", "-f", "{{.State.Health.Status}}|{{.State.Running}}", container]
        )
        if rc == 0:
            parts = out.strip().split("|")
            health = parts[0] if parts else ""
            running = parts[1] if len(parts) > 1 else ""
            if health == "healthy" or (health == "<no value>" and running == "true"):
                return
        time.sleep(1.5)
    raise RuntimeError(f"Container {container} did not become healthy within {timeout_sec}s")


def experiment_1_normal_operation() -> dict[str, Any]:
    _banner("EXPERIMENT 1: Normal Operation (Healthy API, Redis Cache MISS -> HIT, Kafka)")
    health = httpx.get(f"{BASE_URL}/health", timeout=5.0).json()
    resilience = httpx.get(f"{BASE_URL}/resilience/status", timeout=5.0).json()

    unique_payload = {
        **BASE_PREDICT_PAYLOAD,
        "distance_km": round(4.10 + (int(time.time()) % 90) / 100.0, 2),
    }

    t1 = time.perf_counter()
    r1 = httpx.post(f"{BASE_URL}/predict", json=unique_payload, timeout=15.0)
    lat1 = round((time.perf_counter() - t1) * 1000, 2)
    b1 = r1.json()

    t2 = time.perf_counter()
    r2 = httpx.post(f"{BASE_URL}/predict", json=unique_payload, timeout=15.0)
    lat2 = round((time.perf_counter() - t2) * 1000, 2)
    b2 = r2.json()

    print(f"GET /health -> {json.dumps(health)}")
    print(f"GET /resilience/status -> circuit={resilience['redis_circuit_breaker']['state']}, "
          f"timeouts={resilience['timeouts']}")
    print(f"POST /predict #1 (Cold / Cache MISS): status={r1.status_code}, "
          f"eta={b1['predicted_eta_minutes']}m, cache={b1['cache']}, "
          f"kafka={b1['kafka']}, client_latency={lat1}ms")
    print(f"POST /predict #2 (Warm / Cache HIT) : status={r2.status_code}, "
          f"eta={b2['predicted_eta_minutes']}m, cache={b2['cache']}, "
          f"kafka={b2['kafka']}, client_latency={lat2}ms")

    passed = (
        r1.status_code == 200
        and r2.status_code == 200
        and b1["cache"]["status"] == "MISS"
        and b2["cache"]["status"] == "HIT"
        and b1["kafka"]["status"] == "PUBLISHED"
        and health["redis_circuit"] == "CLOSED"
    )
    print(f"RESULT: {'PASS' if passed else 'FAIL'}")
    return {
        "experiment": 1,
        "name": "Normal Operation",
        "passed": passed,
        "health": health,
        "miss_latency_ms": lat1,
        "hit_latency_ms": lat2,
        "predict_1": b1,
        "predict_2": b2,
    }


def experiment_2_retry_mechanism(mode: str = "both") -> dict[str, Any]:
    configure_logging("INFO")
    cfg = RetryConfig(max_attempts=3, initial_backoff_seconds=1.0, backoff_multiplier=2.0)
    result: dict[str, Any] = {"experiment": 2, "name": "Retry Mechanism"}

    if mode in ("both", "success"):
        _banner("EXPERIMENT 2A: Retry Mechanism – Transient Failure Recovery (Max 3, Backoff 1s, 2s)")
        attempts = 0
        delays: list[float] = []

        def flaky_redis_call() -> str:
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise TransientError(f"Simulated transient connection reset on attempt {attempts}")
            return "CACHED_ETA_26.5"

        t0 = time.perf_counter()
        val = execute_with_retry(
            flaky_redis_call,
            config=cfg,
            operation_name="redis_transient_probe",
            idempotency_key="exp2-retry-success",
            on_retry=lambda att, exc, d: delays.append(d),
        )
        elapsed = round(time.perf_counter() - t0, 3)
        print(f"Recovered value={val} | attempts={attempts} | backoff_delays={delays} | elapsed={elapsed}s")
        result["recovery_case"] = {
            "passed": val == "CACHED_ETA_26.5" and attempts == 3 and delays == [1.0, 2.0],
            "attempts": attempts,
            "delays": delays,
            "elapsed_seconds": elapsed,
        }

    if mode in ("both", "exhaustion"):
        _banner("EXPERIMENT 2B: Retry Exhaustion & Permanent Error Skipping")
        exhaust_attempts = 0
        exhaust_delays: list[float] = []

        def always_down() -> None:
            nonlocal exhaust_attempts
            exhaust_attempts += 1
            raise TransientError(f"Simulated persistent outage on attempt {exhaust_attempts}")

        t0 = time.perf_counter()
        exhausted_err = None
        try:
            execute_with_retry(
                always_down,
                config=cfg,
                operation_name="redis_persistent_outage",
                idempotency_key="exp2-retry-exhaust",
                on_retry=lambda att, exc, d: exhaust_delays.append(d),
            )
        except RetryExhaustedError as exc:
            exhausted_err = str(exc)
        exhaust_elapsed = round(time.perf_counter() - t0, 3)

        perm_attempts = 0

        def invalid_auth() -> None:
            nonlocal perm_attempts
            perm_attempts += 1
            raise PermanentError("AuthenticationError: invalid Redis ACL password")

        t1 = time.perf_counter()
        perm_err = None
        try:
            execute_with_retry(
                invalid_auth,
                config=cfg,
                operation_name="redis_auth_check",
            )
        except PermanentError as exc:
            perm_err = str(exc)
        perm_elapsed = round(time.perf_counter() - t1, 4)

        print(f"Exhausted after {exhaust_attempts} attempts (delays={exhaust_delays}, elapsed={exhaust_elapsed}s): {exhausted_err}")
        print(f"Permanent error stopped after {perm_attempts} attempt (elapsed={perm_elapsed}s): {perm_err}")
        result["exhaustion_case"] = {
            "passed": exhausted_err is not None and exhaust_attempts == 3 and perm_attempts == 1,
            "exhaust_attempts": exhaust_attempts,
            "exhaust_delays": exhaust_delays,
            "exhaust_elapsed_seconds": exhaust_elapsed,
            "permanent_attempts": perm_attempts,
            "permanent_elapsed_seconds": perm_elapsed,
        }

    result["passed"] = all(
        v["passed"] for k, v in result.items() if k in ("recovery_case", "exhaustion_case")
    )
    print(f"RESULT: {'PASS' if result['passed'] else 'FAIL'}")
    return result


def experiment_3_timeout_handling() -> dict[str, Any]:
    _banner("EXPERIMENT 3: Timeout Handling – Artificial 2.5s Delay with 0.5s Limit & Fallback")
    configure_logging("INFO")

    def slow_external_service() -> dict[str, Any]:
        time.sleep(2.5)
        return {"source": "remote", "eta": 31.0}

    t0 = time.perf_counter()
    raised_timeout: dict[str, Any] = {}
    try:
        run_with_timeout(
            slow_external_service,
            timeout_seconds=0.5,
            operation_name="slow_eta_external_lookup",
        )
    except OperationTimeoutError as exc:
        raised_timeout = {
            "message": str(exc),
            "elapsed_seconds": round(time.perf_counter() - t0, 3),
        }

    t1 = time.perf_counter()
    fallback_res = run_with_timeout(
        slow_external_service,
        timeout_seconds=0.5,
        operation_name="slow_eta_external_lookup",
        fallback=lambda err: {
            "source": "local_ml_fallback",
            "status": "TIMEOUT_FALLBACK",
            "reason": str(err),
        },
    )
    fallback_elapsed = round(time.perf_counter() - t1, 3)

    print(f"Direct timeout call terminated at {raised_timeout['elapsed_seconds']}s -> {raised_timeout['message']}")
    print(f"Fallback timeout call terminated at {fallback_elapsed}s -> {json.dumps(fallback_res)}")

    passed = (
        raised_timeout.get("elapsed_seconds", 99) < 1.0
        and fallback_elapsed < 1.0
        and fallback_res.get("status") == "TIMEOUT_FALLBACK"
    )
    print(f"RESULT: {'PASS' if passed else 'FAIL'}")
    return {
        "experiment": 3,
        "name": "Timeout Handling",
        "passed": passed,
        "direct_timeout": raised_timeout,
        "fallback_elapsed_seconds": fallback_elapsed,
        "fallback_response": fallback_res,
    }


def _build_demo_cb() -> CircuitBreaker:
    return CircuitBreaker(
        failure_threshold=3,
        recovery_timeout=5.0,
        half_open_max_requests=1,
        name="redis_cache_demo",
    )


def experiment_4_cb_closed() -> dict[str, Any]:
    _banner("EXPERIMENT 4: Circuit Breaker – CLOSED State (Healthy Dependency)")
    configure_logging("INFO")
    cb = _build_demo_cb()

    outcomes = []
    for i in range(1, 5):
        res = cb.call(lambda idx=i: f"cache-hit-{idx}")
        outcomes.append(res)
        print(f"Request #{i}: result={res} | state={cb.state.value} | failures={cb.failure_count}")

    status = cb.get_status()
    print(f"Circuit Status Snapshot: {json.dumps(status)}")
    passed = cb.state == CircuitState.CLOSED and cb.failure_count == 0 and cb.total_successes == 4
    print(f"RESULT: {'PASS' if passed else 'FAIL'}")
    return {"experiment": 4, "name": "Circuit Breaker CLOSED", "passed": passed, "status": status}


def experiment_5_cb_open() -> dict[str, Any]:
    _banner("EXPERIMENT 5: Circuit Breaker – OPEN State (Failure Threshold = 3)")
    configure_logging("INFO")
    cb = _build_demo_cb()
    dep_calls = 0

    def failing_redis() -> None:
        nonlocal dep_calls
        dep_calls += 1
        raise TransientError("ConnectionRefusedError: Redis port 6379 closed")

    for i in range(1, 6):
        t0 = time.perf_counter()
        try:
            cb.call(failing_redis)
        except TransientError as exc:
            ms = round((time.perf_counter() - t0) * 1000, 3)
            print(f"Request #{i}: dependency error ({exc}) in {ms}ms | state={cb.state.value} | dep_calls={dep_calls}")
        except CircuitOpenError as exc:
            ms = round((time.perf_counter() - t0) * 1000, 3)
            print(f"Request #{i}: REJECTED FAST ({exc}) in {ms}ms | state={cb.state.value} | dep_calls={dep_calls}")

    status = cb.get_status()
    print(f"Circuit Status Snapshot: {json.dumps(status)}")
    passed = cb.state == CircuitState.OPEN and dep_calls == 3 and cb.total_rejections == 2
    print(f"RESULT: {'PASS' if passed else 'FAIL'}")
    return {"experiment": 5, "name": "Circuit Breaker OPEN", "passed": passed, "dep_calls": dep_calls, "status": status}


def experiment_6_cb_half_open() -> dict[str, Any]:
    _banner("EXPERIMENT 6: Circuit Breaker – HALF_OPEN State (After 5s Recovery Timeout)")
    configure_logging("INFO")
    cb = _build_demo_cb()
    for _ in range(3):
        cb.record_failure()
    print(f"Initial tripped state: {cb.state.value} | waiting 5.1s for recovery_timeout...")
    time.sleep(5.1)

    probe_allowed = cb.allow_request()
    state_after_first = cb.state.value
    concurrent_allowed = cb.allow_request()
    print(f"Probe #1 allowed={probe_allowed} -> state={state_after_first}")
    print(f"Concurrent Probe #2 allowed={concurrent_allowed} (blocked while probe in flight)")

    status = cb.get_status()
    passed = probe_allowed is True and state_after_first == "HALF_OPEN" and concurrent_allowed is False
    print(f"RESULT: {'PASS' if passed else 'FAIL'}")
    return {"experiment": 6, "name": "Circuit Breaker HALF_OPEN", "passed": passed, "status": status}


def experiment_7_cb_recovery() -> dict[str, Any]:
    _banner("EXPERIMENT 7: Circuit Breaker Recovery (HALF_OPEN -> CLOSED)")
    configure_logging("INFO")
    cb = _build_demo_cb()
    for _ in range(3):
        cb.record_failure()
    print(f"Tripped state={cb.state.value}, failures={cb.failure_count}; sleeping 5.1s...")
    time.sleep(5.1)

    recovered_val = cb.call(lambda: "REDIS_PING_PONG")
    print(f"Probe succeeded: {recovered_val} | state={cb.state.value} | failures={cb.failure_count}")
    followup_val = cb.call(lambda: "NORMAL_TRAFFIC_OK")
    print(f"Follow-up request succeeded: {followup_val} | state={cb.state.value}")

    status = cb.get_status()
    passed = cb.state == CircuitState.CLOSED and cb.failure_count == 0
    print(f"RESULT: {'PASS' if passed else 'FAIL'}")
    return {"experiment": 7, "name": "Circuit Breaker Recovery", "passed": passed, "status": status}


def experiment_8_redis_failure_and_recovery(phase: str = "both") -> dict[str, Any]:
    """Experiment 8: Live Redis outage (docker stop mini_uber_redis) and recovery."""
    out: dict[str, Any] = {"experiment": 8, "name": "Live Redis Failure & Recovery"}
    try:
        if phase in ("both", "failure"):
            _banner("EXPERIMENT 8A: Live Redis Failure (Stopping container mini_uber_redis)")
            print("Stopping Docker container 'mini_uber_redis'...")
            rc, stop_out = _run_cmd(["docker", "stop", "mini_uber_redis"])
            print(f"docker stop mini_uber_redis -> rc={rc}, output={stop_out}")

            # Send 12 requests so all 3 API replicas (round-robin) cross failure_threshold=3 and open circuits
            outage_requests = []
            for idx in range(1, 13):
                t0 = time.perf_counter()
                resp = httpx.post(f"{BASE_URL}/predict", json=BASE_PREDICT_PAYLOAD, timeout=45.0)
                lat_ms = round((time.perf_counter() - t0) * 1000, 2)
                body = resp.json()
                entry = {
                    "req": idx,
                    "status_code": resp.status_code,
                    "eta": body.get("predicted_eta_minutes"),
                    "cache_status": body.get("cache", {}).get("status"),
                    "circuit_state": body.get("cache", {}).get("circuit_state"),
                    "latency_ms": lat_ms,
                }
                outage_requests.append(entry)
                print(
                    f"Req #{idx:02d}: HTTP {entry['status_code']} | ETA={entry['eta']}m | "
                    f"cache={entry['cache_status']} | circuit={entry['circuit_state']} | "
                    f"latency={entry['latency_ms']}ms"
                )

            api_names = _get_api_containers()
            _, api1_logs = _run_cmd(["docker", "logs", "--tail", "18", api_names[0]])
            print(f"\n--- Recent {api_names[0]} logs ---")
            print(api1_logs)

            open_seen = any(r["circuit_state"] == "OPEN" for r in outage_requests)
            all_200 = all(r["status_code"] == 200 and r["cache_status"] == "BYPASS" for r in outage_requests)
            out["failure_phase"] = {
                "passed": all_200 and open_seen,
                "requests": outage_requests,
                "api1_logs_excerpt": api1_logs.splitlines()[-12:],
            }

        if phase in ("both", "recovery"):
            _banner("EXPERIMENT 8B: Live Redis Recovery (Starting container mini_uber_redis)")
            print("Starting Docker container 'mini_uber_redis'...")
            rc, start_out = _run_cmd(["docker", "start", "mini_uber_redis"])
            print(f"docker start mini_uber_redis -> rc={rc}, output={start_out}")
            _wait_for_container_healthy("mini_uber_redis", timeout_sec=45)
            print("mini_uber_redis is healthy. Waiting 5.5s for circuit recovery_timeout...")
            time.sleep(5.5)

            recovery_requests = []
            for idx in range(1, 7):
                t0 = time.perf_counter()
                resp = httpx.post(f"{BASE_URL}/predict", json=BASE_PREDICT_PAYLOAD, timeout=15.0)
                lat_ms = round((time.perf_counter() - t0) * 1000, 2)
                body = resp.json()
                entry = {
                    "req": idx,
                    "status_code": resp.status_code,
                    "cache_status": body.get("cache", {}).get("status"),
                    "circuit_state": body.get("cache", {}).get("circuit_state"),
                    "latency_ms": lat_ms,
                }
                recovery_requests.append(entry)
                print(
                    f"Recovery Req #{idx}: HTTP {entry['status_code']} | "
                    f"cache={entry['cache_status']} | circuit={entry['circuit_state']} | "
                    f"latency={entry['latency_ms']}ms"
                )

            closed_all = all(
                r["status_code"] == 200
                and r["circuit_state"] == "CLOSED"
                and r["cache_status"] in ("MISS", "HIT")
                for r in recovery_requests
            )
            out["recovery_phase"] = {
                "passed": closed_all,
                "requests": recovery_requests,
            }
    finally:
        # Always guarantee Redis is running even if an error occurred
        _run_cmd(["docker", "start", "mini_uber_redis"])
        _wait_for_container_healthy("mini_uber_redis", timeout_sec=45)

    out["passed"] = all(
        v["passed"] for k, v in out.items() if k in ("failure_phase", "recovery_phase")
    )
    print(f"RESULT: {'PASS' if out['passed'] else 'FAIL'}")
    return out


def experiment_9_kafka_failure_and_recovery(phase: str = "both") -> dict[str, Any]:
    """Experiment 9: Live Redpanda/Kafka outage (docker stop mini_uber_kafka) and recovery."""
    out: dict[str, Any] = {"experiment": 9, "name": "Live Kafka/Redpanda Failure & Recovery"}
    try:
        if phase in ("both", "failure"):
            _banner("EXPERIMENT 9A: Live Kafka/Redpanda Failure (Stopping container mini_uber_kafka)")
            print("Stopping Docker container 'mini_uber_kafka'...")
            rc, stop_out = _run_cmd(["docker", "stop", "mini_uber_kafka"])
            print(f"docker stop mini_uber_kafka -> rc={rc}, output={stop_out}")

            t0 = time.perf_counter()
            resp = httpx.post(f"{BASE_URL}/predict", json=BASE_PREDICT_PAYLOAD, timeout=40.0)
            lat_ms = round((time.perf_counter() - t0) * 1000, 2)
            body = resp.json()
            print(
                f"POST /predict during Kafka outage -> HTTP {resp.status_code} | "
                f"ETA={body.get('predicted_eta_minutes')}m | kafka={body.get('kafka')} | "
                f"latency={lat_ms}ms"
            )

            # Inspect logs across api1/api2/api3 to show the exact container that logged Kafka retries
            matched_logs = []
            for cname in _get_api_containers():
                _, logs = _run_cmd(["docker", "logs", "--tail", "25", cname])
                if "kafka_publish_eta_event" in logs or "Kafka" in logs:
                    matched_logs.append((cname, logs.splitlines()[-12:]))
            if matched_logs:
                cname, lines = matched_logs[-1]
                print(f"\n--- Kafka producer resilience logs from {cname} ---")
                print("\n".join(lines))

            passed_fail = resp.status_code == 200 and body.get("kafka", {}).get("status") == "FAILED"
            out["failure_phase"] = {
                "passed": passed_fail,
                "status_code": resp.status_code,
                "latency_ms": lat_ms,
                "response": body,
                "logs": matched_logs[-1][1] if matched_logs else [],
            }

        if phase in ("both", "recovery"):
            _banner("EXPERIMENT 9B: Live Kafka/Redpanda Recovery (Starting container mini_uber_kafka)")
            print("Starting Docker container 'mini_uber_kafka'...")
            rc, start_out = _run_cmd(["docker", "start", "mini_uber_kafka"])
            print(f"docker start mini_uber_kafka -> rc={rc}, output={start_out}")
            print("Waiting 8s for Redpanda broker initialization...")
            time.sleep(8.0)

            # Retry up to 3 API calls until broker finishes leader election after restart
            rec_body = {}
            rec_code = 0
            rec_lat = 0.0
            for attempt in range(1, 4):
                t0 = time.perf_counter()
                r = httpx.post(f"{BASE_URL}/predict", json=BASE_PREDICT_PAYLOAD, timeout=30.0)
                rec_lat = round((time.perf_counter() - t0) * 1000, 2)
                rec_code = r.status_code
                rec_body = r.json()
                print(
                    f"Recovery check #{attempt}: HTTP {rec_code} | kafka={rec_body.get('kafka')} | "
                    f"latency={rec_lat}ms"
                )
                if rec_body.get("kafka", {}).get("status") == "PUBLISHED":
                    break
                time.sleep(3.0)

            resilience = httpx.get(f"{BASE_URL}/resilience/status", timeout=5.0).json()
            print(f"GET /resilience/status kafka_producer -> {json.dumps(resilience['kafka_producer'])}")

            out["recovery_phase"] = {
                "passed": rec_code == 200 and rec_body.get("kafka", {}).get("status") == "PUBLISHED",
                "status_code": rec_code,
                "latency_ms": rec_lat,
                "response": rec_body,
                "kafka_producer_status": resilience["kafka_producer"],
            }
    finally:
        _run_cmd(["docker", "start", "mini_uber_kafka"])
        time.sleep(3.0)

    out["passed"] = all(
        v["passed"] for k, v in out.items() if k in ("failure_phase", "recovery_phase")
    )
    print(f"RESULT: {'PASS' if out['passed'] else 'FAIL'}")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Run P9 fault-tolerance experiments.")
    parser.add_argument(
        "--experiment",
        default="all",
        help="Experiment selector: 1..9, 2a, 2b, 8a, 8b, 9a, 9b, or all",
    )
    parser.add_argument(
        "--output-json",
        default=str(RESULTS_PATH),
        help="Path to write measured experiment telemetry JSON",
    )
    args = parser.parse_args()

    selector = args.experiment.lower().strip()
    handlers = {
        "1": experiment_1_normal_operation,
        "2": lambda: experiment_2_retry_mechanism("both"),
        "2a": lambda: experiment_2_retry_mechanism("success"),
        "2b": lambda: experiment_2_retry_mechanism("exhaustion"),
        "3": experiment_3_timeout_handling,
        "4": experiment_4_cb_closed,
        "5": experiment_5_cb_open,
        "6": experiment_6_cb_half_open,
        "7": experiment_7_cb_recovery,
        "8": lambda: experiment_8_redis_failure_and_recovery("both"),
        "8a": lambda: experiment_8_redis_failure_and_recovery("failure"),
        "8b": lambda: experiment_8_redis_failure_and_recovery("recovery"),
        "9": lambda: experiment_9_kafka_failure_and_recovery("both"),
        "9a": lambda: experiment_9_kafka_failure_and_recovery("failure"),
        "9b": lambda: experiment_9_kafka_failure_and_recovery("recovery"),
    }

    if selector == "all":
        _wait_for_http_health(30)
        results = [handlers[str(i)]() for i in range(1, 10)]
        summary = {
            "executed_at": datetime.now(timezone.utc).isoformat(),
            "base_url": BASE_URL,
            "all_passed": all(r["passed"] for r in results),
            "experiments": results,
        }
        out_file = Path(args.output_json)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"\nSaved complete experiment telemetry to {out_file}")
        return 0 if summary["all_passed"] else 1

    if selector not in handlers:
        print(f"Unknown experiment selector: {selector}")
        return 2

    res = handlers[selector]()
    return 0 if res.get("passed") else 1


if __name__ == "__main__":
    raise SystemExit(main())

