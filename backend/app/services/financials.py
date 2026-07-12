"""Shared financial calculations for every reporting surface."""
import math


def calculate_financials(*, appointments, urssaf_rate, consumables_per_client, fixed_costs, cb_fee_rate, fuel_cost):
    paid = [r for r in appointments if r.get("status") == "done"]
    ca_total = sum(float(r.get("price_final") or 0) for r in paid)
    n_paid = len(paid)
    urssaf = math.ceil(ca_total * float(urssaf_rate or 0))
    consumables = n_paid * float(consumables_per_client or 0)
    cb_amount = sum(float(r.get("price_final") or 0) for r in paid if (r.get("payment_mode") or "").upper() == "CB")
    cb_fees = round(cb_amount * float(cb_fee_rate or 0), 2)
    before_fixed = ca_total - urssaf - consumables - cb_fees - float(fuel_cost or 0)
    net = before_fixed - float(fixed_costs or 0)
    return {
        "ca_total": round(ca_total, 2), "n_paid": n_paid,
        "average_basket": round(ca_total / n_paid, 2) if n_paid else 0.0,
        "urssaf": urssaf, "consumables": round(consumables, 2),
        "cb_amount": round(cb_amount, 2), "cb_fees": cb_fees,
        "fuel_cost": float(fuel_cost or 0), "fixed_costs": float(fixed_costs or 0),
        "margin_before_fixed_costs": round(before_fixed, 2), "net_margin": round(net, 2),
    }
