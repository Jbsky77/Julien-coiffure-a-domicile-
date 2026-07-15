"""Idempotent migrations for existing DB entries."""
import secrets
from app.db import db


async def remove_legacy_referrals():
    """Drop the old manual `referrals` counter (replaced by `referred_by`)."""
    await db.clients.update_many({"referrals": {"$exists": True}}, {"$unset": {"referrals": ""}})


async def backfill_client_access_tokens():
    """Give every legacy client a unique access_token if it doesn't have one yet."""
    cursor = db.clients.find({"$or": [{"access_token": {"$exists": False}}, {"access_token": ""}]}, {"_id": 0, "id": 1})
    async for c in cursor:
        token = secrets.token_urlsafe(24)
        await db.clients.update_one(
            {"id": c["id"]},
            {"$set": {"access_token": token}},
        )
        await db.sync_public_client_token({"id": c["id"], "access_token": token})

    async for c in db.clients.find({"access_token": {"$exists": True}}, {"_id": 0, "id": 1, "access_token": 1}):
        await db.sync_public_client_token(c)
