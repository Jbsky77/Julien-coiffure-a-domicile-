from pydantic import BaseModel
from typing import Optional


class Settings(BaseModel):
    fuel_price_per_liter: float = 1.85
    urssaf_rate: float = 0.22
    consumables_per_client: float = 2.0
    fixed_costs_monthly: float = 352.0
    fuel_supplement_per_tier: float = 2.5
    fuel_supplement_tier_km: float = 10.0
    consumption_l_per_100km: float = 4.0
    cb_fee_rate: float = 0.0175
    avg_speed_kmh: float = 40.0
    default_duration_minutes: int = 45
    goal_ca: float = 3000.0
    goal_rdv: int = 60
    goal_panier: float = 50.0
    goal_relances: int = 10
    brand_name: str = "Julien Bouche"
    brand_color: str = "#D4AF37"
    brand_logo: Optional[str] = None  # data URL
