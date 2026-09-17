"""Canonical keys for master-record names.

Uniqueness on master tables is enforced on these keys, not the display name,
so "Dr. Sharma", "Dr Sharma" and "sharma" collide instead of becoming three rows.
"""

import re
import unicodedata

_NON_ALNUM = re.compile(r"[^0-9a-z]+")
_DOCTOR_PREFIX = re.compile(r"^(dr|doctor)\s+")


def clean_display(value: str) -> str:
    """Trim and collapse internal whitespace for storage as the display name."""
    return " ".join(value.split())


def name_key(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return " ".join(_NON_ALNUM.sub(" ", text).split())


def doctor_key(value: str) -> str:
    key = name_key(value)
    # Strip honorific repeatedly ("Dr. Dr. Sharma" happens).
    while True:
        stripped = _DOCTOR_PREFIX.sub("", key)
        if stripped == key:
            return key
        key = stripped


def phone_key(value: str | None) -> str:
    if not value:
        return ""
    digits = re.sub(r"\D", "", value)
    # Compare on the last 10 digits so "+91 98xxx" and "098xxx" match.
    return digits[-10:]
