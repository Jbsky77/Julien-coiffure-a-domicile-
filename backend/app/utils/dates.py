"""Date helpers."""
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

PARIS_TZ = ZoneInfo(\"Europe/Paris\")


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO datetime string, returning timezone-aware UTC datetime or None."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def month_range(yyyymm: str):
    y, m = yyyymm.split("-")
    start = datetime(int(y), int(m), 1, tzinfo=timezone.utc)
    if int(m) == 12:
        end = datetime(int(y) + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(int(y), int(m) + 1, 1, tzinfo=timezone.utc)
    return start, end


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def yyyymm_now() -> str:
    n = now_utc()
    return f"{n.year:04d}-{n.month:02d}"
