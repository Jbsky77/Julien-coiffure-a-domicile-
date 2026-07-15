"""Public booking API for company websites, scoped by a trusted company slug."""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request

from app.db import db
from app.services import notifications
from app.services.geocoding import resolve
from app.services.routing import compute_supplement, route
from app.services.settings import get_settings
from app.utils.phone import normalize_french_phone

router = APIRouter()
PARIS = ZoneInfo("Europe/Paris")


def _profile_category(profile: str) -> str:
    return {"homme": "HOMME", "femme": "FEMME", "enfant": "ENFANT"}.get((profile or "").lower(), "")


def _family(service: dict) -> bool:
    return "famille" in (service.get("name") or "").lower() or (service.get("category") or "").upper() == "FAMILLE"


def _address(payload: dict) -> str:
    return ", ".join(
        str(value).strip()
        for value in [
            payload.get("street"),
            payload.get("addressComplement"),
            payload.get("postalCode"),
            payload.get("city"),
            payload.get("country") or "France",
        ]
        if value and str(value).strip()
    )


async def _selected_services(profile: str, service_ids: list[str]) -> list[dict]:
    category = _profile_category(profile)
    services = await db.services.find({"id": {"$in": service_ids}}, {"_id": 0}).to_list(100)
    invalid = [service for service in services if not (_family(service) or (service.get("category") or "").upper() == category)]
    if invalid or len(services) != len(set(service_ids)):
        raise HTTPException(400, "Une prestation ne correspond pas au profil ou au site demandé")
    return services


@router.get("/public/sites/{site_slug}/services")
async def public_site_services(site_slug: str, profile: str):
    category = _profile_category(profile)
    if not category:
        raise HTTPException(400, "Profil invalide")
    services = await db.services.find({}, {"_id": 0}).to_list(500)
    visible = [service for service in services if _family(service) or (service.get("category") or "").upper() == category]
    return {"services": [{
        "id": service["id"],
        "name": service["name"],
        "description": service.get("description") or "",
        "price": service.get("price", 0),
        "durationMinutes": service.get("duration_minutes", 45),
        "category": service.get("category"),
    } for service in visible]}


@router.post("/public/sites/{site_slug}/distance-estimate")
async def public_distance_estimate(site_slug: str, payload: dict[str, Any]):
    services = await _selected_services(payload.get("profile", ""), payload.get("serviceIds") or [])
    address = _address(payload.get("address") or {})
    if not address:
        raise HTTPException(400, "Adresse requise")
    geocoded = await resolve(address)
    if geocoded.get("lat") is None or geocoded.get("lng") is None:
        return {"addressValidated": False, "serviceAreaAccepted": False, "message": "Adresse introuvable."}

    settings = await get_settings()
    business = getattr(settings, "business_address", None)
    if not business or business.lat is None or business.lng is None:
        raise HTTPException(503, "Adresse professionnelle non configurée")
    routed = await route((business.lat, business.lng), (geocoded["lat"], geocoded["lng"]))
    if routed.get("km") is None:
        raise HTTPException(503, "Calcul du trajet indisponible")

    distance = round(routed["km"], 2)
    travel_fee = round(compute_supplement(distance, settings.fuel_supplement_tier_km, settings.fuel_supplement_per_tier), 2)
    services_total = round(sum(float(service.get("price", 0)) for service in services), 2)
    duration = sum(int(service.get("duration_minutes", 45)) for service in services)
    return {
        "addressValidated": True,
        "normalizedAddress": address,
        "distanceKm": distance,
        "travelFee": travel_fee,
        "servicesTotal": services_total,
        "estimatedTotal": round(services_total + travel_fee, 2),
        "estimatedDurationMinutes": duration,
        "serviceAreaAccepted": True,
        "message": f"Estimation calculée depuis l’adresse professionnelle de {settings.brand_name}.",
    }


@router.post("/public/sites/{site_slug}/booking-requests")
async def public_create_booking_request(site_slug: str, payload: dict[str, Any], request: Request):
    if payload.get("hp"):
        return {"success": True, "status": "received", "message": "Demande reçue."}

    customer = payload.get("customer") or {}
    phone = normalize_french_phone(customer.get("phone"))
    if not phone:
        raise HTTPException(400, "Téléphone invalide")
    first_name = (customer.get("firstName") or "").strip()
    last_name = (customer.get("lastName") or "").strip()
    if not first_name or not last_name:
        raise HTTPException(400, "Nom et prénom requis")

    services = await _selected_services(payload.get("profile", ""), payload.get("serviceIds") or [])
    preferences = payload.get("preferences") or []
    if not preferences or not preferences[0].get("date") or not preferences[0].get("time"):
        raise HTTPException(400, "Un créneau est requis")
    try:
        local_dt = datetime.fromisoformat(f"{preferences[0]['date']}T{preferences[0]['time']}").replace(tzinfo=PARIS)
    except ValueError as exc:
        raise HTTPException(400, "Créneau invalide") from exc

    clients = await db.clients.find({}, {"_id": 0}).to_list(50000)
    client = next((item for item in clients if normalize_french_phone(item.get("phone")) == phone), None)
    customer_created = False
    address_payload = payload.get("address") or {}
    address = _address(address_payload)
    geocoded = await resolve(address) if address else {"lat": None, "lng": None}
    if client is None:
        client = {
            "id": f"cli_{uuid.uuid4().hex[:10]}",
            "first_name": first_name,
            "last_name": last_name,
            "phone": phone,
            "email": (customer.get("email") or "").strip(),
            "gender": {"homme": "H", "femme": "F"}.get((payload.get("profile") or "").lower()),
            "access_token": secrets.token_urlsafe(24),
            "address": address,
            "lat": geocoded.get("lat"),
            "lng": geocoded.get("lng"),
            "created_at": datetime.now(PARIS).isoformat(),
        }
        await db.clients.insert_one(client)
        await db.sync_public_client_token(client)
        customer_created = True

    request_id = f"req_{uuid.uuid4().hex[:10]}"
    tracking_token = secrets.token_urlsafe(24)
    public_reference = f"GCH-{datetime.now(PARIS):%Y%m%d}-{request_id[-6:].upper()}"
    document = {
        "id": request_id,
        "client_id": client["id"],
        "client_name": f"{first_name} {last_name}".strip(),
        "requested_date": local_dt.isoformat(),
        "preferences": preferences[:3],
        "services": [{"service_id": service["id"], "name": service["name"], "price": service.get("price", 0)} for service in services],
        "comment": (payload.get("customerMessage") or "")[:500],
        "address": address,
        "address_details": address_payload,
        "status": "pending",
        "source": "gourdon-coiffure-home",
        "public_reference": public_reference,
        "public_tracking_token": tracking_token,
        "created_at": datetime.now(PARIS).isoformat(),
        "updated_at": datetime.now(PARIS).isoformat(),
    }
    await db.appointment_requests.insert_one(document)
    await notifications.push("admin", f"Nouvelle demande du site — {document['client_name']}", meta={"request_id": request_id, "source": document["source"]})
    return {
        "success": True,
        "publicReference": public_reference,
        "trackingToken": tracking_token,
        "status": "received",
        "customerMatched": not customer_created,
        "customerCreated": customer_created,
        "message": "Votre demande a bien été transmise à l’entreprise.",
    }


@router.get("/public/sites/{site_slug}/booking-requests/status")
async def public_booking_status(site_slug: str, token: str):
    booking = await db.appointment_requests.find_one({"public_tracking_token": token}, {"_id": 0})
    if not booking:
        raise HTTPException(404, "Demande introuvable")
    status_map = {
        "pending": "received",
        "counter_proposed": "alternative_proposed",
        "accepted": "confirmed",
        "rejected": "refused",
        "cancelled": "cancelled",
    }
    return {
        "status": status_map.get(booking.get("status"), "in_review"),
        "publicReference": booking.get("public_reference"),
        "message": booking.get("admin_note") or "",
        "alternative": {
            "date": (booking.get("counter_proposed_date") or "")[:10],
            "time": (booking.get("counter_proposed_date") or "")[11:16],
            "services": booking.get("services") or [],
        } if booking.get("status") == "counter_proposed" else None,
    }


@router.post("/public/sites/{site_slug}/booking-requests/alternative-response")
async def public_alternative_response(site_slug: str, payload: dict[str, Any]):
    booking = await db.appointment_requests.find_one({"public_tracking_token": payload.get("token")}, {"_id": 0})
    if not booking or booking.get("status") != "counter_proposed":
        raise HTTPException(404, "Proposition introuvable")
    response = payload.get("response")
    if response == "accepted":
        await db.appointment_requests.update_one({"id": booking["id"]}, {"$set": {"status": "accepted", "updated_at": datetime.now(PARIS).isoformat()}})
        return {"success": True, "status": "confirmed", "message": "Créneau accepté."}
    if response == "refused":
        await db.appointment_requests.update_one({"id": booking["id"]}, {"$set": {"status": "pending", "counter_proposed_date": None, "updated_at": datetime.now(PARIS).isoformat()}})
        return {"success": True, "status": "received", "message": "Créneau refusé. L’entreprise vous recontactera."}
    raise HTTPException(400, "Réponse invalide")
