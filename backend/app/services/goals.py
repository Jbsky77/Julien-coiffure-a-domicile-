"""Monthly goals progress."""
from app.services.settings import get_settings
from app.services.accounting import accounting_month_data
from app.utils.dates import yyyymm_now


def _pct(value: float, goal: float) -> float:
    if not goal:
        return 0
    return min(100, round(value / goal * 100, 1))


async def goals_progress() -> dict:
    settings = await get_settings()
    yyyymm = yyyymm_now()
    md = await accounting_month_data(yyyymm)
    panier = round(md["ca_brut"] / md["n_rdv"], 2) if md["n_rdv"] else 0
    return {
        "month": yyyymm,
        "ca": {"value": md["ca_brut"], "goal": settings.goal_ca, "pct": _pct(md["ca_brut"], settings.goal_ca)},
        "rdv": {"value": md["n_rdv"], "goal": settings.goal_rdv, "pct": _pct(md["n_rdv"], settings.goal_rdv)},
        "panier": {"value": panier, "goal": settings.goal_panier, "pct": _pct(panier, settings.goal_panier)},
        "relances": {"value": 0, "goal": settings.goal_relances, "pct": 0},
    }
