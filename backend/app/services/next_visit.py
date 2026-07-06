"""Next recommended visit computation based on the client's average visit frequency."""
from datetime import timedelta
from typing import Optional

from app.db import db
from app.utils.dates import now_utc, parse_iso


async def compute_next_visit(client_id: str) -> Optional[dict]:
    rdvs = await db.appointments.find({"client_id": client_id, "status": "done"}, {"_id": 0}).to_list(2000)
    dates = sorted(
        [d for d in (parse_iso(r.get("finished_at") or r["date"]) for r in rdvs) if d],
        reverse=True,
    )
    if len(dates) < 2:
        return None

    gaps = [(dates[i] - dates[i + 1]).days for i in range(len(dates) - 1)]
    avg = max(7, round(sum(gaps) / len(gaps)))
    last = dates[0]
    next_date = last + timedelta(days=avg)
    days_until = (next_date - now_utc()).days

    counts: dict = {}
    names: dict = {}
    for r in rdvs:
        for s in r.get("services") or []:
            sid = s.get("service_id")
            if sid:
                counts[sid] = counts.get(sid, 0) + 1
                names[sid] = s.get("name", "")
    top = sorted(counts.items(), key=lambda x: -x[1])[:2]

    return {
        "avg_frequency_days": avg,
        "avg_frequency_weeks": round(avg / 7, 1),
        "last_visit": last.isoformat(),
        "next_recommended_date": next_date.isoformat(),
        "days_until": days_until,
        "usual_service_ids": [t[0] for t in top],
        "usual_service_names": [names[t[0]] for t in top],
        "n_visits": len(dates),
    }
