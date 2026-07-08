"""Simple in-DB notification store.

Two audiences:
- admin: notifications visible only to Julien (badge in nav, dashboard widget)
- client: notifications visible in the client's public space (identified by client_id)
"""
import secrets
from datetime import datetime, timezone
from typing import Optional

from app.db import db


def _gen_id() -> str:
    return f"notif_{secrets.token_hex(6)}"


async def push(audience: str, message: str, *, client_id: Optional[str] = None, meta: Optional[dict] = None):
    doc = {
        "id": _gen_id(),
        "audience": audience,
        "client_id": client_id,
        "message": message,
        "meta": meta or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False,
    }
    await db.notifications.insert_one(doc)
    return doc


async def list_admin(unread_only: bool = False, limit: int = 50):
    q = {"audience": "admin", "dismissed": {"$ne": True}}
    if unread_only:
        q["read"] = False
    return await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)


async def list_for_client(client_id: str, limit: int = 30):
    return await db.notifications.find(
        {"audience": "client", "client_id": client_id, "dismissed": {"$ne": True}, "read": {"$ne": True}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(limit)


async def count_admin_unread() -> int:
    return await db.notifications.count_documents({"audience": "admin", "read": False, "dismissed": {"$ne": True}})


async def mark_admin_all_read():
    await db.notifications.update_many({"audience": "admin", "read": False}, {"$set": {"read": True}})


async def mark_client_all_read(client_id: str):
    await db.notifications.update_many(
        {"audience": "client", "client_id": client_id, "read": False},
        {"$set": {"read": True}},
    )


async def dismiss_client_all(client_id: str):
    await db.notifications.update_many(
        {"audience": "client", "client_id": client_id},
        {"$set": {"dismissed": True}},
    )


async def dismiss_admin(notif_id: str):
    await db.notifications.update_one(
        {"id": notif_id, "audience": "admin"},
        {"$set": {"dismissed": True, "read": True}},
    )


async def push_admin_debounced(
    message: str,
    *,
    dedupe_key: str,
    within_seconds: int = 3600,
    meta: Optional[dict] = None,
):
    """Insert an admin notification unless an identical one (same dedupe_key)
    was created within `within_seconds`. Returns the doc, or None if skipped.
    """
    from datetime import timedelta

    since = (datetime.now(timezone.utc) - timedelta(seconds=within_seconds)).isoformat()
    existing = await db.notifications.find_one(
        {
            "audience": "admin",
            "meta.dedupe_key": dedupe_key,
            "created_at": {"$gte": since},
        },
        {"_id": 0, "id": 1},
    )
    if existing:
        return None
    full_meta = dict(meta or {})
    full_meta["dedupe_key"] = dedupe_key
    return await push("admin", message, meta=full_meta)
