"""Dashboard aggregation."""
from datetime import datetime, timedelta, timezone

from app.db import db
from app.services.accounting import accounting_month_data
from app.utils.dates import PARIS_TZ, now_utc, paris_day_range, parse_iso, yyyymm_now


async def build_dashboard() -> dict:
    now = now_utc()
    yyyymm = yyyymm_now()
    month_data = await accounting_month_data(yyyymm)

    all_rdv = await db.appointments.find({}, {"_id": 0}).to_list(5000)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    tomorrow_start = today_start + timedelta(days=1)
    day_after = today_start + timedelta(days=2)

    upcoming_today = []
    upcoming_tomorrow = []
    all_upcoming = []
    upcoming_amount = 0.0
    for r in all_rdv:
        dt = parse_iso(r.get("date"))
        if dt is None:
            continue
        if r["status"] == "scheduled":
            if dt >= now:
                all_upcoming.append(r)
                upcoming_amount += r.get("price_final", 0)
            if today_start <= dt < tomorrow_start:
                upcoming_today.append(r)
            elif tomorrow_start <= dt < day_after:
                upcoming_tomorrow.append(r)

    upcoming_today.sort(key=lambda r: (parse_iso(r.get("date")), r.get("created_at") or ""))
    upcoming_tomorrow.sort(key=lambda r: (parse_iso(r.get("date")), r.get("created_at") or ""))
    all_upcoming.sort(key=lambda r: (parse_iso(r.get("date")), r.get("created_at") or ""))

    clients = await db.clients.find({}, {"_id": 0}).to_list(5000)
    upcoming_birthdays = []
    for c in clients:
        bd = c.get("birthday")
        if not bd:
            continue
        try:
            parts = bd.split("-")
            bd_this = datetime(now.year, int(parts[1]), int(parts[2]), tzinfo=timezone.utc)
            delta = (bd_this - today_start).days
            if delta < 0:
                bd_this = datetime(now.year + 1, int(parts[1]), int(parts[2]), tzinfo=timezone.utc)
                delta = (bd_this - today_start).days
            if 0 <= delta <= 7:
                upcoming_birthdays.append({**c, "days_until": delta, "next_birthday": bd_this.isoformat()})
        except Exception:
            continue

    unseen = []
    for c in clients:
        ls = parse_iso(c.get("last_seen"))
        if ls is None:
            continue
        days = (now - ls).days
        if days > 30:
            unseen.append({**c, "days_since": days})

    done = [r for r in all_rdv if r["status"] == "done"]
    avg_day = avg_month = avg_year = 0
    if done:
        sums = {"d": {}, "m": {}, "y": {}}
        for r in done:
            dt = parse_iso(r.get("finished_at") or r["date"])
            if dt is None:
                continue
            for scope, k in [("d", dt.strftime("%Y-%m-%d")), ("m", dt.strftime("%Y-%m")), ("y", dt.strftime("%Y"))]:
                sums[scope].setdefault(k, [0, 0])
                sums[scope][k][0] += r["price_final"]
                sums[scope][k][1] += 1

        def _avg(bucket):
            if not bucket:
                return 0
            vals = [v[0] / v[1] for v in bucket.values() if v[1] > 0]
            return round(sum(vals) / len(vals), 2) if vals else 0

        avg_day = _avg(sums["d"])
        avg_month = _avg(sums["m"])
        avg_year = _avg(sums["y"])

    stocks = await db.stock.find({}, {"_id": 0}).to_list(1000)
    low_stock = [s for s in stocks if s["quantity"] <= s["threshold"]]

    today_gifts = {"count": 0, "value": 0.0}
    month_gifts = {"count": month_data["n_gifts"], "value": month_data["value_gifts"]}
    for r in done:
        dt = parse_iso(r.get("finished_at") or r["date"])
        if dt is None:
            continue
        if today_start <= dt < tomorrow_start:
            for s in r["services"]:
                if s.get("is_gift"):
                    today_gifts["count"] += 1
                    today_gifts["value"] += s["price"]

    return {
        "month": yyyymm,
        "month_data": month_data,
        "upcoming_today": upcoming_today,
        "upcoming_tomorrow": upcoming_tomorrow,
        "upcoming_count": len(all_upcoming),
        "upcoming_amount": round(upcoming_amount, 2),
        "upcoming_birthdays": upcoming_birthdays,
        "unseen_clients": unseen,
        "avg_basket": {
            "day": avg_day,
            "month": month_data.get("panier_moyen", 0.0),
            "history": round(sum(float(r.get("price_final") or 0) for r in done) / len(done), 2) if done else 0.0,
        },
        "stock_items": stocks,
        "low_stock": low_stock,
        "gifts_today": today_gifts,
        "gifts_month": month_gifts,
    }
