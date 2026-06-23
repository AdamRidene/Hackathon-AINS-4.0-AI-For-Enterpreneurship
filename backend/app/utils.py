"""Shared utilities for Firasa backend."""
from __future__ import annotations

import logging
import re

_EMAIL_RE = re.compile(r"[\w.+\-]+@[\w.\-]+\.\w{2,}", re.IGNORECASE)
_PHONE_RE = re.compile(
    r"(?<!\d)"
    r"(?:\+?216[\s.\-]?)?[2-9]\d{7}"          # Tunisian mobile/landline
    r"|(?:\+\d{1,3}[\s.\-]?)?\(?\d{2,4}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{3,4}"  # international
    r"(?!\d)"
)
_CIN_RE = re.compile(r"(?<!\d)\d{8}(?!\d)")   # Tunisia CIN: exactly 8 digits


def mask_pii(text: str) -> str:
    """Redact emails, phone numbers, and national ID numbers from free text."""
    if not text:
        return text
    text = _EMAIL_RE.sub("[EMAIL]", text)
    text = _PHONE_RE.sub("[PHONE]", text)
    text = _CIN_RE.sub("[ID]", text)
    return text


class _PiiLogFilter(logging.Filter):
    """Strip PII patterns from log record messages before emission."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            # Format with args first, then mask the result
            formatted = record.getMessage()
            record.msg = mask_pii(formatted)
            record.args = None  # already merged above
        except Exception:
            pass
        return True


def install_pii_log_filter(logger_name: str = "") -> None:
    """Attach PII redaction filter to the named logger (empty = root)."""
    logging.getLogger(logger_name).addFilter(_PiiLogFilter())
