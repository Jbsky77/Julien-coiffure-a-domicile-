from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Cookie, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api = APIRouter(prefix="/api")


# ============================================================
# MODELS
# ============================================================
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = ""


class Service(BaseModel):
    id: str = Field(default_factory=lambda: f"svc_{uuid.uuid4().hex[:10]}")
    name: str
    price: float
    category: str  # HOMME, FEMME, ENFANT, AUTRE


class ServiceCreate(BaseModel):
    name: str
    price: float
    category: str


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


class AppointmentService(BaseModel):
    service_id: str
    name: str
    price: float
    category: str
    is_gift: bool = False


class Appointment(BaseModel):
    id: str = Field(default_factory=lambda: f"rdv_{uuid.uuid4().hex[:10]}")
    client_id: str
    client_name: str = ""
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
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    finished_at: Optional[str] = None


class AppointmentCreate(BaseModel):
    client_id: str
    date: str
    services: List[Dict[str, Any]] = []  # list of {service_id, is_gift?}
    kilometrage: float = 0
    notes: str = ""
    price_final_override: Optional[float] = None


class AppointmentUpdate(BaseModel):
    date: Optional[str] = None
    services: Optional[List[Dict[str, Any]]] = None
    kilometrage: Optional[float] = None
    notes: Optional[str] = None
    price_final_override: Optional[float] = None


class FinishAppointment(BaseModel):
    payment_mode: str
    price_final: Optional[float] = None
    duration_minutes: Optional[int] = None


class StockItem(BaseModel):
    id: str = Field(default_factory=lambda: f"stk_{uuid.uuid4().hex[:10]}")
    name: str
    quantity: float
    threshold: float = 0
    tag: str = "Autre"


class StockCreate(BaseModel):
    name: str
    quantity: float
    threshold: float = 0
    tag: str = "Autre"


class Settings(BaseModel):
    fuel_price_per_liter: float = 1.85
    urssaf_rate: float = 0.22
    consumables_per_client: float = 2.0
    fixed_costs_monthly: float = 352.0
    fuel_supplement_per_tier: float = 2.5
    fuel_supplement_tier_km: float = 10.0
    consumption_l_per_100km: float = 4.0
    cb_fee_rate: float = 0.0175


# ============================================================
# AUTH
# ============================================================
async def get_current_user(
    request: Request,
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
) -> User:
    # Auth disabled: return default local user (single-user app for Julien)
    return User(user_id="local-julien", email="julien@local", name="Julien Bouche", picture="")


@api.post("/auth/google/session")
async def create_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data["name"], "picture": data.get("picture", "")}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": data["name"],
                "picture": data.get("picture", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    session_token = data["session_token"]
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one(
        {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires,
            "created_at": datetime.now(timezone.utc),
        }
    )
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 60 * 60,
        path="/",
    )
    return {"user_id": user_id, "email": email, "name": data["name"], "picture": data.get("picture", "")}


@api.get("/auth/me")
async def auth_me(user: User = Depends(get_current_user)):
    return user.model_dump()


@api.post("/auth/logout")
async def logout(response: Response, session_token: Optional[str] = Cookie(default=None)):
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ============================================================
# SETTINGS
# ============================================================
async def get_settings() -> Settings:
    doc = await db.settings.find_one({"_id": "singleton"}, {"_id": 0})
    if not doc:
        s = Settings().model_dump()
        await db.settings.insert_one({"_id": "singleton", **s})
        return Settings(**s)
    return Settings(**doc)


@api.get("/settings")
async def settings_get(user: User = Depends(get_current_user)):
    s = await get_settings()
    return s.model_dump()


@api.put("/settings")
async def settings_put(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    await db.settings.update_one({"_id": "singleton"}, {"$set": payload}, upsert=True)
    s = await get_settings()
    return s.model_dump()


# ============================================================
# SERVICES (prestations)
# ============================================================
DEFAULT_SERVICES = [
    {"name": "Coupe Homme", "price": 15.0, "category": "HOMME"},
    {"name": "Coupe + Barbe", "price": 22.0, "category": "HOMME"},
    {"name": "Coupe Femme", "price": 22.0, "category": "FEMME"},
    {"name": "Forfait Femme complet", "price": 45.0, "category": "FEMME"},
    {"name": "Coupe Enfant", "price": 12.0, "category": "ENFANT"},
]


async def ensure_default_services():
    count = await db.services.count_documents({})
    if count == 0:
        for s in DEFAULT_SERVICES:
            doc = Service(**s).model_dump()
            await db.services.insert_one(doc)


@api.get("/services")
async def services_list(user: User = Depends(get_current_user)):
    await ensure_default_services()
    items = await db.services.find({}, {"_id": 0}).to_list(1000)
    return items


@api.post("/services")
async def services_create(payload: ServiceCreate, user: User = Depends(get_current_user)):
    svc = Service(**payload.model_dump())
    await db.services.insert_one(svc.model_dump())
    return svc.model_dump()


@api.put("/services/{sid}")
async def services_update(sid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    await db.services.update_one({"id": sid}, {"$set": payload})
    doc = await db.services.find_one({"id": sid}, {"_id": 0})
    return doc


@api.delete("/services/{sid}")
async def services_delete(sid: str, user: User = Depends(get_current_user)):
    await db.services.delete_one({"id": sid})
    return {"ok": True}


# ============================================================
# CLIENTS
# ============================================================
@api.get("/clients")
async def clients_list(user: User = Depends(get_current_user)):
    items = await db.clients.find({}, {"_id": 0}).to_list(5000)
    return items


@api.post("/clients")
async def clients_create(payload: ClientCreate, user: User = Depends(get_current_user)):
    c = Client(**payload.model_dump())
    await db.clients.insert_one(c.model_dump())
    return c.model_dump()


@api.get("/clients/{cid}")
async def clients_get(cid: str, user: User = Depends(get_current_user)):
    doc = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    rdvs = await db.appointments.find({"client_id": cid}, {"_id": 0}).to_list(500)
    return {"client": doc, "appointments": rdvs}


@api.put("/clients/{cid}")
async def clients_update(cid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    await db.clients.update_one({"id": cid}, {"$set": payload})
    doc = await db.clients.find_one({"id": cid}, {"_id": 0})
    return doc


@api.get("/clients/{cid}/photos")
async def client_photos_list(cid: str, user: User = Depends(get_current_user)):
    pairs = await db.client_photos.find({"client_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return pairs


@api.post("/clients/{cid}/photos")
async def client_photos_create(cid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    client = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    pair_id = f"ph_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": pair_id,
        "client_id": cid,
        "before": payload.get("before"),  # data URL base64
        "after": payload.get("after"),
        "note": payload.get("note", ""),
        "date": payload.get("date") or datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.client_photos.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.put("/clients/{cid}/photos/{pid}")
async def client_photos_update(cid: str, pid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    update = {}
    for k in ["before", "after", "note", "date"]:
        if k in payload:
            update[k] = payload[k]
    if update:
        await db.client_photos.update_one({"id": pid, "client_id": cid}, {"$set": update})
    doc = await db.client_photos.find_one({"id": pid, "client_id": cid}, {"_id": 0})
    return doc


@api.delete("/clients/{cid}/photos/{pid}")
async def client_photos_delete(cid: str, pid: str, user: User = Depends(get_current_user)):
    await db.client_photos.delete_one({"id": pid, "client_id": cid})
    return {"ok": True}


@api.post("/clients/import")
async def clients_import(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    items = payload.get("clients", [])
    created = 0
    for it in items:
        if not it.get("last_name"):
            continue
        c = Client(
            first_name=it.get("first_name", ""),
            last_name=it.get("last_name", ""),
            phone=it.get("phone", ""),
            address=it.get("address", ""),
            comment=it.get("comment", ""),
            birthday=it.get("birthday") or None,
        )
        await db.clients.insert_one(c.model_dump())
        created += 1
    return {"created": created}


@api.delete("/clients/{cid}")
async def clients_delete(cid: str, user: User = Depends(get_current_user)):
    await db.clients.delete_one({"id": cid})
    await db.appointments.delete_many({"client_id": cid})
    return {"ok": True}


# ============================================================
# APPOINTMENTS
# ============================================================
async def compute_appointment_totals(services_input: List[Dict[str, Any]], kilometrage: float, price_final_override: Optional[float] = None):
    settings = await get_settings()
    # Hydrate services
    svc_objs = []
    for s in services_input:
        svc = await db.services.find_one({"id": s["service_id"]}, {"_id": 0})
        if not svc:
            continue
        item = {
            "service_id": svc["id"],
            "name": svc["name"],
            "price": svc["price"],
            "category": svc["category"],
            "is_gift": bool(s.get("is_gift", False)),
        }
        svc_objs.append(item)
    # Base total without gifts
    subtotal = sum(x["price"] for x in svc_objs if not x["is_gift"])
    # Family pack detection: HOMME + FEMME + ENFANT present (non-gift) -> 45€
    cats = {x["category"] for x in svc_objs if not x["is_gift"]}
    family_pack = {"HOMME", "FEMME", "ENFANT"}.issubset(cats)
    if family_pack:
        subtotal = 45.0
    # Fuel supplement: tier-based: floor(km/tier_km)*tier_price
    tier_km = settings.fuel_supplement_tier_km or 10
    tier_price = settings.fuel_supplement_per_tier or 2.5
    tiers = int(kilometrage // tier_km) if kilometrage > 0 else 0
    fuel_supplement = tiers * tier_price
    price_base = subtotal + fuel_supplement
    price_final = price_final_override if price_final_override is not None else price_base
    gift_applied = any(x["is_gift"] for x in svc_objs)
    return svc_objs, subtotal, fuel_supplement, price_base, price_final, family_pack, gift_applied


@api.get("/appointments")
async def appointments_list(user: User = Depends(get_current_user)):
    items = await db.appointments.find({}, {"_id": 0}).sort("date", 1).to_list(5000)
    return items


@api.post("/appointments")
async def appointments_create(payload: AppointmentCreate, user: User = Depends(get_current_user)):
    client_doc = await db.clients.find_one({"id": payload.client_id}, {"_id": 0})
    if not client_doc:
        raise HTTPException(404, "Client not found")
    svc_objs, subtotal, fuel, base, final, family, gift = await compute_appointment_totals(
        payload.services, payload.kilometrage, payload.price_final_override
    )
    client_name = f"{client_doc.get('first_name','')} {client_doc.get('last_name','')}".strip()
    rdv = Appointment(
        client_id=payload.client_id,
        client_name=client_name,
        date=payload.date,
        services=[AppointmentService(**x) for x in svc_objs],
        kilometrage=payload.kilometrage,
        notes=payload.notes,
        price_base=base,
        fuel_supplement=fuel,
        price_final=final,
        family_pack_applied=family,
        gift_applied=gift,
    )
    await db.appointments.insert_one(rdv.model_dump())
    return rdv.model_dump()


@api.put("/appointments/{rid}")
async def appointments_update(rid: str, payload: AppointmentUpdate, user: User = Depends(get_current_user)):
    current = await db.appointments.find_one({"id": rid}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Not found")
    if current.get("status") == "done":
        raise HTTPException(400, "Appointment already finished")
    services_input = payload.services if payload.services is not None else [
        {"service_id": s["service_id"], "is_gift": s.get("is_gift", False)} for s in current["services"]
    ]
    km = payload.kilometrage if payload.kilometrage is not None else current["kilometrage"]
    svc_objs, subtotal, fuel, base, final, family, gift = await compute_appointment_totals(
        services_input, km, payload.price_final_override
    )
    update = {
        "services": svc_objs,
        "kilometrage": km,
        "price_base": base,
        "fuel_supplement": fuel,
        "price_final": final,
        "family_pack_applied": family,
        "gift_applied": gift,
    }
    if payload.date is not None:
        update["date"] = payload.date
    if payload.notes is not None:
        update["notes"] = payload.notes
    await db.appointments.update_one({"id": rid}, {"$set": update})
    doc = await db.appointments.find_one({"id": rid}, {"_id": 0})
    return doc


@api.post("/appointments/{rid}/finish")
async def appointments_finish(rid: str, payload: FinishAppointment, user: User = Depends(get_current_user)):
    rdv = await db.appointments.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "Not found")
    if rdv.get("status") == "done":
        raise HTTPException(400, "Already finished")
    final = payload.price_final if payload.price_final is not None else rdv["price_final"]
    update_fields = {
        "status": "done",
        "payment_mode": payload.payment_mode,
        "price_final": final,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.duration_minutes is not None:
        update_fields["duration_minutes"] = payload.duration_minutes
    await db.appointments.update_one(
        {"id": rid},
        {"$set": update_fields},
    )
    # Update client loyalty counters - count paid services per service_id; reset for gifted
    client = await db.clients.find_one({"id": rdv["client_id"]}, {"_id": 0})
    if client:
        counters = client.get("loyalty_counters", {}) or {}
        for s in rdv["services"]:
            sid = s["service_id"]
            if s.get("is_gift"):
                counters[sid] = 0  # reset after gift
            else:
                counters[sid] = counters.get(sid, 0) + 1
        await db.clients.update_one(
            {"id": rdv["client_id"]},
            {"$set": {"loyalty_counters": counters, "last_seen": datetime.now(timezone.utc).isoformat()}},
        )
    return await db.appointments.find_one({"id": rid}, {"_id": 0})


@api.post("/appointments/{rid}/cancel")
async def appointments_cancel(rid: str, user: User = Depends(get_current_user)):
    rdv = await db.appointments.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "Not found")
    await db.appointments.update_one({"id": rid}, {"$set": {"status": "cancelled"}})
    return await db.appointments.find_one({"id": rid}, {"_id": 0})


@api.get("/analytics")
async def analytics(user: User = Depends(get_current_user)):
    rdvs = await db.appointments.find({"status": "done"}, {"_id": 0}).to_list(20000)
    clients = await db.clients.find({}, {"_id": 0}).to_list(5000)
    # Top prestations
    svc_stats = {}
    for r in rdvs:
        for s in r["services"]:
            k = s["service_id"]
            e = svc_stats.setdefault(k, {"service_id": k, "name": s["name"], "count": 0, "revenue": 0.0})
            e["count"] += 1
            if not s.get("is_gift"):
                e["revenue"] += s["price"]
    top_services = sorted(svc_stats.values(), key=lambda x: x["revenue"], reverse=True)
    # Top clients
    client_stats = {}
    for r in rdvs:
        k = r["client_id"]
        e = client_stats.setdefault(k, {"client_id": k, "client_name": r.get("client_name", ""), "count": 0, "revenue": 0.0})
        e["count"] += 1
        e["revenue"] += r["price_final"]
    top_clients = sorted(client_stats.values(), key=lambda x: x["revenue"], reverse=True)
    # Seasonal (per month current year)
    now = datetime.now(timezone.utc)
    seasonal = [{"month": m, "label": ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"][m-1], "ca": 0.0, "n": 0} for m in range(1, 13)]
    for r in rdvs:
        try:
            dt = datetime.fromisoformat((r.get("finished_at") or r["date"]).replace("Z", "+00:00"))
        except Exception:
            continue
        if dt.year == now.year:
            seasonal[dt.month - 1]["ca"] += r["price_final"]
            seasonal[dt.month - 1]["n"] += 1
    # Weekdays
    weekdays = [{"day": i, "label": ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"][i], "ca": 0.0, "n": 0} for i in range(7)]
    for r in rdvs:
        try:
            dt = datetime.fromisoformat((r.get("finished_at") or r["date"]).replace("Z", "+00:00"))
            idx = (dt.weekday())  # Mon=0
            weekdays[idx]["ca"] += r["price_final"]
            weekdays[idx]["n"] += 1
        except Exception:
            continue
    total = sum(r["price_final"] for r in rdvs)
    # Gender & age stats
    def compute_age(bd):
        try:
            d = datetime.fromisoformat(bd)
            today = datetime.now(timezone.utc)
            yrs = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
            return yrs
        except Exception:
            return None
    gender_counts = {"H": 0, "F": 0, "N": 0}
    age_buckets = {"<18": 0, "18-29": 0, "30-44": 0, "45-59": 0, "60+": 0, "N/A": 0}
    gender_rev = {"H": 0.0, "F": 0.0, "N": 0.0}
    for c in clients:
        g = c.get("gender") or "N"
        gender_counts[g] = gender_counts.get(g, 0) + 1
        age = compute_age(c.get("birthday")) if c.get("birthday") else None
        if age is None:
            age_buckets["N/A"] += 1
        elif age < 18:
            age_buckets["<18"] += 1
        elif age < 30:
            age_buckets["18-29"] += 1
        elif age < 45:
            age_buckets["30-44"] += 1
        elif age < 60:
            age_buckets["45-59"] += 1
        else:
            age_buckets["60+"] += 1
    # Revenue by gender
    client_gender = {c["id"]: (c.get("gender") or "N") for c in clients}
    for r in rdvs:
        g = client_gender.get(r["client_id"], "N")
        gender_rev[g] = gender_rev.get(g, 0.0) + r["price_final"]
    gender_stats = [
        {"gender": "H", "label": "Hommes", "count": gender_counts.get("H", 0), "revenue": round(gender_rev.get("H", 0), 2)},
        {"gender": "F", "label": "Femmes", "count": gender_counts.get("F", 0), "revenue": round(gender_rev.get("F", 0), 2)},
        {"gender": "N", "label": "Non précisé", "count": gender_counts.get("N", 0), "revenue": round(gender_rev.get("N", 0), 2)},
    ]
    age_stats = [{"range": k, "count": v} for k, v in age_buckets.items()]
    # Average age (only clients with birthday)
    ages = [compute_age(c.get("birthday")) for c in clients if c.get("birthday")]
    ages = [a for a in ages if a is not None]
    average_age = round(sum(ages) / len(ages), 1) if ages else None
    # Average duration (done rdvs with duration)
    durations = [r.get("duration_minutes") for r in rdvs if r.get("duration_minutes")]
    average_duration = round(sum(durations) / len(durations), 1) if durations else None
    total_duration = sum(durations) if durations else 0
    return {
        "top_services": top_services,
        "top_clients": top_clients,
        "seasonal": seasonal,
        "weekdays": weekdays,
        "total_ca": round(total, 2),
        "total_rdv": len(rdvs),
        "total_clients": len(clients),
        "gender_stats": gender_stats,
        "age_stats": age_stats,
        "average_age": average_age,
        "average_duration_minutes": average_duration,
        "total_duration_minutes": total_duration,
    }


@api.get("/calendar/ical-url")
async def ical_url_endpoint(request: Request, session_token: Optional[str] = Cookie(default=None), authorization: Optional[str] = Header(default=None)):
    token = session_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid session")
    return {"url": f"/api/calendar/{token}.ics", "token": token}


@api.get("/calendar/{token}.ics")
async def ical_feed(token: str):
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid token")
    rdvs = await db.appointments.find({"status": {"$in": ["scheduled", "done"]}}, {"_id": 0}).to_list(5000)
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Julien Bouche//FR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Julien Bouche · RDV"]
    for r in rdvs:
        try:
            dt = datetime.fromisoformat(r["date"].replace("Z", "+00:00"))
        except Exception:
            continue
        start = dt.strftime("%Y%m%dT%H%M%SZ")
        end_dt = dt + timedelta(minutes=60)
        end = end_dt.strftime("%Y%m%dT%H%M%SZ")
        summary = f"{r.get('client_name','RDV')} · {', '.join([s['name'] for s in r['services']])}"
        lines += [
            "BEGIN:VEVENT",
            f"UID:{r['id']}@julienbouche",
            f"DTSTAMP:{start}",
            f"DTSTART:{start}",
            f"DTEND:{end}",
            f"SUMMARY:{summary}",
            f"DESCRIPTION:Montant {r['price_final']}€ — {r.get('notes','')}",
            f"STATUS:{'CONFIRMED' if r['status']=='done' else 'TENTATIVE'}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    from fastapi.responses import Response as FResponse
    return FResponse("\r\n".join(lines), media_type="text/calendar")


@api.put("/appointments/{rid}/payment")
async def appointments_update_payment(rid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    rdv = await db.appointments.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "Not found")
    update = {}
    if "payment_mode" in payload:
        update["payment_mode"] = payload["payment_mode"]
    if "price_final" in payload and payload["price_final"] is not None:
        update["price_final"] = float(payload["price_final"])
    if "duration_minutes" in payload:
        update["duration_minutes"] = payload["duration_minutes"]
    if "finished_at" in payload and payload["finished_at"]:
        update["finished_at"] = payload["finished_at"]
    if not update:
        return rdv
    await db.appointments.update_one({"id": rid}, {"$set": update})
    return await db.appointments.find_one({"id": rid}, {"_id": 0})


@api.delete("/appointments/{rid}")
async def appointments_delete(rid: str, user: User = Depends(get_current_user)):
    await db.appointments.delete_one({"id": rid})
    return {"ok": True}


# ============================================================
# STOCK
# ============================================================
@api.get("/stock")
async def stock_list(user: User = Depends(get_current_user)):
    items = await db.stock.find({}, {"_id": 0}).to_list(1000)
    return items


@api.post("/stock")
async def stock_create(payload: StockCreate, user: User = Depends(get_current_user)):
    item = StockItem(**payload.model_dump())
    await db.stock.insert_one(item.model_dump())
    return item.model_dump()


@api.put("/stock/{sid}")
async def stock_update(sid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    await db.stock.update_one({"id": sid}, {"$set": payload})
    return await db.stock.find_one({"id": sid}, {"_id": 0})


@api.delete("/stock/{sid}")
async def stock_delete(sid: str, user: User = Depends(get_current_user)):
    await db.stock.delete_one({"id": sid})
    return {"ok": True}


# ============================================================
# ACCOUNTING
# ============================================================
def month_range(yyyymm: str):
    y, m = yyyymm.split("-")
    start = datetime(int(y), int(m), 1, tzinfo=timezone.utc)
    if int(m) == 12:
        end = datetime(int(y) + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(int(y), int(m) + 1, 1, tzinfo=timezone.utc)
    return start, end


@api.get("/accounting/month/{yyyymm}")
async def accounting_month(yyyymm: str, user: User = Depends(get_current_user)):
    settings = await get_settings()
    start, end = month_range(yyyymm)
    rdvs = await db.appointments.find({"status": "done"}, {"_id": 0}).to_list(10000)
    in_month = []
    for r in rdvs:
        fin = r.get("finished_at") or r.get("date")
        try:
            dt = datetime.fromisoformat(fin.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if start <= dt < end:
            in_month.append(r)
    ca_brut = sum(r["price_final"] for r in in_month)
    n_rdv = len(in_month)
    # Per payment mode
    pm_breakdown = {}
    for r in in_month:
        pm = r.get("payment_mode") or "INCONNU"
        pm_breakdown.setdefault(pm, {"count": 0, "amount": 0.0})
        pm_breakdown[pm]["count"] += 1
        pm_breakdown[pm]["amount"] += r["price_final"]
    # Fuel real cost
    total_km = sum(r.get("kilometrage", 0) for r in in_month)
    fuel_real_cost = (total_km / 100.0) * settings.consumption_l_per_100km * settings.fuel_price_per_liter
    fuel_charged = sum(r.get("fuel_supplement", 0) for r in in_month)
    fuel_balance = fuel_charged - fuel_real_cost
    consumables = n_rdv * settings.consumables_per_client
    urssaf_raw = ca_brut * settings.urssaf_rate
    urssaf_ceil = math.ceil(urssaf_raw)
    fixed = settings.fixed_costs_monthly
    # CB fees: 1.75% (configurable) on transactions paid by card
    cb_amount = pm_breakdown.get("CB", {}).get("amount", 0.0)
    cb_count = pm_breakdown.get("CB", {}).get("count", 0)
    cb_fees_total = round(cb_amount * settings.cb_fee_rate, 2)
    marge_nette = ca_brut - urssaf_ceil - consumables - fixed - fuel_real_cost + fuel_charged - cb_fees_total
    # URSSAF declaration status
    decl = await db.urssaf_status.find_one({"month": yyyymm}, {"_id": 0}) or {"month": yyyymm, "declared": False, "paid": False}
    # Gifts stats
    n_gifts = 0
    value_gifts = 0.0
    for r in in_month:
        for s in r["services"]:
            if s.get("is_gift"):
                n_gifts += 1
                value_gifts += s.get("price", 0)
    return {
        "month": yyyymm,
        "ca_brut": round(ca_brut, 2),
        "n_rdv": n_rdv,
        "payment_breakdown": pm_breakdown,
        "total_km": total_km,
        "fuel_real_cost": round(fuel_real_cost, 2),
        "fuel_charged": round(fuel_charged, 2),
        "fuel_balance": round(fuel_balance, 2),
        "consumables": round(consumables, 2),
        "urssaf_raw": round(urssaf_raw, 2),
        "urssaf_ceil": urssaf_ceil,
        "fixed_costs": fixed,
        "marge_nette": round(marge_nette, 2),
        "cb_amount": round(cb_amount, 2),
        "cb_count": cb_count,
        "cb_fees_total": cb_fees_total,
        "cb_fee_rate": settings.cb_fee_rate,
        "n_gifts": n_gifts,
        "value_gifts": round(value_gifts, 2),
        "urssaf_status": decl,
    }


@api.get("/accounting/months")
async def accounting_all_months(user: User = Depends(get_current_user)):
    rdvs = await db.appointments.find({"status": "done"}, {"_id": 0}).to_list(20000)
    settings = await get_settings()
    by_month: Dict[str, Dict[str, float]] = {}
    for r in rdvs:
        fin = r.get("finished_at") or r.get("date")
        try:
            dt = datetime.fromisoformat(fin.replace("Z", "+00:00"))
        except Exception:
            continue
        key = f"{dt.year:04d}-{dt.month:02d}"
        by_month.setdefault(key, {"ca": 0.0, "n": 0, "urssaf": 0})
        by_month[key]["ca"] += r["price_final"]
        by_month[key]["n"] += 1
    out = []
    for k, v in sorted(by_month.items()):
        urssaf = math.ceil(v["ca"] * settings.urssaf_rate)
        decl = await db.urssaf_status.find_one({"month": k}, {"_id": 0}) or {"declared": False, "paid": False}
        out.append({"month": k, "ca": round(v["ca"], 2), "n_rdv": int(v["n"]), "urssaf": urssaf, **decl})
    return out


@api.post("/accounting/urssaf/{yyyymm}")
async def urssaf_toggle(yyyymm: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    await db.urssaf_status.update_one(
        {"month": yyyymm}, {"$set": {"month": yyyymm, **payload}}, upsert=True
    )
    doc = await db.urssaf_status.find_one({"month": yyyymm}, {"_id": 0})
    return doc


@api.get("/accounting/cb-fees")
async def cb_fees(period: str = "month", user: User = Depends(get_current_user)):
    """period: day | month | year"""
    settings = await get_settings()
    rate = settings.cb_fee_rate
    rdvs = await db.appointments.find({"status": "done", "payment_mode": "CB"}, {"_id": 0}).to_list(20000)
    buckets: Dict[str, Dict[str, float]] = {}
    for r in rdvs:
        fin = r.get("finished_at") or r.get("date")
        try:
            dt = datetime.fromisoformat(fin.replace("Z", "+00:00"))
        except Exception:
            continue
        if period == "day":
            key = dt.strftime("%Y-%m-%d")
        elif period == "year":
            key = dt.strftime("%Y")
        else:
            key = dt.strftime("%Y-%m")
        b = buckets.setdefault(key, {"key": key, "amount": 0.0, "count": 0, "fees": 0.0})
        b["amount"] += r["price_final"]
        b["count"] += 1
    for b in buckets.values():
        b["amount"] = round(b["amount"], 2)
        b["fees"] = round(b["amount"] * rate, 2)
    rows = sorted(buckets.values(), key=lambda x: x["key"], reverse=True)
    total_amount = round(sum(b["amount"] for b in rows), 2)
    total_fees = round(sum(b["fees"] for b in rows), 2)
    total_count = sum(b["count"] for b in rows)
    return {"period": period, "rate": rate, "rows": rows, "total_amount": total_amount, "total_fees": total_fees, "total_count": total_count}


@api.post("/accounting/reset-multi")
async def accounting_reset_multi(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    months = payload.get("months", [])
    total_deleted = 0
    for yyyymm in months:
        start, end = month_range(yyyymm)
        rdvs = await db.appointments.find({}, {"_id": 0}).to_list(20000)
        to_delete = []
        for r in rdvs:
            fin = r.get("finished_at") or r.get("date")
            try:
                dt = datetime.fromisoformat(fin.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except Exception:
                continue
            if start <= dt < end:
                to_delete.append(r["id"])
        if to_delete:
            await db.appointments.delete_many({"id": {"$in": to_delete}})
            total_deleted += len(to_delete)
        await db.urssaf_status.delete_one({"month": yyyymm})
    return {"deleted": total_deleted, "months": months}


@api.post("/accounting/reset/{yyyymm}")
async def accounting_reset(yyyymm: str, user: User = Depends(get_current_user)):
    start, end = month_range(yyyymm)
    rdvs = await db.appointments.find({}, {"_id": 0}).to_list(20000)
    to_delete = []
    for r in rdvs:
        fin = r.get("finished_at") or r.get("date")
        try:
            dt = datetime.fromisoformat(fin.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if start <= dt < end:
            to_delete.append(r["id"])
    if to_delete:
        await db.appointments.delete_many({"id": {"$in": to_delete}})
    await db.urssaf_status.delete_one({"month": yyyymm})
    return {"deleted": len(to_delete)}


# ============================================================
# DASHBOARD
# ============================================================
@api.get("/dashboard")
async def dashboard(user: User = Depends(get_current_user)):
    settings = await get_settings()
    now = datetime.now(timezone.utc)
    yyyymm = f"{now.year:04d}-{now.month:02d}"
    month_data = await accounting_month(yyyymm, user)
    # Upcoming RDVs today & tomorrow
    all_rdv = await db.appointments.find({}, {"_id": 0}).to_list(5000)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    tomorrow_start = today_start + timedelta(days=1)
    day_after = today_start + timedelta(days=2)
    upcoming_today = []
    upcoming_tomorrow = []
    all_upcoming = []
    upcoming_amount = 0.0
    for r in all_rdv:
        try:
            dt = datetime.fromisoformat(r["date"].replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if r["status"] == "scheduled":
            if dt >= now:
                all_upcoming.append(r)
                upcoming_amount += r.get("price_final", 0)
            if today_start <= dt < tomorrow_start:
                upcoming_today.append(r)
            elif tomorrow_start <= dt < day_after:
                upcoming_tomorrow.append(r)
    # Birthdays in next 7 days
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
    # Unseen >30 days
    unseen = []
    for c in clients:
        ls = c.get("last_seen")
        if not ls:
            continue
        try:
            dt = datetime.fromisoformat(ls.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            days = (now - dt).days
            if days > 30:
                unseen.append({**c, "days_since": days})
        except Exception:
            continue
    # Average basket
    done = [r for r in all_rdv if r["status"] == "done"]
    avg_day = avg_month = avg_year = 0
    if done:
        sums = {"d": {}, "m": {}, "y": {}}
        for r in done:
            try:
                dt = datetime.fromisoformat((r.get("finished_at") or r["date"]).replace("Z", "+00:00"))
            except Exception:
                continue
            dk = dt.strftime("%Y-%m-%d")
            mk = dt.strftime("%Y-%m")
            yk = dt.strftime("%Y")
            for scope, k in [("d", dk), ("m", mk), ("y", yk)]:
                sums[scope].setdefault(k, [0, 0])
                sums[scope][k][0] += r["price_final"]
                sums[scope][k][1] += 1
        def avg(bucket):
            if not bucket:
                return 0
            vals = [v[0] / v[1] for v in bucket.values() if v[1] > 0]
            return round(sum(vals) / len(vals), 2) if vals else 0
        avg_day = avg(sums["d"])
        avg_month = avg(sums["m"])
        avg_year = avg(sums["y"])
    # Stock alerts
    stocks = await db.stock.find({}, {"_id": 0}).to_list(1000)
    low_stock = [s for s in stocks if s["quantity"] <= s["threshold"]]
    # Gifts today
    today_gifts = {"count": 0, "value": 0.0}
    month_gifts = {"count": month_data["n_gifts"], "value": month_data["value_gifts"]}
    for r in done:
        try:
            dt = datetime.fromisoformat((r.get("finished_at") or r["date"]).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
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
        "avg_basket": {"day": avg_day, "month": avg_month, "year": avg_year},
        "stock_items": stocks,
        "low_stock": low_stock,
        "gifts_today": today_gifts,
        "gifts_month": month_gifts,
    }


# ============================================================
# APP SETUP
# ============================================================
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    await ensure_default_services()
    await get_settings()


@app.on_event("shutdown")
async def shutdown_db():
    client.close()
