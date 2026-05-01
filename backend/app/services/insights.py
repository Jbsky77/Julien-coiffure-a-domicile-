"""Automatic business insights from completed appointments."""
from app.db import db
from app.utils.dates import now_utc, parse_iso


async def compute_insights() -> list:
    rdvs = await db.appointments.find({"status": "done"}, {"_id": 0}).to_list(20000)
    if not rdvs:
        return []
    now = now_utc()

    weekday_rev = [0.0] * 7
    weekday_count = [0] * 7
    morning_rev = afternoon_rev = 0.0
    morning_n = afternoon_n = 0
    far_margin = []
    near_margin = []
    cat_rev = {}
    durations = []
    total_min_month = 0

    for r in rdvs:
        dt = parse_iso(r.get("finished_at") or r["date"])
        if dt is None:
            continue
        wd = dt.weekday()
        weekday_rev[wd] += r["price_final"]
        weekday_count[wd] += 1
        if dt.hour < 12:
            morning_rev += r["price_final"]
            morning_n += 1
        else:
            afternoon_rev += r["price_final"]
            afternoon_n += 1
        km = r.get("kilometrage", 0)
        if km > 20:
            far_margin.append(r["price_final"] - r.get("fuel_supplement", 0))
        else:
            near_margin.append(r["price_final"])
        for s in r["services"]:
            cat = s.get("category", "AUTRE")
            cat_rev[cat] = cat_rev.get(cat, 0) + s.get("price", 0)
        if r.get("duration_minutes"):
            durations.append(r["duration_minutes"])
        if (now - dt).days <= 30:
            total_min_month += r.get("duration_minutes") or 0

    insights = []
    best_wd = max(range(7), key=lambda i: weekday_rev[i])
    if weekday_count[best_wd] > 1:
        names = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
        insights.append(f"Le {names[best_wd]} est votre jour le plus rentable")
    if morning_n >= 3 and afternoon_n >= 3:
        morning_avg = morning_rev / morning_n
        afternoon_avg = afternoon_rev / afternoon_n
        if morning_avg > afternoon_avg * 1.1:
            insights.append("Le matin est votre créneau le plus performant")
        elif afternoon_avg > morning_avg * 1.1:
            insights.append("L'après-midi génère un panier plus élevé")
    if len(far_margin) >= 3 and len(near_margin) >= 3:
        if (sum(far_margin) / len(far_margin)) < (sum(near_margin) / len(near_margin)) * 0.85:
            insights.append("Les rendez-vous à plus de 20 km ont une marge plus faible")
    if cat_rev:
        top_cat = max(cat_rev, key=cat_rev.get)
        cat_label = {"HOMME": "Homme", "FEMME": "Femme", "ENFANT": "Enfant", "AUTRE": "Diverses"}
        insights.append(f"Les prestations {cat_label.get(top_cat, top_cat)} représentent la plus grande part du chiffre d'affaires")
    if durations:
        avg_d = round(sum(durations) / len(durations))
        insights.append(f"Le temps moyen passé par rendez-vous est de {avg_d} minutes")
    if total_min_month > 0:
        hours = round(total_min_month / 60, 1)
        insights.append(f"Votre durée totale de prestation ce mois-ci est de {hours} heures")
    return insights[:5]
