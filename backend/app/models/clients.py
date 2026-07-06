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
    comment: str = ""
    birthday: Optional[str] = None  # YYYY-MM-DD
    custom_fields: Dict[str, str] = {}
    loyalty_counters: Dict[str, int] = {}  # service_id -> count paid
    referrals: int = 0  # validated filleuls
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
    comment: str = ""
    birthday: Optional[str] = None
    custom_fields: Dict[str, str] = {}
