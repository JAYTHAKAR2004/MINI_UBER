"""Structured logging configuration for Mini-Uber-ETA fault-tolerance events."""

from __future__ import annotations

import logging
import os
import sys
from typing import Optional

LOG_FORMAT = "%(asctime)s.%(msecs)03d | %(levelname)-8s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
_ROOT_NAMESPACE = "mini_uber"


def _resolve_log_level(level: Optional[str]) -> int:
    raw = (level or os.getenv("LOG_LEVEL", "INFO")).strip().upper()
    return getattr(logging, raw, logging.INFO)


def configure_logging(level: Optional[str] = None) -> logging.Logger:
    """Configure the shared 'mini_uber' logger with timestamped console output."""
    logger = logging.getLogger(_ROOT_NAMESPACE)
    resolved_level = _resolve_log_level(level)
    logger.setLevel(resolved_level)
    logger.propagate = False

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(resolved_level)
        handler.setFormatter(logging.Formatter(fmt=LOG_FORMAT, datefmt=DATE_FORMAT))
        logger.addHandler(handler)
    else:
        for handler in logger.handlers:
            handler.setLevel(resolved_level)

    return logger


def get_logger(name: str) -> logging.Logger:
    """Return a child logger under the configured 'mini_uber' namespace."""
    configure_logging()
    if name == _ROOT_NAMESPACE or name.startswith(f"{_ROOT_NAMESPACE}."):
        return logging.getLogger(name)
    return logging.getLogger(f"{_ROOT_NAMESPACE}.{name}")

