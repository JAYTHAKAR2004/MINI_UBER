"""Reusable retry mechanism with exponential backoff and permanent-error filtering."""

from __future__ import annotations

import functools
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional, Tuple, Type

from src.resilience.logging_config import get_logger

logger = get_logger("resilience.retry")


class TransientError(Exception):
    """Error representing a temporary failure that is safe to retry."""


class PermanentError(Exception):
    """Error representing a permanent failure that must not be retried."""


class RetryExhaustedError(Exception):
    """Raised when all configured retry attempts have failed."""

    def __init__(
        self,
        operation_name: str,
        attempts: int,
        delays: list[float],
        last_exception: BaseException,
    ) -> None:
        self.operation_name = operation_name
        self.attempts = attempts
        self.delays = list(delays)
        self.last_exception = last_exception
        super().__init__(
            f"Operation '{operation_name}' failed after {attempts} attempt(s) "
            f"(backoff delays={self.delays}): {last_exception}"
        )


@dataclass
class RetryConfig:
    """Configuration for bounded retries with exponential backoff."""

    max_attempts: int = 3
    initial_backoff_seconds: float = 1.0
    backoff_multiplier: float = 2.0
    max_backoff_seconds: float = 10.0
    retryable_exceptions: Tuple[Type[BaseException], ...] = (
        TransientError,
        TimeoutError,
        ConnectionError,
    )
    non_retryable_exceptions: Tuple[Type[BaseException], ...] = (
        PermanentError,
        ValueError,
        TypeError,
        KeyError,
    )

    def __post_init__(self) -> None:
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be >= 1")
        if self.initial_backoff_seconds < 0:
            raise ValueError("initial_backoff_seconds must be >= 0")
        if self.backoff_multiplier < 1:
            raise ValueError("backoff_multiplier must be >= 1")


def compute_backoff_delay(attempt: int, config: RetryConfig) -> float:
    """Compute exponential backoff delay in seconds for a 1-indexed failed attempt."""
    raw_delay = config.initial_backoff_seconds * (
        config.backoff_multiplier ** max(0, attempt - 1)
    )
    return min(raw_delay, config.max_backoff_seconds)


def _should_retry(
    exc: BaseException,
    config: RetryConfig,
    is_retryable: Optional[Callable[[BaseException], bool]],
) -> bool:
    if isinstance(exc, config.non_retryable_exceptions):
        return False
    if is_retryable is not None:
        return bool(is_retryable(exc))
    return isinstance(exc, config.retryable_exceptions)


def execute_with_retry(
    func: Callable[..., Any],
    *args: Any,
    config: Optional[RetryConfig] = None,
    operation_name: Optional[str] = None,
    is_retryable: Optional[Callable[[BaseException], bool]] = None,
    idempotency_key: Optional[str] = None,
    sleep_fn: Callable[[float], None] = time.sleep,
    on_retry: Optional[Callable[[int, BaseException, float], None]] = None,
    **kwargs: Any,
) -> Any:
    """Execute ``func`` with bounded exponential-backoff retries on transient errors."""
    cfg = config or RetryConfig()
    op_name = operation_name or getattr(func, "__name__", "operation")
    idem_tag = f" [idempotency_key={idempotency_key}]" if idempotency_key else ""
    delays: list[float] = []

    for attempt in range(1, cfg.max_attempts + 1):
        try:
            result = func(*args, **kwargs)
            if attempt > 1:
                logger.info(
                    "Operation '%s' recovered on attempt %d/%d%s",
                    op_name,
                    attempt,
                    cfg.max_attempts,
                    idem_tag,
                )
            return result
        except BaseException as exc:
            if not _should_retry(exc, cfg, is_retryable):
                logger.error(
                    "Permanent/non-retryable error in '%s' on attempt %d/%d%s: %s — skipping retries",
                    op_name,
                    attempt,
                    cfg.max_attempts,
                    idem_tag,
                    exc,
                )
                raise

            if attempt < cfg.max_attempts:
                delay = compute_backoff_delay(attempt, cfg)
                delays.append(delay)
                logger.warning(
                    "Attempt %d/%d failed for '%s'%s: %s — retrying in %.2fs",
                    attempt,
                    cfg.max_attempts,
                    op_name,
                    idem_tag,
                    exc,
                    delay,
                )
                if on_retry is not None:
                    on_retry(attempt, exc, delay)
                if delay > 0:
                    sleep_fn(delay)
            else:
                logger.error(
                    "Retry exhaustion for '%s' after %d attempts%s (delays=%s): %s",
                    op_name,
                    cfg.max_attempts,
                    idem_tag,
                    delays,
                    exc,
                )
                raise RetryExhaustedError(
                    operation_name=op_name,
                    attempts=cfg.max_attempts,
                    delays=delays,
                    last_exception=exc,
                ) from exc

    raise AssertionError("Unreachable retry loop termination")


def with_retry(
    config: Optional[RetryConfig] = None,
    operation_name: Optional[str] = None,
    is_retryable: Optional[Callable[[BaseException], bool]] = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator wrapping a callable with ``execute_with_retry``."""

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            return execute_with_retry(
                func,
                *args,
                config=config,
                operation_name=operation_name or func.__name__,
                is_retryable=is_retryable,
                **kwargs,
            )

        return wrapper

    return decorator

