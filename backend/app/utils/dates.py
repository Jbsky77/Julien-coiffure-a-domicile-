"""Date helpers with Europe/Paris business-day boundaries."""
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

PARIS_TZ = ZoneInfo("Europe/Paris")


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except Exception:
        return None


def month_range(yyyymm: str):
    year, month = (int(part) for part in yyyymm.split("-"))
    local_start = datetime(year, month, 1, tzinfo=PARIS_TZ)
    local_end = datetime(year + 1, 1, 1, tzinfo=PARIS_TZ) if month == 12 else datetime(year, month + 1, 1, tzinfo=PARIS_TZ)
    return local_start.astimezone(timezone.utc), local_end.astimezone(timezone.utc)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def yyyymm_now() -> str:
    current = datetime.now(PARIS_TZ)
    return f"{current.year:04d}-{current.month:02d}"


def paris_day_range(value: str | date) -> tuple[datetime, datetime]:
    selected = date.fromisoformat(value) if isinstance(value, str) else value
    local_start = datetime.combine(selected, time.min, tzinfo=PARIS_TZ)
    local_end = local_start + timedelta(days=1)
    return local_start.astimezone(timezone.utc), local_end.astimezone(timezone.utc)
