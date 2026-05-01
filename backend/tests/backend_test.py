"""
Backend API tests for Coiffure à domicile Julien Bouche (massive update iteration).

Covers:
 - Module 1: Tour optimization (/api/tour/today)
 - Module 2: Smart Appointment slot suggestions (/api/slots/suggest)
 - Module 4: Monthly goals (/api/goals/progress), settings persistence
 - Module 5: Business insights (/api/insights)
 - Module 7: Client status CRM (/api/clients/status) -- previously shadowed route
 - Module 8: Geocode (OpenStreetMap) graceful fallback
 - Regression: /api/dashboard, /api/clients, /api/clients/{cid}, /api/appointments,
               /api/services, /api/accounting/months, /api/analytics
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://julien-bouche-design.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Seed IDs shared across tests
_created = {"client_id": None, "rdv_id": None, "svc_id": None}


# ---------------- Regression: basics ----------------
class TestBasics:
    def test_services_list(self, api_client):
        r = api_client.get(f"{API}/services", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        _created["svc_id"] = data[0]["id"]

    def test_settings_get(self, api_client):
        r = api_client.get(f"{API}/settings", timeout=20)
        assert r.status_code == 200
        s = r.json()
        for k in ["goal_ca", "goal_rdv", "goal_panier", "goal_relances", "brand_name"]:
            assert k in s

    def test_dashboard(self, api_client):
        r = api_client.get(f"{API}/dashboard", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "month_data" in d and "upcoming_today" in d

    def test_accounting_months(self, api_client):
        r = api_client.get(f"{API}/accounting/months", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_analytics(self, api_client):
        r = api_client.get(f"{API}/analytics", timeout=20)
        assert r.status_code == 200
        assert "top_services" in r.json()


# ---------------- Settings persistence ----------------
class TestSettingsPersistence:
    def test_put_settings_persists(self, api_client):
        payload = {
            "goal_ca": 3333.0,
            "goal_rdv": 66,
            "goal_panier": 55.0,
            "goal_relances": 12,
            "brand_name": "TEST_Julien_Bouche",
        }
        r = api_client.put(f"{API}/settings", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        s = r.json()
        for k, v in payload.items():
            assert s[k] == v, f"{k} not persisted"
        # GET again to verify DB persistence
        r2 = api_client.get(f"{API}/settings", timeout=20)
        s2 = r2.json()
        for k, v in payload.items():
            assert s2[k] == v


# ---------------- Seed client + RDV for downstream tests ----------------
class TestSeedData:
    def test_create_client(self, api_client):
        uniq = uuid.uuid4().hex[:6]
        payload = {
            "first_name": "TEST",
            "last_name": f"Tour_{uniq}",
            "phone": "0600000000",
            "address": "1 rue de la Paix, Paris",
            "gender": "F",
        }
        r = api_client.post(f"{API}/clients", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["id"].startswith("cli_")
        _created["client_id"] = c["id"]

    def test_create_appointment_today(self, api_client):
        assert _created["client_id"] and _created["svc_id"]
        today = datetime.now(timezone.utc).replace(hour=10, minute=0, second=0, microsecond=0)
        payload = {
            "client_id": _created["client_id"],
            "date": today.isoformat().replace("+00:00", "Z"),
            "services": [{"service_id": _created["svc_id"], "is_gift": False}],
            "kilometrage": 5.0,
            "notes": "TEST seed",
        }
        r = api_client.post(f"{API}/appointments", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        rdv = r.json()
        _created["rdv_id"] = rdv["id"]
        assert rdv["status"] == "scheduled"

    def test_get_client_detail(self, api_client):
        # Regression: /api/clients/{cid} still works after adding /status route above it
        r = api_client.get(f"{API}/clients/{_created['client_id']}", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "client" in d and "appointments" in d
        assert d["client"]["id"] == _created["client_id"]


# ---------------- Module 1: Tour ----------------
class TestTour:
    def test_tour_today_structure(self, api_client):
        r = api_client.get(f"{API}/tour/today", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["date", "stops", "total_km", "total_travel_min", "total_ca", "total_duration_min"]:
            assert k in d, f"missing key {k}"
        assert isinstance(d["stops"], list)
        # Our seeded RDV should be in today's stops
        ids = [s["id"] for s in d["stops"]]
        assert _created["rdv_id"] in ids


# ---------------- Module 2: Slot suggestions ----------------
class TestSlots:
    def test_suggest_slots_basic(self, api_client):
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        payload = {"date": date, "duration_minutes": 45, "lat": 48.8566, "lng": 2.3522}
        r = api_client.post(f"{API}/slots/suggest", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "suggestions" in d and isinstance(d["suggestions"], list)
        if d["suggestions"]:
            s0 = d["suggestions"][0]
            for k in ["datetime", "label", "score", "reasons"]:
                assert k in s0

    def test_suggest_slots_missing_date(self, api_client):
        r = api_client.post(f"{API}/slots/suggest", json={}, timeout=10)
        assert r.status_code == 400


# ---------------- Module 7: Client Status (CRITICAL route ordering) ----------------
class TestClientStatus:
    def test_clients_status_returns_array_not_404(self, api_client):
        r = api_client.get(f"{API}/clients/status", timeout=20)
        assert r.status_code == 200, f"Route shadowed? status={r.status_code} body={r.text[:200]}"
        d = r.json()
        assert isinstance(d, list), f"Expected array, got {type(d).__name__}: {str(d)[:200]}"
        # if any entries, validate shape
        allowed = {"actif", "a_relancer", "en_retard", "presque_perdu", "perdu"}
        for item in d:
            assert "id" in item and "days_since" in item and "status" in item
            assert item["status"] in allowed
            assert "avg_basket" in item and "n_rdv" in item


# ---------------- Module 5: Insights ----------------
class TestInsights:
    def test_insights(self, api_client):
        r = api_client.get(f"{API}/insights", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "insights" in d
        assert isinstance(d["insights"], list)


# ---------------- Module 4: Goals progress ----------------
class TestGoals:
    def test_goals_progress(self, api_client):
        r = api_client.get(f"{API}/goals/progress", timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["month", "ca", "rdv", "panier", "relances"]:
            assert k in d
        for k in ["ca", "rdv", "panier", "relances"]:
            sub = d[k]
            for sk in ["value", "goal", "pct"]:
                assert sk in sub


# ---------------- Relance logging ----------------
class TestRelance:
    def test_log_relance(self, api_client):
        assert _created["client_id"]
        r = api_client.post(f"{API}/clients/{_created['client_id']}/relance", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("ok") is True
        assert "date" in d


# ---------------- Geocode with graceful fallback ----------------
class TestGeocode:
    def test_geocode_empty_address(self, api_client):
        r = api_client.post(f"{API}/geocode", json={"address": ""}, timeout=15)
        assert r.status_code == 400

    def test_geocode_graceful(self, api_client):
        # even if rate-limited, must not crash (lat/lng may be null)
        r = api_client.post(f"{API}/geocode", json={"address": "10 Downing Street, London"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "lat" in d and "lng" in d

    def test_geocode_fr_addr(self, api_client):
        r = api_client.post(f"{API}/geocode", json={"address": "Tour Eiffel, Paris"}, timeout=20)
        assert r.status_code == 200


# ---------------- Cleanup ----------------
class TestZCleanup:
    def test_cleanup(self, api_client):
        if _created["rdv_id"]:
            api_client.delete(f"{API}/appointments/{_created['rdv_id']}", timeout=10)
        if _created["client_id"]:
            api_client.delete(f"{API}/clients/{_created['client_id']}", timeout=10)
        # Restore defaults for settings (best-effort)
        api_client.put(f"{API}/settings", json={
            "goal_ca": 3000.0, "goal_rdv": 60, "goal_panier": 50.0,
            "goal_relances": 10, "brand_name": "Julien Bouche"
        }, timeout=15)
