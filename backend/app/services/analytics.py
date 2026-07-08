"""Analytics aggregation: top services / clients / seasonal / weekdays / gender / durations."""
from datetime import datetime, timezone

from app.db import db
from app.utils.dates import parse_iso

MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"]
WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]


def _compute_age(bd: str):
    try:
        d = datetime.fromisoformat(bd)
        today = datetime.now(timezone.utc)
        return today.year - d.year - ((today.month, today.day) < (d.month, d.day))
    except Exception:
        return None


def _top_services(rdvs: list) -> list:
    stats: dict = {}
    for r in rdvs:
        for s in r["services"]:
            e = stats.setdefault(s["service_id"], {"service_id": s["service_id"], "name": s["name"], "count": 0, "revenue": 0.0})
            e["count"] += 1
            if not s.get("is_gift"):
                e["revenue"] += s["price"]
    return sorted(stats.values(), key=lambda x: x["revenue"], reverse=True)


def _top_clients(rdvs: list) -> list:
    stats: dict = {}
    for r in rdvs:
        e = stats.setdefault(r["client_id"], {"client_id": r["client_id"], "client_name": r.get("client_name", ""), "count": 0, "revenue": 0.0})
        e["count"] += 1
        e["revenue"] += r["price_final"]
    return sorted(stats.values(), key=lambda x: x["revenue"], reverse=True)


def _seasonal(rdvs: list) -> list:
    now = datetime.now(timezone.utc)
    rows = [{"month": m, "label": MONTH_LABELS[m - 1], "ca": 0.0, "n": 0} for m in range(1, 13)]
    for r in rdvs:
        dt = parse_iso(r.get("finished_at") or r["date"])
        if dt and dt.year == now.year:
            rows[dt.month - 1]["ca"] += r["price_final"]
            rows[dt.month - 1]["n"] += 1
    return rows


def _weekdays(rdvs: list) -> list:
    rows = [{"day": i, "label": WEEKDAY_LABELS[i], "ca": 0.0, "n": 0} for i in range(7)]
    for r in rdvs:
        dt = parse_iso(r.get("finished_at") or r["date"])
        if dt:
            rows[dt.weekday()]["ca"] += r["price_final"]
            rows[dt.weekday()]["n"] += 1
    return rows


def _gender_stats(clients: list, rdvs: list) -> list:
    counts = {"H": 0, "F": 0, "N": 0}
    revenue = {"H": 0.0, "F": 0.0, "N": 0.0}
    for c in clients:
        g = c.get("gender") or "N"
        counts[g] = counts.get(g, 0) + 1
    client_gender = {c["id"]: (c.get("gender") or "N") for c in clients}
    for r in rdvs:
        g = client_gender.get(r["client_id"], "N")
        revenue[g] = revenue.get(g, 0.0) + r["price_final"]
    return [
        {"gender": g, "label": label, "count": counts.get(g, 0), "revenue": round(revenue.get(g, 0), 2)}
        for g, label in (("H", "Hommes"), ("F", "Femmes"), ("N", "Non précisé"))
    ]


def _age_stats(clients: list) -> tuple:
    buckets = {"<18": 0, "18-29": 0, "30-44": 0, "45-59": 0, "60+": 0, "N/A": 0}
    ages = []
    for c in clients:
        age = _compute_age(c.get("birthday")) if c.get("birthday") else None
        if age is None:
            buckets["N/A"] += 1
            continue
        ages.append(age)
        if age < 18:
            buckets["<18"] += 1
        elif age < 30:
            buckets["18-29"] += 1
        elif age < 45:
            buckets["30-44"] += 1
        elif age < 60:
            buckets["45-59"] += 1
        else:
            buckets["60+"] += 1
    average_age = round(sum(ages) / len(ages), 1) if ages else None
    return [{"range": k, "count": v} for k, v in buckets.items()], average_age


async def _service_time_stats(rdvs: list) -> list:
    """Average real time per service type; multi-service RDVs are split
    proportionally to theoretical durations."""
    services_all = await db.services.find({}, {"_id": 0}).to_list(500)
    theo = {s["id"]: (s.get("duration_minutes") or 45) for s in services_all}
    acc: dict = {}
    for r in rdvs:
        dm = r.get("duration_minutes")
        svcs = r.get("services") or []
        if not dm or not svcs:
            continue
        weights = [(s, theo.get(s["service_id"], 45)) for s in svcs]
        wsum = sum(w for _, w in weights) or 1
        for s, w in weights:
            e = acc.setdefault(s["service_id"], {"service_id": s["service_id"], "name": s["name"], "minutes": 0.0, "count": 0})
            e["minutes"] += dm * w / wsum
            e["count"] += 1
    return sorted(
        (
            {"service_id": e["service_id"], "name": e["name"], "avg_minutes": round(e["minutes"] / e["count"]), "count": e["count"]}
            for e in acc.values()
        ),
        key=lambda x: -x["count"],
    )


async def compute_analytics() -> dict:
    rdvs = await db.appointments.find({"status": "done"}, {"_id": 0}).to_list(20000)
    clients = await db.clients.find({}, {"_id": 0}).to_list(5000)

    age_stats, average_age = _age_stats(clients)
    durations = [r.get("duration_minutes") for r in rdvs if r.get("duration_minutes")]

    return {
        "top_services": _top_services(rdvs),
        "top_clients": _top_clients(rdvs),
        "seasonal": _seasonal(rdvs),
        "weekdays": _weekdays(rdvs),
        "total_ca": round(sum(r["price_final"] for r in rdvs), 2),
        "total_rdv": len(rdvs),
        "total_clients": len(clients),
        "gender_stats": _gender_stats(clients, rdvs),
        "age_stats": age_stats,
        "average_age": average_age,
        "average_duration_minutes": round(sum(durations) / len(durations), 1) if durations else None,
        "total_duration_minutes": sum(durations) if durations else 0,
        "service_time_stats": await _service_time_stats(rdvs),
    }
