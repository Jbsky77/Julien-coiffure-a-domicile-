"""Geographical / travel calculations."""
import math
from typing import Optional


def haversine(lat1: Optional[float], lng1: Optional[float], lat2: Optional[float], lng2: Optional[float]) -> Optional[float]:
    """Distance in km between two coordinates with a 1.3x road factor.

    Returns None when any coordinate is missing.
    """
    if None in (lat1, lng1, lat2, lng2):
        return None
    R = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)) * 1.3, 2)


def km_to_minutes(km: Optional[float], avg_speed_kmh: float) -> Optional[int]:
    if km is None or avg_speed_kmh <= 0:
        return None
    return round((km / avg_speed_kmh) * 60)
