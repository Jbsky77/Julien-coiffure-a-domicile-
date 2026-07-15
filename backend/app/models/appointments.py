from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from app.models.stock import AppointmentProductUsageInput
from datetime import datetime, timezone
import uuid


class AppointmentService(BaseModel):
    service_id: str
    name: str
    price: float
    category: str
    is_gift: bool = False
    stylist: str = ""


class Appointment(BaseModel):
    id: str = Field(default_factory=lambda: f"rdv_{uuid.uuid4().hex[:10]}")
    client_id: str
    client_name: str = ""
    assigned_employee_id: Optional[str] = None
    assigned_employee_name: Optional[str] = None
    date: str  # ISO datetime
    services: List[AppointmentService] = []
    kilometrage: float = 0
    notes: str = ""
    price_base: float = 0
    fuel_supplement: float = 0
    price_final: float = 0  # editable
    payment_mode: Optional[str] = None
    status: str = "scheduled"
    family_pack_applied: bool = False
    gift_applied: bool = False
    duration_minutes: Optional[int] = None
    invoice_number: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    started_at: Optional[str] = None  # timer start (arrival at client's home)
    timer_seconds: float = 0  # accumulated elapsed seconds (pauses excluded)
    timer_status: Optional[str] = None  # None|"running"|"paused"|"stopped"
    finished_at: Optional[str] = None
    # ---- Travel (Voisin) ----
    distance_km_from_business: Optional[float] = None
    theoretical_fuel_supplement: float = 0  # what would be billed from business address
    is_neighbor: bool = False
    neighbor_of_client_id: Optional[str] = None
    neighbor_of_client_name: Optional[str] = None
    neighbor_of_client_address: Optional[str] = None
    neighbor_distance_km: Optional[float] = None
    neighbor_verified_at: Optional[str] = None
    neighbor_routing_source: Optional[str] = None  # "osrm" | "haversine"
    neighbor_discount: float = 0  # remise voisin
    supplement_manually_overridden: bool = False
    product_usages: List[Dict[str, Any]] = []


class AppointmentCreate(BaseModel):
    client_id: str
    assigned_employee_id: Optional[str] = None
    date: str
    services: List[Dict[str, Any]] = []  # list of {service_id, is_gift?}
    kilometrage: float = 0
    notes: str = ""
    price_final_override: Optional[float] = None
    is_neighbor: bool = False
    neighbor_of_client_id: Optional[str] = None
    product_usages: List[AppointmentProductUsageInput] = []


class AppointmentUpdate(BaseModel):
    date: Optional[str] = None
    assigned_employee_id: Optional[str] = None
    services: Optional[List[Dict[str, Any]]] = None
    kilometrage: Optional[float] = None
    notes: Optional[str] = None
    price_final_override: Optional[float] = None
    is_neighbor: Optional[bool] = None
    neighbor_of_client_id: Optional[str] = None
    product_usages: Optional[List[AppointmentProductUsageInput]] = None


class FinishAppointment(BaseModel):
    payment_mode: str
    price_final: Optional[float] = None
    duration_minutes: Optional[int] = None
    stylists: Optional[Dict[str, str]] = None  # service_id -> employee display name
    use_referral_reward: bool = False
    product_usages: Optional[List[AppointmentProductUsageInput]] = None
