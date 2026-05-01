"""Accounting calculations: monthly aggregation, CB fees, multi-month reset."""
import math
from typing import Dict

from app.db import db
from app.services.settings import get_settings
from app.utils.dates import month_range, parse_iso


async def accounting_month_data(yyyymm: str) -> dict:
    settings = await get_settings()
    start, end = month_range(yyyymm)
    rdvs = await db.appointments.find({"status": "done"}, {"_id": 0}).to_list(10000)
    in_month = []
    for r in rdvs:
        dt = parse_iso(r.get("finished_at") or r.get("date"))
        if dt is None:
            continue
        if start <= dt < end:
            in_month.append(r)
    ca_brut = sum(r["price_final"] for r in in_month)
    n_rdv = len(in_month)
    pm_breakdown: Dict[str, dict] = {}
    for r in in_month:
        pm = r.get("payment_mode") or "INCONNU"
        pm_breakdown.setdefault(pm, {"count": 0, "amount": 0.0})
        pm_breakdown[pm]["count"] += 1
        pm_breakdown[pm]["amount"] += r["price_final"]
    total_km = sum(r.get("kilometrage", 0) for r in in_month)
    fuel_real_cost = (total_km / 100.0) * settings.consumption_l_per_100km * settings.fuel_price_per_liter
    fuel_charged = sum(r.get("fuel_supplement", 0) for r in in_month)
    fuel_balance = fuel_charged - fuel_real_cost
    consumables = n_rdv * settings.consumables_per_client
    urssaf_raw = ca_brut * settings.urssaf_rate
    urssaf_ceil = math.ceil(urssaf_raw)
    fixed = settings.fixed_costs_monthly
    cb_amount = pm_breakdown.get("CB", {}).get("amount", 0.0)
    cb_count = pm_breakdown.get("CB", {}).get("count", 0)
    cb_fees_total = round(cb_amount * settings.cb_fee_rate, 2)
    marge_nette = ca_brut - urssaf_ceil - consumables - fixed - fuel_real_cost + fuel_charged - cb_fees_total
    decl = await db.urssaf_status.find_one({"month": yyyymm}, {"_id": 0}) or {"month": yyyymm, "declared": False, "paid": False}
    n_gifts = 0
    value_gifts = 0.0
    for r in in_month:
        for s in r["services"]:
            if s.get("is_gift"):
                n_gifts += 1
                value_gifts += s.get("price", 0)
    return {
        "month": yyyymm,
        "ca_brut": round(ca_brut, 2),
        "n_rdv": n_rdv,
        "payment_breakdown": pm_breakdown,
        "total_km": total_km,
        "fuel_real_cost": round(fuel_real_cost, 2),
        "fuel_charged": round(fuel_charged, 2),
        "fuel_balance": round(fuel_balance, 2),
        "consumables": round(consumables, 2),
        "urssaf_raw": round(urssaf_raw, 2),
        "urssaf_ceil": urssaf_ceil,
        "fixed_costs": fixed,
        "marge_nette": round(marge_nette, 2),
        "cb_amount": round(cb_amount, 2),
        "cb_count": cb_count,
        "cb_fees_total": cb_fees_total,
        "cb_fee_rate": settings.cb_fee_rate,
        "n_gifts": n_gifts,
        "value_gifts": round(value_gifts, 2),
        "urssaf_status": decl,
    }


async def accounting_all_months_data() -> list:
    rdvs = await db.appointments.find({"status": "done"}, {"_id": 0}).to_list(20000)
    settings = await get_settings()
    by_month: Dict[str, Dict[str, float]] = {}
    for r in rdvs:
        dt = parse_iso(r.get("finished_at") or r.get("date"))
        if dt is None:
            continue
        key = f"{dt.year:04d}-{dt.month:02d}"
        by_month.setdefault(key, {"ca": 0.0, "n": 0})
        by_month[key]["ca"] += r["price_final"]
        by_month[key]["n"] += 1
    out = []
    for k, v in sorted(by_month.items()):
        urssaf = math.ceil(v["ca"] * settings.urssaf_rate)
        decl = await db.urssaf_status.find_one({"month": k}, {"_id": 0}) or {"declared": False, "paid": False}
        out.append({"month": k, "ca": round(v["ca"], 2), "n_rdv": int(v["n"]), "urssaf": urssaf, **decl})
    return out


async def cb_fees_data(period: str = "month") -> dict:
    settings = await get_settings()
    rate = settings.cb_fee_rate
    rdvs = await db.appointments.find({"status": "done", "payment_mode": "CB"}, {"_id": 0}).to_list(20000)
    buckets: Dict[str, dict] = {}
    for r in rdvs:
        dt = parse_iso(r.get("finished_at") or r.get("date"))
        if dt is None:
            continue
        if period == "day":
            key = dt.strftime("%Y-%m-%d")
        elif period == "year":
            key = dt.strftime("%Y")
        else:
            key = dt.strftime("%Y-%m")
        b = buckets.setdefault(key, {"key": key, "amount": 0.0, "count": 0, "fees": 0.0})
        b["amount"] += r["price_final"]
        b["count"] += 1
    for b in buckets.values():
        b["amount"] = round(b["amount"], 2)
        b["fees"] = round(b["amount"] * rate, 2)
    rows = sorted(buckets.values(), key=lambda x: x["key"], reverse=True)
    total_amount = round(sum(b["amount"] for b in rows), 2)
    total_fees = round(sum(b["fees"] for b in rows), 2)
    total_count = sum(b["count"] for b in rows)
    return {"period": period, "rate": rate, "rows": rows, "total_amount": total_amount, "total_fees": total_fees, "total_count": total_count}


async def reset_months(months: list) -> dict:
    total_deleted = 0
    for yyyymm in months:
        start, end = month_range(yyyymm)
        rdvs = await db.appointments.find({}, {"_id": 0}).to_list(20000)
        to_delete = []
        for r in rdvs:
            dt = parse_iso(r.get("finished_at") or r.get("date"))
            if dt is None:
                continue
            if start <= dt < end:
                to_delete.append(r["id"])
        if to_delete:
            await db.appointments.delete_many({"id": {"$in": to_delete}})
            total_deleted += len(to_delete)
        await db.urssaf_status.delete_one({"month": yyyymm})
    return {"deleted": total_deleted, "months": months}


async def reset_single_month(yyyymm: str) -> dict:
    res = await reset_months([yyyymm])
    return {"deleted": res["deleted"]}
