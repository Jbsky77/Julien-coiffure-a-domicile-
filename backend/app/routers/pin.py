"""PIN-based lock for the app (single-user).

Not a full auth system — just a 6-digit PIN stored bcrypt-hashed in
`db.app_security` under key `pin`. The endpoint returns a short-lived
signed token that the frontend keeps in localStorage.

The token is HMAC-signed with a static secret derived from the PIN hash so
that clearing/regenerating the PIN invalidates all previously issued tokens.
"""
import base64
import hashlib
import hmac
import logging
import time
from typing import Optional

import bcrypt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.db import db

logger = logging.getLogger(__name__)

router = APIRouter()

# Base salt used to derive the HMAC secret from the stored PIN hash so
# every PIN change invalidates all previously issued tokens.
_STATIC_PEPPER = b"julienbouche-pin-pepper-v1"


# ---------------- data helpers ----------------------------------------

async def _read_security() -> dict:
    doc = await db.app_security.find_one({"_id": "pin"}, {"_id": 0})
    return doc or {}


async def _write_security(patch: dict):
    await db.app_security.update_one({"_id": "pin"}, {"$set": patch}, upsert=True)


def _hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _verify_pin(pin: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---------------- token issuing / verification ------------------------


def _secret_for(hashed_pin: str) -> bytes:
    return hashlib.sha256(_STATIC_PEPPER + hashed_pin.encode("utf-8")).digest()


def _sign(payload: str, secret: bytes) -> str:
    mac = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode("ascii").rstrip("=")


def _make_token(hashed_pin: str, ttl_seconds: int) -> str:
    exp = int(time.time()) + max(60, ttl_seconds)
    payload = f"v1.{exp}"
    sig = _sign(payload, _secret_for(hashed_pin))
    return f"{payload}.{sig}"


async def _token_is_valid(token: Optional[str]) -> bool:
    if not token:
        return False
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != "v1":
        return False
    try:
        exp = int(parts[1])
    except ValueError:
        return False
    if exp < int(time.time()):
        return False
    sec = await _read_security()
    if not sec.get("hash"):
        return False
    expected = _sign(f"v1.{exp}", _secret_for(sec["hash"]))
    return hmac.compare_digest(expected, parts[2])


async def require_unlocked(request: Request) -> None:
    """Dependency helper — raises 401 if PIN is set but not unlocked."""
    sec = await _read_security()
    if not sec.get("hash"):
        return  # PIN not configured yet → open
    token = request.headers.get("x-pin-token")
    if not await _token_is_valid(token):
        raise HTTPException(status_code=401, detail="Locked")


# ---------------- routes ---------------------------------------------


class PinPayload(BaseModel):
    pin: str
    old_pin: Optional[str] = None
    ttl_seconds: Optional[int] = 15 * 60


@router.get("/pin/status")
async def pin_status():
    sec = await _read_security()
    return {"configured": bool(sec.get("hash"))}


@router.post("/pin/set")
async def pin_set(payload: PinPayload):
    if not payload.pin or len(payload.pin) < 4 or not payload.pin.isdigit():
        raise HTTPException(400, "PIN must be 4-8 digits")
    sec = await _read_security()
    if sec.get("hash"):
        # PIN already configured → must provide old_pin
        if not payload.old_pin or not _verify_pin(payload.old_pin, sec["hash"]):
            raise HTTPException(403, "Ancien PIN incorrect")
    hashed = _hash_pin(payload.pin)
    await _write_security({"hash": hashed, "updated_at": int(time.time())})
    token = _make_token(hashed, payload.ttl_seconds or 15 * 60)
    return {"ok": True, "token": token, "expires_in": payload.ttl_seconds or 15 * 60}


@router.post("/pin/unlock")
async def pin_unlock(payload: PinPayload):
    sec = await _read_security()
    if not sec.get("hash"):
        # No PIN configured — nothing to unlock.
        return {"ok": True, "token": None, "expires_in": 0, "configured": False}
    # Naive rate-limiting: 5 attempts / 60s
    now = int(time.time())
    attempts = sec.get("attempts", [])
    attempts = [t for t in attempts if now - t < 60]
    if len(attempts) >= 5:
        await _write_security({"attempts": attempts})
        raise HTTPException(429, "Trop d'essais, réessayez dans 1 minute")
    if not _verify_pin(payload.pin, sec["hash"]):
        attempts.append(now)
        await _write_security({"attempts": attempts})
        raise HTTPException(403, "PIN incorrect")
    # Success
    await _write_security({"attempts": [], "last_unlock": now})
    token = _make_token(sec["hash"], payload.ttl_seconds or 15 * 60)
    return {"ok": True, "token": token, "expires_in": payload.ttl_seconds or 15 * 60, "configured": True}
