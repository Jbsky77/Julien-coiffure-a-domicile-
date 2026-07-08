"""Retest iteration 8 — address_parts reload contract + prospection clamp 50km."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://julien-bouche-design.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"
SOPHIE = "cli_e998044705"


@pytest.fixture(scope="module")
def hdrs():
    r = requests.post(f"{API}/pin/unlock", json={"pin": os.environ.get("TEST_PIN", "123456"), "ttl_seconds": 3600})
    assert r.status_code == 200, r.text
    return {"X-Pin-Token": r.json()["token"], "Content-Type": "application/json"}


# ---- 1) Sophie fiche : GET returns address_parts populated (needed by front reload) ----

class TestSophieAddressParts:
    def test_sophie_get_has_address_and_parts(self, hdrs):
        r = requests.get(f"{API}/clients/{SOPHIE}", headers=hdrs)
        assert r.status_code == 200, r.text
        c = r.json()["client"]
        # Address must be present so frontend pre-fills the "Adresse actuelle" line
        assert c.get("address"), f"Sophie has no address string, got {c.get('address')!r}"
        parts = c.get("address_parts")
        assert isinstance(parts, dict), f"address_parts missing/invalid: {parts!r}"
        # Not all four MUST be non-empty (depends on seed), but at minimum city or postcode present.
        assert parts.get("city") or parts.get("postcode"), f"parts empty: {parts!r}"

    def test_put_new_address_then_get_reloads_parts(self, hdrs):
        """Simulate the bug scenario: save a new BAN suggestion → GET must still expose address_parts."""
        # Snapshot current state
        r0 = requests.get(f"{API}/clients/{SOPHIE}", headers=hdrs).json()["client"]
        original = {
            "address": r0.get("address"),
            "address_parts": r0.get("address_parts") or {"number": "", "street": "", "postcode": "", "city": ""},
            "lat": r0.get("lat"),
            "lng": r0.get("lng"),
        }
        try:
            new_parts = {"number": "5", "street": "Boulevard Foch", "postcode": "49100", "city": "Angers"}
            payload = {
                "address": "5 Boulevard Foch, 49100 Angers, France",
                "address_parts": new_parts,
                "lat": 47.4720,
                "lng": -0.5540,
            }
            r1 = requests.put(f"{API}/clients/{SOPHIE}", json=payload, headers=hdrs)
            assert r1.status_code == 200, r1.text
            body = r1.json()
            assert body["address"].startswith("5 Boulevard Foch")
            assert body["address_parts"]["street"] == "Boulevard Foch"
            assert body["lat"] == 47.4720 and body["lng"] == -0.5540

            # GET reload → address_parts must be intact (frontend uses this to setEditing)
            r2 = requests.get(f"{API}/clients/{SOPHIE}", headers=hdrs).json()["client"]
            assert r2["address"].startswith("5 Boulevard Foch")
            assert r2["address_parts"] == new_parts, r2["address_parts"]
            assert r2["lat"] == 47.4720 and r2["lng"] == -0.5540
        finally:
            # Restore
            requests.put(f"{API}/clients/{SOPHIE}", json=original, headers=hdrs)
            r_check = requests.get(f"{API}/clients/{SOPHIE}", headers=hdrs).json()["client"]
            assert r_check["address"] == original["address"]

    def test_other_fields_persist_alongside_address(self, hdrs):
        """Regression: saving with phone/deposit + address doesn't wipe address_parts."""
        r0 = requests.get(f"{API}/clients/{SOPHIE}", headers=hdrs).json()["client"]
        snap = {k: r0.get(k) for k in ("phone", "deposit_required", "deposit_note", "address", "address_parts", "lat", "lng")}
        try:
            payload = {
                **snap,
                "phone": "0612345678",
                "deposit_required": True,
                "deposit_note": "10€ demandés",
            }
            r1 = requests.put(f"{API}/clients/{SOPHIE}", json=payload, headers=hdrs)
            assert r1.status_code == 200
            r2 = requests.get(f"{API}/clients/{SOPHIE}", headers=hdrs).json()["client"]
            assert r2["phone"] == "0612345678"
            assert r2["deposit_required"] is True
            assert r2["address_parts"] == snap["address_parts"]
        finally:
            requests.put(f"{API}/clients/{SOPHIE}", json=snap, headers=hdrs)


# ---- 2) Prospection radius clamp 50 km ----

class TestProspectionRadius:
    def test_radius_50_accepted(self, hdrs):
        payload = {"lat": 47.47, "lng": -0.55, "radius_km": 50}
        r = requests.post(f"{API}/prospection/analyze", json=payload, headers=hdrs, timeout=30)
        # geo.api.gouv.fr external → tolerate 503, but must NOT be 400
        assert r.status_code in (200, 503), r.text
        if r.status_code == 200:
            data = r.json()
            # zone center returned; population_estimate non-null
            assert "population_estimate" in data
            assert "suggestions" in data
            assert data.get("clients_in_zone") is not None

    def test_radius_60_clamped_to_50(self, hdrs):
        # If the endpoint clamps to 50, 60 should be accepted (200) same as 50.
        payload = {"lat": 47.47, "lng": -0.55, "radius_km": 60}
        r = requests.post(f"{API}/prospection/analyze", json=payload, headers=hdrs, timeout=30)
        assert r.status_code in (200, 503), r.text  # must not be 400 => not rejected

    def test_radius_zero_rejected_or_clamped(self, hdrs):
        payload = {"lat": 47.47, "lng": -0.55, "radius_km": 0}
        r = requests.post(f"{API}/prospection/analyze", json=payload, headers=hdrs, timeout=30)
        # 0 is < min(0.5) so clamped to 0.5 → 200 or 503
        assert r.status_code in (200, 503), r.text
