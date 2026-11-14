"""Timestamp parsing, normalization, and date-range validation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def parse_to_utc(value: Any) -> datetime:
    """Parse common date/timestamp formats into a timezone-aware UTC datetime."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    text = str(value).strip()
    if not text:
        raise ValueError("Timestamp string cannot be empty.")

    # Handle trailing 'Z'
    if text.endswith("Z"):
        text_iso = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text_iso)
            return dt.astimezone(timezone.utc)
        except ValueError:
            pass

    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%Y%m%d",
        "%Y%m%d%H%M%S",
    ):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    try:
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError as exc:
        raise ValueError(f"Unrecognized timestamp format: {value!r}") from exc


def normalize_timestamp(value: Any) -> str:
    """Normalize any supported timestamp into UTC ISO-8601 (YYYY-MM-DDTHH:MM:SSZ)."""
    dt = parse_to_utc(value)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def validate_date_range(start_date: str, end_date: str) -> tuple[datetime, datetime]:
    """Validate start <= end and return UTC datetimes covering the full end day."""
    start_dt = parse_to_utc(start_date)
    end_dt = parse_to_utc(end_date)
    if start_dt > end_dt:
        raise ValueError(f"start_date ({start_date}) must not be after end_date ({end_date}).")
    return start_dt, end_dt


def to_power_date(date_value: str | datetime) -> str:
    """Format date as YYYYMMDD for NASA POWER API."""
    return parse_to_utc(date_value).strftime("%Y%m%d")


def to_cmr_temporal(start_date: str, end_date: str) -> str:
    """Format date range as CMR temporal filter string."""
    start_dt, end_dt = validate_date_range(start_date, end_date)
    return f"{start_dt.strftime('%Y-%m-%dT00:00:00Z')},{end_dt.strftime('%Y-%m-%dT23:59:59Z')}"

