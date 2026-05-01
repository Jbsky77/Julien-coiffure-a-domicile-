"""Settings service: load / persist app-wide configuration singleton."""
from app.db import db
from app.models.settings import Settings


async def get_settings() -> Settings:
    doc = await db.settings.find_one({"_id": "singleton"}, {"_id": 0})
    if not doc:
        s = Settings().model_dump()
        await db.settings.insert_one({"_id": "singleton", **s})
        return Settings(**s)
    return Settings(**doc)


async def update_settings(payload: dict) -> Settings:
    await db.settings.update_one({"_id": "singleton"}, {"$set": payload}, upsert=True)
    return await get_settings()
