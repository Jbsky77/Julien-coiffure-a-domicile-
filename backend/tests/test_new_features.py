"""
Backend tests for the 3 new features:
 - Backup/Export (GET /api/backup/export)
 - Next visit recommendation (admin + public)
 - Prospection zone analysis (POST /api/prospection/analyze)
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://julien-bouche-design.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MAGIC_TOKEN = "_V-HRjKzLbQYJU0pPRHlad_44GARhDU0"
SOPHIE_ID = "cli_e998044705"
LOW_RDV_CLIENT = "cli_98f120d9ce"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    status = s.get(f"{API}/pin/status", timeout=10).json()
    if status.get("configured"):
        r = s.post(f"{API}/pin/unlock", json={"pin": os.environ.get("TEST_PIN", "123456"), "ttl_seconds": 3600}, timeout=10)
        assert r.status_code == 200, r.text
        s.headers.update({"X-Pin-Token": r.json()["token"]})
    return s


# ---------- Backup ----------
class TestBackup:
    def test_backup_export_full(self, api_client):
        r = api_client.get(f"{API}/backup/export", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "exported_at" in data
        assert "counts" in data
        assert "data" in data
        expected_cols = ["settings", "services", "clients", "appointments",
                         "appointment_requests", "stock", "notifications",
                         "relances", "client_photos", "urssaf_status"]
        for col in expected_cols:
            assert col in data["data"], f"missing collection {col} in data"
            assert col in data["counts"], f"missing count for {col}"

    def test_backup_export_requires_pin(self):
        r = requests.get(f"{API}/backup/export", timeout=15)
        assert r.status_code in (401, 403), r.status_code


# ---------- Next Visit ----------
class TestNextVisit:
    def test_client_admin_next_visit(self, api_client):
        r = api_client.get(f"{API}/clients/{SOPHIE_ID}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        nv = d.get("next_visit")
        assert nv is not None, "Expected next_visit on Sophie"
        assert nv["avg_frequency_days"] == 35, nv
        assert "next_recommended_date" in nv
        assert "days_until" in nv
        assert "usual_service_ids" in nv and isinstance(nv["usual_service_ids"], list)
        assert "usual_service_names" in nv and isinstance(nv["usual_service_names"], list)

    def test_public_client_next_visit(self):
        r = requests.get(f"{API}/public/client/{MAGIC_TOKEN}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        nv = d.get("next_visit")
        assert nv is not None
        assert nv["avg_frequency_days"] == 35

    def test_next_visit_null_for_low_rdv_client(self, api_client):
        r = api_client.get(f"{API}/clients/{LOW_RDV_CLIENT}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("next_visit") is None, f"expected null next_visit, got {d.get('next_visit')}"


# ---------- Prospection ----------
class TestProspection:
    def test_prospection_analyze(self, api_client):
        payload = {"lat": 47.4784, "lng": -0.5632, "radius_km": 8}
        r = api_client.post(f"{API}/prospection/analyze", json=payload, timeout=25)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["center"]["commune"] == "Angers", d["center"]
        assert d["clients_in_zone"] >= 1, d  # depends on live client data
        assert d["population_estimate"] > 200000, d["population_estimate"]
        assert "penetration_per_1000" in d
        suggestions = d.get("suggestions", [])
        assert len(suggestions) == 3, suggestions
        for s in suggestions:
            for k in ["nom", "population", "clients", "distance_km", "lat", "lng"]:
                assert k in s, f"suggestion missing {k}: {s}"

    def test_prospection_validation_missing_lat(self, api_client):
        r = api_client.post(f"{API}/prospection/analyze",
                            json={"lng": -0.5632, "radius_km": 8}, timeout=10)
        assert r.status_code == 400, r.status_code
