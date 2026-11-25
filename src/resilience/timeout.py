"""Timeout configuration and execution helpers for external service calls."""

from __future__ import annotations

import asyncio
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from src.resilience.logging_config import get_logger

logger = get_logger("resilience.timeout")


class OperationTimeoutError(TimeoutError):
    """Raised when a bounded operation exceeds its configured timeout."""

    def __init__(
        self,
        operation_name: str,
        timeout_seconds: float,
        elapsed_seconds: float,
    ) -> None:
        self.operation_name = operation_name
        self.timeout_seconds = timeout_seconds
        self.elapsed_seconds = elapsed_seconds
        super().__init__(
            f"Operation '{operation_name}' timed out after {elapsed_seconds:.3f}s "
            f"(limit={timeout_seconds:.3f}s)"
        )


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


@dataclass
class TimeoutConfig:
    """Centralized timeout settings loaded from environment variables."""

    redis_connect_timeout: float = 1.0
    redis_socket_timeout: float = 1.0
    kafka_delivery_timeout_ms: int = 5000
    kafka_flush_timeout: float = 5.0
    http_client_timeout: float = 8.0
    operation_default_timeout: float = 2.0

    @classmethod
    def from_env(cls) -> "TimeoutConfig":
        return cls(
            redis_connect_timeout=_env_float("REDIS_CONNECT_TIMEOUT", 1.0),
            redis_socket_timeout=_env_float("REDIS_SOCKET_TIMEOUT", 1.0),
            kafka_delivery_timeout_ms=_env_int("KAFKA_MESSAGE_TIMEOUT_MS", 5000),
            kafka_flush_timeout=_env_float("KAFKA_FLUSH_TIMEOUT", 5.0),
            http_client_timeout=_env_float("HTTP_CLIENT_TIMEOUT", 8.0),
            operation_default_timeout=_env_float("OPERATION_TIMEOUT", 2.0),
        )


def run_with_timeout(
    func: Callable[..., Any],
    timeout_seconds: float,
    *args: Any,
    operation_name: Optional[str] = None,
    fallback: Optional[Callable[[OperationTimeoutError], Any]] = None,
    **kwargs: Any,
) -> Any:
    """Execute a synchronous callable with a hard wall-clock timeout and optional fallback."""
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be > 0")

    op_name = operation_name or getattr(func, "__name__", "operation")
    start = time.perf_counter()
    # Shut down without waiting so hung worker threads never block the caller.
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(func, *args, **kwargs)
    try:
        return future.result(timeout=timeout_seconds)
    except FuturesTimeoutError as exc:
        elapsed = time.perf_counter() - start
        future.cancel()
        timeout_err = OperationTimeoutError(
            operation_name=op_name,
            timeout_seconds=timeout_seconds,
            elapsed_seconds=elapsed,
        )
        logger.error(
            "Timeout in '%s': exceeded %.3fs limit (elapsed=%.3fs)",
            op_name,
            timeout_seconds,
            elapsed,
        )
        if fallback is not None:
            logger.warning("Executing fallback for timed-out operation '%s'", op_name)
            return fallback(timeout_err)
        raise timeout_err from exc
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


async def run_async_with_timeout(
    coro: Awaitable[Any],
    timeout_seconds: float,
    operation_name: str = "async_operation",
    fallback: Optional[Callable[[OperationTimeoutError], Any]] = None,
) -> Any:
    """Await a coroutine with a hard timeout and optional fallback handler."""
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be > 0")

    start = time.perf_counter()
    try:
        return await asyncio.wait_for(coro, timeout=timeout_seconds)
    except asyncio.TimeoutError as exc:
        elapsed = time.perf_counter() - start
        timeout_err = OperationTimeoutError(
            operation_name=operation_name,
            timeout_seconds=timeout_seconds,
            elapsed_seconds=elapsed,
        )
        logger.error(
            "Async timeout in '%s': exceeded %.3fs limit (elapsed=%.3fs)",
            operation_name,
            timeout_seconds,
            elapsed,
        )
        if fallback is not None:
            logger.warning("Executing fallback for timed-out async operation '%s'", operation_name)
            return fallback(timeout_err)
        raise timeout_err from exc

