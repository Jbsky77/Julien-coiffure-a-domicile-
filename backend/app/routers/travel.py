"""Travel & Neighbor endpoints."""
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException

from app.db import db
from app.dependencies import get_current_user
from app.models.auth import User
from app.services.geocoding import resolve
from app.services.routing import compute_supplement, route
from app.services.settings import get_settings
from app.utils.dates import now_utc

router = APIRouter()


async def _biz_coords(settings) -> Optional[Tuple[float, float]]:
    ba = getattr(settings, "business_address", None)
    if ba and ba.lat is not None and ba.lng is not None:
        return (ba.lat, ba.lng)
    return None


async def _client_coords(client_id: str) -> Optional[Tuple[float, float]]:
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "lat": 1, "lng": 1})
    if not c or c.get("lat") is None or c.get("lng") is None:
        return None
    return (c["lat"], c["lng"])


@router.post("/travel/preview")
async def travel_preview(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    """Compute theoretical supplement for a client from business address.

    Body: {client_id}
    Returns: {distance_km, supplement, source, error}
    """
    client_id = payload.get("client_id")
    if not client_id:
        raise HTTPException(400, "client_id requis")
    settings = await get_settings()
    biz = await _biz_coords(settings)
    if not biz:
        return {"distance_km": None, "supplement": 0, "source": None, "error": "business_address_not_geocoded"}
    coords = await _client_coords(client_id)
    if not coords:
        return {"distance_km": None, "supplement": 0, "source": None, "error": "client_address_not_geocoded"}
    r = await route(biz, coords)
    if r["km"] is None:
        return {"distance_km": None, "supplement": 0, "source": r["source"], "error": r["error"]}
    supp = compute_supplement(
        r["km"],
        settings.fuel_supplement_tier_km,
        settings.fuel_supplement_per_tier,
    )
    return {
        "distance_km": round(r["km"], 2),
        "supplement": round(supp, 2),
        "source": r["source"],
        "error": r["error"],
    }


@router.post("/travel/neighbor-check")
async def neighbor_check(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    """Validate neighbor status between two clients.

    Body: {client_id, neighbor_of_client_id}
    Returns: {valid, distance_km, supplement, discount, message, error}
    """
    client_id = payload.get("client_id")
    neighbor_id = payload.get("neighbor_of_client_id")
    if not client_id or not neighbor_id:
        raise HTTPException(400, "client_id et neighbor_of_client_id requis")
    if client_id == neighbor_id:
        return {
            "valid": False,
            "error": "same_client",
            "message": "Le voisin doit être un autre client que celui du rendez-vous.",
        }
    a_coords = await _client_coords(client_id)
    b_coords = await _client_coords(neighbor_id)
    if not a_coords or not b_coords:
        return {
            "valid": False,
            "error": "missing_coords",
            "message": "Impossible de vérifier le voisinage. Corrigez l'adresse du client ou du voisin sélectionné.",
        }
    r = await route(a_coords, b_coords)
    if r["km"] is None:
        return {"valid": False, "error": r["error"], "message": "Calcul routier impossible."}
    settings = await get_settings()
    biz = await _biz_coords(settings)
    theoretical_supp = 0.0
    distance_from_biz = None
    if biz:
        biz_r = await route(biz, a_coords)
        if biz_r["km"] is not None:
            distance_from_biz = round(biz_r["km"], 2)
            theoretical_supp = compute_supplement(
                biz_r["km"],
                settings.fuel_supplement_tier_km,
                settings.fuel_supplement_per_tier,
            )
    km = r["km"]
    valid = km < 1.0
    if valid:
        neighbor = await db.clients.find_one({"id": neighbor_id}, {"_id": 0})
        return {
            "valid": True,
            "distance_km": round(km, 2),
            "source": r["source"],
            "distance_from_business": distance_from_biz,
            "theoretical_supplement": round(theoretical_supp, 2),
            "discount": round(theoretical_supp, 2),
            "billed_supplement": 0.0,
            "neighbor": {
                "id": neighbor_id,
                "first_name": neighbor.get("first_name", "") if neighbor else "",
                "last_name": neighbor.get("last_name", "") if neighbor else "",
                "address": neighbor.get("address", "") if neighbor else "",
                "lat": b_coords[0],
                "lng": b_coords[1],
            },
            "verified_at": now_utc().isoformat(),
            "message": f"Voisin validé — distance entre les clients : {round(km, 2):.2f} km — frais de déplacement offerts.".replace(".", ","),
        }
    return {
        "valid": False,
        "distance_km": round(km, 2),
        "source": r["source"],
        "distance_from_business": distance_from_biz,
        "theoretical_supplement": round(theoretical_supp, 2),
        "message": (
            "Statut voisin refusé : les deux adresses sont distantes de "
            + f"{km:.2f}".replace(".", ",")
            + " km. Les frais normaux de "
            + f"{theoretical_supp:.2f}".replace(".", ",")
            + " € restent applicables."
        ),
    }


@router.post("/travel/recalc-future")
async def recalc_future(user: User = Depends(get_current_user)):
    """Recompute distance & theoretical supplement for future unpaid appointments.

    Never touches:
      - RDV with status == "done" (already paid)
      - RDV in the past
    """
    from app.services.appointments import compute_appointment_totals
    from app.utils.dates import parse_iso

    settings = await get_settings()
    biz = await _biz_coords(settings)
    if not biz:
        raise HTTPException(400, "Adresse professionnelle non géocodée")
    now = now_utc()
    rdvs = await db.appointments.find(
        {"status": {"$in": ["scheduled"]}}, {"_id": 0}
    ).to_list(5000)
    updated = 0
    skipped_paid = 0
    skipped_past = 0
    for rdv in rdvs:
        if rdv.get("status") == "done":
            skipped_paid += 1
            continue
        dt = parse_iso(rdv.get("date"))
        if dt is None or dt < now:
            skipped_past += 1
            continue
        # Rebuild with fresh distance
        svcs_input = [
            {"service_id": s["service_id"], "is_gift": s.get("is_gift", False)}
            for s in (rdv.get("services") or [])
        ]
        totals = await compute_appointment_totals(
            svcs_input,
            rdv.get("kilometrage", 0),
            None,
            client_id=rdv["client_id"],
            is_neighbor=rdv.get("is_neighbor", False),
            neighbor_of_client_id=rdv.get("neighbor_of_client_id"),
        )
        await db.appointments.update_one(
            {"id": rdv["id"]},
            {"$set": {
                "distance_km_from_business": totals["distance_km"],
                "theoretical_fuel_supplement": totals["theoretical_supplement"],
                "fuel_supplement": totals["fuel_supplement"],
                "price_base": totals["price_base"],
                "price_final": totals["price_final"],
                "neighbor_discount": totals["neighbor_discount"],
            }},
        )
        updated += 1
    return {"updated": updated, "skipped_paid": skipped_paid, "skipped_past": skipped_past}


@router.post("/geocode/client")
async def geocode_client(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    """Force-geocode a client's address and persist result.

    Body: {client_id, address?}
    Returns: {ok, lat, lng, source, error, geocode_status}
    """
    client_id = payload.get("client_id")
    if not client_id:
        raise HTTPException(400, "client_id requis")
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client introuvable")
    address = payload.get("address") or client.get("address") or ""
    out = await resolve(address)
    update = {
        "lat": out["lat"],
        "lng": out["lng"],
        "geocode_status": "ok" if out["lat"] is not None else (out.get("error") or "not_found"),
        "geocoded_at": now_utc().isoformat(),
    }
    if payload.get("address"):
        update["address"] = address
    await db.clients.update_one({"id": client_id}, {"$set": update})
    return {"ok": out["lat"] is not None, **update, "source": out["source"], "error": out["error"]}


@router.post("/geocode/business")
async def geocode_business(user: User = Depends(get_current_user)):
    """Force-geocode the business address in settings and persist result."""
    settings = await get_settings()
    ba = settings.business_address
    if not ba or not ba.address:
        raise HTTPException(400, "Aucune adresse professionnelle configurée")
    out = await resolve(ba.address)
    new_ba = {
        "address": ba.address,
        "lat": out["lat"],
        "lng": out["lng"],
        "geocode_status": "ok" if out["lat"] is not None else (out.get("error") or "not_found"),
        "verified_at": now_utc().isoformat(),
    }
    await db.settings.update_one(
        {"_id": "singleton"},
        {"$set": {"business_address": new_ba}},
        upsert=True,
    )
    return {"ok": out["lat"] is not None, "business_address": new_ba, "source": out["source"], "error": out["error"]}
