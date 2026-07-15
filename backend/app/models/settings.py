from pydantic import BaseModel
from typing import Optional


class BusinessAddress(BaseModel):
    address: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    geocode_status: str = "pending"  # "ok" | "not_found" | "error" | "pending"
    verified_at: Optional[str] = None


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
    referral_threshold: int = 4  # filleuls needed per free cut
    brand_name: str = "Mon entreprise"
    brand_color: str = "#D4AF37"
    brand_logo: Optional[str] = None  # data URL
    google_review_url: str = ""
    google_review_url_short: str = ""
    review_sms_template: str = "Bonjour {first_name}, merci pour votre confiance ! Donnez votre avis sur votre coiffeur ici : {url} — {brand_name}"
    reminder_sms_template: str = "Bonjour {first_name}, petit rappel de votre rendez-vous demain à {time} ({services}). À demain ! — {brand_name}"
    invoice_brand_name: str = "Mon entreprise"
    business_address: BusinessAddress = BusinessAddress()
