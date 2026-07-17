"""Analytics aggregation: top services / clients / seasonal / weekdays / gender / durations."""
import math
from datetime import datetime, timezone
from typing import Optional

from app.db import db
from app.services.settings import get_settings
from app.utils.dates import parse_iso

MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"]
WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]


def _compute_age(bd: str):
    try:
        d = datetime.fromisoformat(bd)
        today = datetime.now(timezone.utc)
        age = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
        return age if d <= today and 0 <= age <= 120 else None
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
    return ([{"range": k, "count": v} for k, v in buckets.items()], average_age, len(ages), buckets["N/A"])


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


async def compute_period(start_iso: str, end_iso: str) -> dict:
    """Compute financial+business KPIs for a period [start, end) (ISO date strings)."""
    settings = await get_settings()
    start = parse_iso(start_iso)
    end = parse_iso(end_iso)
    if not start or not end:
        return {"error": "invalid_dates"}
    rdvs_all = await db.appointments.find({"status": "done"}, {"_id": 0}).to_list(20000)
    period = []
    for r in rdvs_all:
        dt = parse_iso(r.get("finished_at") or r.get("date"))
        if dt and start <= dt < end:
            period.append(r)
    n_rdv = len(period)
    ca_total = sum(r.get("price_final", 0) for r in period)
    unique_clients = len({r["client_id"] for r in period})
    avg_basket = round(ca_total / n_rdv, 2) if n_rdv else 0.0
    billed_supp = sum(float(r.get("fuel_supplement", 0) or 0) for r in period)
    theoretical_supp = sum(
        float(r.get("theoretical_fuel_supplement") if r.get("theoretical_fuel_supplement") is not None else r.get("fuel_supplement", 0) or 0)
        for r in period
    )
    neighbor_discounts = sum(float(r.get("neighbor_discount", 0) or 0) for r in period)
    neighbor_count = sum(1 for r in period if r.get("is_neighbor"))
    real_km = 0.0
    for r in period:
        d = r.get("distance_km_from_business")
        real_km += (2 * float(d)) if d is not None else float(r.get("kilometrage") or 0)
    fuel_brut = real_km / 100.0 * settings.consumption_l_per_100km * settings.fuel_price_per_liter
    fuel_cost = math.ceil(fuel_brut) if real_km > 0 else 0
    consumables = n_rdv * settings.consumables_per_client
    urssaf = math.ceil(ca_total * settings.urssaf_rate)
    cb_amount = sum(float(r.get("price_final") or 0) for r in period if (r.get("payment_mode") or "").upper() == "CB")
    cb_fees = round(cb_amount * settings.cb_fee_rate, 2)
    marge_before_fixed = ca_total - urssaf - consumables - cb_fees - fuel_cost
    marge = marge_before_fixed - settings.fixed_costs_monthly
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "ca_total": round(ca_total, 2),
        "n_rdv": n_rdv,
        "unique_clients": unique_clients,
        "avg_basket": avg_basket,
        "theoretical_supplements": round(theoretical_supp, 2),
        "billed_supplements": round(billed_supp, 2),
        "neighbor_discounts": round(neighbor_discounts, 2),
        "neighbor_count": neighbor_count,
        "real_km": round(real_km, 2),
        "fuel_cost": fuel_cost,
        "cb_fees": cb_fees,
        "marge_before_fixed_costs": round(marge_before_fixed, 2),
        "marge": round(marge, 2),
    }


def _delta(a: float, b: float) -> dict:
    """Delta from b to a (period_a compared against period_b as baseline)."""
    diff = round(a - b, 2)
    pct = round(diff / b * 100, 1) if b else None
    return {"abs": diff, "pct": pct}


async def compare_periods(a_start: str, a_end: str, b_start: str, b_end: str) -> dict:
    a = await compute_period(a_start, a_end)
    b = await compute_period(b_start, b_end)
    metrics = [
        "ca_total", "n_rdv", "unique_clients", "avg_basket",
        "theoretical_supplements", "billed_supplements",
        "neighbor_discounts", "neighbor_count", "real_km",
        "fuel_cost", "marge",
    ]
    deltas = {m: _delta(a.get(m, 0), b.get(m, 0)) for m in metrics}
    return {"a": a, "b": b, "deltas": deltas}


async def compute_analytics(month: Optional[str] = None) -> dict:
    all_rdvs = await db.appointments.find({"status": "done"}, {"_id": 0}).to_list(20000)
    all_clients = await db.clients.find({}, {"_id": 0}).to_list(5000)
    rdvs = all_rdvs
    clients = all_clients
    period_label = "Toutes les données"

    if month:
        try:
            year, month_number = (int(part) for part in month.split("-", 1))
            start = datetime(year, month_number, 1, tzinfo=timezone.utc)
            end = datetime(year + (month_number // 12), (month_number % 12) + 1, 1, tzinfo=timezone.utc)
        except (TypeError, ValueError):
            return {"error": "invalid_month"}
        rdvs = []
        for appointment in all_rdvs:
            date = parse_iso(appointment.get("finished_at") or appointment.get("date"))
            if date and start <= date < end:
                rdvs.append(appointment)
        active_client_ids = {appointment.get("client_id") for appointment in rdvs}
        clients = [client for client in all_clients if client.get("id") in active_client_ids]
        period_label = start.strftime("%m/%Y")

    age_stats, average_age, age_included, age_excluded = _age_stats(clients)
    durations = [r.get("duration_minutes") for r in rdvs if r.get("duration_minutes")]

    return {
        "month": month,
        "period_label": period_label,
        "top_services": _top_services(rdvs),
        "top_clients": _top_clients(rdvs),
        "seasonal": _seasonal(all_rdvs),
        "weekdays": _weekdays(rdvs),
        "total_ca": round(sum(r["price_final"] for r in rdvs), 2),
        "total_rdv": len(rdvs),
        "total_clients": len(clients),
        "gender_stats": _gender_stats(clients, rdvs),
        "age_stats": age_stats,
        "average_age": average_age,
        "age_included_count": age_included,
        "age_excluded_count": age_excluded,
        "average_duration_minutes": round(sum(durations) / len(durations), 1) if durations else None,
        "total_duration_minutes": sum(durations) if durations else 0,
        "service_time_stats": await _service_time_stats(rdvs),
    }
