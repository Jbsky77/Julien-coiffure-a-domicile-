"""Analytics aggregation: top services / clients / seasonal / weekdays / gender."""
from datetime import datetime, timezone

from app.db import db
from app.utils.dates import parse_iso


def _compute_age(bd: str):
    try:
        d = datetime.fromisoformat(bd)
        today = datetime.now(timezone.utc)
        return today.year - d.year - ((today.month, today.day) < (d.month, d.day))
    except Exception:
        return None


async def compute_analytics() -> dict:
    rdvs = await db.appointments.find({"status": "done"}, {"_id": 0}).to_list(20000)
    clients = await db.clients.find({}, {"_id": 0}).to_list(5000)

    svc_stats: dict = {}
    for r in rdvs:
        for s in r["services"]:
            k = s["service_id"]
            e = svc_stats.setdefault(k, {"service_id": k, "name": s["name"], "count": 0, "revenue": 0.0})
            e["count"] += 1
            if not s.get("is_gift"):
                e["revenue"] += s["price"]
    top_services = sorted(svc_stats.values(), key=lambda x: x["revenue"], reverse=True)

    client_stats: dict = {}
    for r in rdvs:
        k = r["client_id"]
        e = client_stats.setdefault(k, {"client_id": k, "client_name": r.get("client_name", ""), "count": 0, "revenue": 0.0})
        e["count"] += 1
        e["revenue"] += r["price_final"]
    top_clients = sorted(client_stats.values(), key=lambda x: x["revenue"], reverse=True)

    now = datetime.now(timezone.utc)
    seasonal = [
        {"month": m, "label": ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"][m - 1], "ca": 0.0, "n": 0}
        for m in range(1, 13)
    ]
    for r in rdvs:
        dt = parse_iso(r.get("finished_at") or r["date"])
        if dt is None:
            continue
        if dt.year == now.year:
            seasonal[dt.month - 1]["ca"] += r["price_final"]
            seasonal[dt.month - 1]["n"] += 1

    weekdays = [{"day": i, "label": ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"][i], "ca": 0.0, "n": 0} for i in range(7)]
    for r in rdvs:
        dt = parse_iso(r.get("finished_at") or r["date"])
        if dt is None:
            continue
        idx = dt.weekday()
        weekdays[idx]["ca"] += r["price_final"]
        weekdays[idx]["n"] += 1

    total = sum(r["price_final"] for r in rdvs)

    gender_counts = {"H": 0, "F": 0, "N": 0}
    age_buckets = {"<18": 0, "18-29": 0, "30-44": 0, "45-59": 0, "60+": 0, "N/A": 0}
    gender_rev = {"H": 0.0, "F": 0.0, "N": 0.0}
    for c in clients:
        g = c.get("gender") or "N"
        gender_counts[g] = gender_counts.get(g, 0) + 1
        age = _compute_age(c.get("birthday")) if c.get("birthday") else None
        if age is None:
            age_buckets["N/A"] += 1
        elif age < 18:
            age_buckets["<18"] += 1
        elif age < 30:
            age_buckets["18-29"] += 1
        elif age < 45:
            age_buckets["30-44"] += 1
        elif age < 60:
            age_buckets["45-59"] += 1
        else:
            age_buckets["60+"] += 1
    client_gender = {c["id"]: (c.get("gender") or "N") for c in clients}
    for r in rdvs:
        g = client_gender.get(r["client_id"], "N")
        gender_rev[g] = gender_rev.get(g, 0.0) + r["price_final"]
    gender_stats = [
        {"gender": "H", "label": "Hommes", "count": gender_counts.get("H", 0), "revenue": round(gender_rev.get("H", 0), 2)},
        {"gender": "F", "label": "Femmes", "count": gender_counts.get("F", 0), "revenue": round(gender_rev.get("F", 0), 2)},
        {"gender": "N", "label": "Non précisé", "count": gender_counts.get("N", 0), "revenue": round(gender_rev.get("N", 0), 2)},
    ]
    age_stats = [{"range": k, "count": v} for k, v in age_buckets.items()]
    ages = [a for a in (_compute_age(c.get("birthday")) for c in clients if c.get("birthday")) if a is not None]
    average_age = round(sum(ages) / len(ages), 1) if ages else None
    durations = [r.get("duration_minutes") for r in rdvs if r.get("duration_minutes")]
    average_duration = round(sum(durations) / len(durations), 1) if durations else None
    total_duration = sum(durations) if durations else 0

    # Average time per service type (multi-service RDVs split proportionally
    # to theoretical durations)
    services_all = await db.services.find({}, {"_id": 0}).to_list(500)
    theo = {s["id"]: (s.get("duration_minutes") or 45) for s in services_all}
    time_acc: dict = {}
    for r in rdvs:
        dm = r.get("duration_minutes")
        svcs = r.get("services") or []
        if not dm or not svcs:
            continue
        weights = [(s, theo.get(s["service_id"], 45)) for s in svcs]
        wsum = sum(w for _, w in weights) or 1
        for s, w in weights:
            e = time_acc.setdefault(s["service_id"], {"service_id": s["service_id"], "name": s["name"], "minutes": 0.0, "count": 0})
            e["minutes"] += dm * w / wsum
            e["count"] += 1
    service_time_stats = sorted(
        (
            {"service_id": e["service_id"], "name": e["name"], "avg_minutes": round(e["minutes"] / e["count"]), "count": e["count"]}
            for e in time_acc.values()
        ),
        key=lambda x: -x["count"],
    )

    return {
        "top_services": top_services,
        "top_clients": top_clients,
        "seasonal": seasonal,
        "weekdays": weekdays,
        "total_ca": round(total, 2),
        "total_rdv": len(rdvs),
        "total_clients": len(clients),
        "gender_stats": gender_stats,
        "age_stats": age_stats,
        "average_age": average_age,
        "average_duration_minutes": average_duration,
        "total_duration_minutes": total_duration,
        "service_time_stats": service_time_stats,
    }
