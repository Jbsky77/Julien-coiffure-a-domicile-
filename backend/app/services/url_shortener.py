"""URL shortening service.

Uses da.gd as the primary shortener because its redirects are clean (302 → target,
no tracker, no ad interstitial). Falls back to TinyURL if da.gd is unreachable.
Never raises — returns None so callers can fall back to the original URL.
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


async def _try_dagd(url: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            r = await client.get("https://da.gd/s", params={"url": url})
        if r.status_code == 200:
            short = r.text.strip()
            if short.startswith(("http://da.gd/", "https://da.gd/")):
                return short
    except Exception as exc:
        logger.warning("da.gd error: %s", exc)
    return None


async def _try_tinyurl(url: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            r = await client.get("https://tinyurl.com/api-create.php", params={"url": url})
        if r.status_code == 200:
            short = r.text.strip()
            if short.startswith(("http://tinyurl.com", "https://tinyurl.com")):
                return short
    except Exception as exc:
        logger.warning("tinyurl error: %s", exc)
    return None


async def shorten(url: str) -> Optional[str]:
    if not url:
        return None
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        return None
    if len(url) <= 30:
        return url
    return await _try_dagd(url) or await _try_tinyurl(url)
