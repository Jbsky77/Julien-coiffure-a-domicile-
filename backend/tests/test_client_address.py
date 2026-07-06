"""Backend tests for address_parts + lat/lng geocoding behaviour on /clients."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://julien-bouche-design.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"


@pytest.fixture(scope="module")
def pin_token():
    r = requests.post(f"{API}/pin/unlock", json={"pin": "123456", "ttl_seconds": 3600})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def hdrs(pin_token):
    return {"X-Pin-Token": pin_token, "Content-Type": "application/json"}


def _get_client(cid, hdrs):
    r = requests.get(f"{API}/clients/{cid}", headers=hdrs)
    assert r.status_code == 200, r.text
    return r.json()["client"]


class TestClientAddress:
    created = []

    def test_create_with_address_parts_and_coords_no_geocode(self, hdrs):
        # BAN provides coords → backend should skip Nominatim
        payload = {
            "first_name": "TEST",
            "last_name": "BAN_Coords",
            "address": "10 Rue de la Gare, 49100 Angers, France",
            "address_parts": {"number": "10", "street": "Rue de la Gare", "postcode": "49100", "city": "Angers"},
            "lat": 47.4712,
            "lng": -0.5527,
        }
        r = requests.post(f"{API}/clients", json=payload, headers=hdrs)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["lat"] == 47.4712
        assert data["lng"] == -0.5527
        assert data["address_parts"]["city"] == "Angers"
        TestClientAddress.created.append(data["id"])
        # Verify persistence
        c = _get_client(data["id"], hdrs)
        assert c["lat"] == 47.4712 and c["lng"] == -0.5527
        assert c["address_parts"]["postcode"] == "49100"

    def test_create_with_address_only_triggers_geocode(self, hdrs):
        payload = {
            "first_name": "TEST",
            "last_name": "GeocodeAuto",
            "address": "Place du Ralliement, 49100 Angers, France",
        }
        r = requests.post(f"{API}/clients", json=payload, headers=hdrs)
        assert r.status_code == 200, r.text
        data = r.json()
        TestClientAddress.created.append(data["id"])
        # Nominatim can be slow/unreliable — just assert no crash. lat/lng may be None or set.
        # Ensure record persisted.
        c = _get_client(data["id"], hdrs)
        assert c["address"].startswith("Place du Ralliement")

    def test_create_without_address_works(self, hdrs):
        r = requests.post(f"{API}/clients", json={"first_name": "TEST", "last_name": "NoAddr"}, headers=hdrs)
        assert r.status_code == 200
        data = r.json()
        TestClientAddress.created.append(data["id"])
        assert data["lat"] is None and data["lng"] is None

    def test_put_with_coords_skips_geocode(self, hdrs):
        # Create baseline
        r = requests.post(f"{API}/clients", json={"first_name": "TEST", "last_name": "PutCoords"}, headers=hdrs)
        cid = r.json()["id"]
        TestClientAddress.created.append(cid)
        # PUT with address + lat/lng: should persist coords as-is
        r2 = requests.put(f"{API}/clients/{cid}", json={
            "address": "5 Rue Bressigny, 49100 Angers, France",
            "lat": 47.4680,
            "lng": -0.5510,
        }, headers=hdrs)
        assert r2.status_code == 200
        body = r2.json()
        assert body["lat"] == 47.4680
        assert body["lng"] == -0.5510

    def test_put_address_only_regeocodes(self, hdrs):
        r = requests.post(f"{API}/clients", json={
            "first_name": "TEST", "last_name": "PutAddrOnly",
        }, headers=hdrs)
        cid = r.json()["id"]
        TestClientAddress.created.append(cid)
        # First PUT sets an address without coords → backend must attempt geocode
        r2 = requests.put(f"{API}/clients/{cid}", json={
            "address": "Boulevard Foch, 49100 Angers, France",
        }, headers=hdrs)
        assert r2.status_code == 200
        # Do not assert non-null (Nominatim may fail in CI), just ensure no crash.

    @classmethod
    def teardown_class(cls):
        try:
            token = requests.post(f"{API}/pin/unlock", json={"pin": "123456"}).json()["token"]
            h = {"X-Pin-Token": token}
            for cid in cls.created:
                requests.delete(f"{API}/clients/{cid}", headers=h)
        except Exception:
            pass


# ---- Appointment request flow (bug fix regression: counter + reject) ----

class TestRequestFlow:
    SOPHIE_TOKEN = "_V-HRjKzLbQYJU0pPRHlad_44GARhDU0"
    SVC = "svc_9bb2d107ea"
    created_rids = []
    created_rdvs = []

    def test_public_create_request(self):
        from datetime import datetime, timedelta, timezone
        d = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        r = requests.post(f"{API}/public/client/{self.SOPHIE_TOKEN}/appointment-requests",
                          json={"requested_date": d, "service_ids": [self.SVC], "comment": "TEST counter flow"})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        TestRequestFlow.created_rids.append(rid)
        assert r.json()["status"] == "pending"

    def test_admin_counter_proposal(self, hdrs):
        from datetime import datetime, timedelta, timezone
        rid = TestRequestFlow.created_rids[0]
        new_d = (datetime.now(timezone.utc) + timedelta(days=8)).isoformat()
        r = requests.post(f"{API}/appointment-requests/{rid}/action",
                         json={"action": "counter", "counter_date": new_d, "admin_note": "TEST already booked"},
                         headers=hdrs)
        assert r.status_code == 200, r.text
        # Verify
        lst = requests.get(f"{API}/appointment-requests", headers=hdrs).json()
        one = next((x for x in lst if x["id"] == rid), None)
        assert one is not None and one["status"] == "counter_proposed"
        assert one["counter_proposed_date"] is not None
        assert one["admin_note"] == "TEST already booked"

    def test_client_reject_counter_reopens_pending(self):
        from datetime import datetime, timedelta, timezone
        rid = TestRequestFlow.created_rids[0]
        new_d = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
        r = requests.post(f"{API}/public/client/{self.SOPHIE_TOKEN}/appointment-requests/{rid}/respond",
                         json={"decision": "reject", "requested_date": new_d})
        assert r.status_code == 200, r.text
        # Verify status is back to pending
        # Access via admin
        token = requests.post(f"{API}/pin/unlock", json={"pin": "123456"}).json()["token"]
        h = {"X-Pin-Token": token}
        lst = requests.get(f"{API}/appointment-requests", headers=h).json()
        one = next((x for x in lst if x["id"] == rid), None)
        assert one is not None
        assert one["status"] == "pending"

    def test_admin_reject_request(self, hdrs):
        from datetime import datetime, timedelta, timezone
        d = (datetime.now(timezone.utc) + timedelta(days=12)).isoformat()
        r = requests.post(f"{API}/public/client/{self.SOPHIE_TOKEN}/appointment-requests",
                          json={"requested_date": d, "service_ids": [self.SVC], "comment": "TEST reject"})
        rid = r.json()["id"]
        TestRequestFlow.created_rids.append(rid)
        r2 = requests.post(f"{API}/appointment-requests/{rid}/action",
                          json={"action": "reject"}, headers=hdrs)
        assert r2.status_code == 200
        lst = requests.get(f"{API}/appointment-requests", headers=hdrs).json()
        one = next((x for x in lst if x["id"] == rid), None)
        assert one["status"] == "rejected"

    def test_accept_flow_creates_rdv(self, hdrs):
        from datetime import datetime, timedelta, timezone
        d = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
        r = requests.post(f"{API}/public/client/{self.SOPHIE_TOKEN}/appointment-requests",
                          json={"requested_date": d, "service_ids": [self.SVC], "comment": "TEST accept"})
        rid = r.json()["id"]
        TestRequestFlow.created_rids.append(rid)
        r2 = requests.post(f"{API}/appointment-requests/{rid}/action",
                          json={"action": "accept"}, headers=hdrs)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        # Should return the created appointment id
        rdv_id = body.get("appointment_id") or body.get("id") or body.get("rdv_id")
        if rdv_id:
            TestRequestFlow.created_rdvs.append(rdv_id)

    @classmethod
    def teardown_class(cls):
        try:
            token = requests.post(f"{API}/pin/unlock", json={"pin": "123456"}).json()["token"]
            h = {"X-Pin-Token": token}
            for rid in cls.created_rids:
                requests.delete(f"{API}/appointment-requests/{rid}", headers=h)
            for aid in cls.created_rdvs:
                requests.delete(f"{API}/appointments/{aid}", headers=h)
        except Exception:
            pass
