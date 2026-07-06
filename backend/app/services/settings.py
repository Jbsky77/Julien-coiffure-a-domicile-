"""Settings service: load / persist app-wide configuration singleton."""
from app.db import db
from app.models.settings import Settings
from app.services.url_shortener import shorten


async def get_settings() -> Settings:
    doc = await db.settings.find_one({"_id": "singleton"}, {"_id": 0})
    if not doc:
        s = Settings().model_dump()
        await db.settings.insert_one({"_id": "singleton", **s})
        return Settings(**s)
    return Settings(**doc)


async def update_settings(payload: dict) -> Settings:
    # If google_review_url is being changed, auto-shorten it via TinyURL.
    if "google_review_url" in payload:
        new_url = (payload.get("google_review_url") or "").strip()
        if not new_url:
            payload["google_review_url_short"] = ""
        else:
            current = await db.settings.find_one({"_id": "singleton"}, {"_id": 0}) or {}
            already_short = current.get("google_review_url_short") or ""
            if current.get("google_review_url") != new_url or not already_short:
                short = await shorten(new_url)
                payload["google_review_url_short"] = short or ""
    await db.settings.update_one({"_id": "singleton"}, {"$set": payload}, upsert=True)
    return await get_settings()
