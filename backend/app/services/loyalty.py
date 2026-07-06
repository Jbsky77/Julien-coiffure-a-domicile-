"""Loyalty card computation for a single client (5 paid → 1 gift per service)."""
from app.db import db


LOYALTY_TARGET = 5  # 5 paid → 1 free


async def compute_loyalty_card(client_id: str) -> dict:
    services = await db.services.find({}, {"_id": 0}).to_list(500)
    client = await db.clients.find_one({"id": client_id}, {"_id": 0}) or {}
    counters = client.get("loyalty_counters") or {}
    rows = []
    total_paid = 0
    total_rewards_pending = 0
    for s in services:
        count = int(counters.get(s["id"], 0) or 0)
        cycles = count // LOYALTY_TARGET
        current = count % LOYALTY_TARGET
        remaining = LOYALTY_TARGET - current if current < LOYALTY_TARGET else 0
        rows.append({
            "service_id": s["id"],
            "name": s["name"],
            "category": s["category"],
            "price": s["price"],
            "count": count,
            "current": current,
            "remaining": remaining,
            "cycles": cycles,  # nb of free rewards earned so far
        })
        total_paid += count
        total_rewards_pending += cycles
    # Sort by highest engagement first
    rows.sort(key=lambda r: -r["count"])
    return {
        "client_id": client_id,
        "target_per_reward": LOYALTY_TARGET,
        "total_visits": total_paid,
        "total_rewards": total_rewards_pending,
        "rows": rows,
    }
