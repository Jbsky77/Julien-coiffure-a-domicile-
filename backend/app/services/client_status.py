"""Compute CRM client status: actif, à relancer, en retard, presque perdu, perdu."""
from app.db import db
from app.utils.dates import now_utc, parse_iso


async def compute_client_statuses() -> list:
    clients = await db.clients.find({}, {"_id": 0}).to_list(5000)
    rdvs = await db.appointments.find({"status": "done"}, {"_id": 0}).to_list(20000)
    now = now_utc()

    by_client = {}
    for r in rdvs:
        cid = r["client_id"]
        dt = parse_iso(r.get("finished_at") or r["date"])
        if dt is None:
            continue
        by_client.setdefault(cid, []).append(dt)

    out = []
    for c in clients:
        history = sorted(by_client.get(c["id"], []), reverse=True)
        if not history:
            continue
        last = history[0]
        days_since = (now - last).days
        if len(history) >= 2:
            gaps = [(history[i] - history[i + 1]).days for i in range(len(history) - 1)]
            avg_freq = max(7, sum(gaps) / len(gaps))
        else:
            avg_freq = 30
        ratio = days_since / avg_freq
        if ratio < 1.0:
            status = "actif"
        elif ratio < 1.5:
            status = "a_relancer"
        elif ratio < 2.0:
            status = "en_retard"
        elif ratio < 3.5:
            status = "presque_perdu"
        else:
            status = "perdu"
        prices = [r["price_final"] for r in rdvs if r["client_id"] == c["id"]]
        avg_basket = round(sum(prices) / len(prices), 2) if prices else 0
        out.append({
            "id": c["id"],
            "first_name": c.get("first_name", ""),
            "last_name": c.get("last_name", ""),
            "gender": c.get("gender"),
            "phone": c.get("phone", ""),
            "last_visit": last.isoformat(),
            "days_since": days_since,
            "avg_frequency_days": round(avg_freq, 1),
            "ratio": round(ratio, 2),
            "status": status,
            "n_rdv": len(history),
            "avg_basket": avg_basket,
        })
    out.sort(key=lambda x: -x["ratio"])
    return out
