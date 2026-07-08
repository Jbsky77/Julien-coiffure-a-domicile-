import secrets

from pydantic import BaseModel, Field
from typing import Optional, Dict
from datetime import datetime, timezone
import uuid


def _gen_access_token() -> str:
    return secrets.token_urlsafe(24)


class Client(BaseModel):
    id: str = Field(default_factory=lambda: f"cli_{uuid.uuid4().hex[:10]}")
    first_name: str = ""
    last_name: str
    gender: Optional[str] = None  # "H" | "F" | None
    phone: str = ""
    address: str = ""
    address_parts: Optional[Dict[str, str]] = None
    comment: str = ""
    birthday: Optional[str] = None  # YYYY-MM-DD
    custom_fields: Dict[str, str] = {}
    loyalty_counters: Dict[str, int] = {}  # service_id -> count paid
    referred_by: Optional[str] = None  # client_id of the sponsor (parrain)
    referral_rewards_used: list = []  # [{used_at, appointment_id, service_name}]
    deposit_required: bool = False
    deposit_note: str = ""
    last_seen: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    access_token: str = Field(default_factory=_gen_access_token)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ClientCreate(BaseModel):
    first_name: str = ""
    last_name: str
    gender: Optional[str] = None
    phone: str = ""
    address: str = ""
    address_parts: Optional[Dict[str, str]] = None
    comment: str = ""
    birthday: Optional[str] = None
    custom_fields: Dict[str, str] = {}
    referred_by: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
