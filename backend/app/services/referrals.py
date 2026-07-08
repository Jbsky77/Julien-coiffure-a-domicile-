"""Referral (parrainage) computation: godchildren are derived from `referred_by`."""
from app.db import db
from app.services.settings import get_settings


async def compute_referral_info(client_id: str) -> dict:
    settings = await get_settings()
    threshold = max(1, int(getattr(settings, "referral_threshold", 4) or 4))
    client = await db.clients.find_one({"id": client_id}, {"_id": 0}) or {}
    kids = await db.clients.find(
        {"referred_by": client_id},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "created_at": 1},
    ).to_list(1000)
    kids.sort(key=lambda k: k.get("created_at") or "")
    used = client.get("referral_rewards_used") or []
    count = len(kids)
    earned = count // threshold
    available = max(0, earned - len(used))
    remaining = threshold - (count % threshold)
    referred_by = client.get("referred_by") or None
    referred_by_name = None
    if referred_by:
        p = await db.clients.find_one({"id": referred_by}, {"_id": 0, "first_name": 1, "last_name": 1})
        if p:
            referred_by_name = f"{p.get('first_name','') or ''} {p.get('last_name','') or ''}".strip()
    return {
        "referred_by": referred_by,
        "referred_by_name": referred_by_name,
        "godchildren": [
            {"id": k["id"], "name": f"{k.get('first_name','') or ''} {k.get('last_name','') or ''}".strip()}
            for k in kids
        ],
        "godchildren_count": count,
        "threshold": threshold,
        "rewards_earned": earned,
        "rewards_used": len(used),
        "rewards_available": available,
        "remaining_to_next": remaining,
        "rewards_used_history": used,
    }
