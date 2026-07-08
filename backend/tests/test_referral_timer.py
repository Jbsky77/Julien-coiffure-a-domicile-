"""Backend tests for referral (parrainage) + auto timer + service_time_stats features.

Covers:
- POST /api/clients with referred_by (valid/invalid/self)
- PUT /api/clients/{cid} self-parrainage validation
- GET /api/clients returns godchildren_count
- GET /api/clients/{cid} returns referral info
- POST /api/appointments/{rid}/start-timer
- POST /api/appointments/{rid}/finish auto/manual duration, use_referral_reward
- GET /api/public/client/{token} includes referral
- GET /api/analytics has service_time_stats
- GET/PUT /api/settings referral_threshold
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
PIN = "123456"
SOPHIE_TOKEN = "_V-HRjKzLbQYJU0pPRHlad_44GARhDU0"

CREATED_CLIENTS = []
CREATED_APPTS = []


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/pin/unlock", json={"pin": PIN}, timeout=10)
    assert r.status_code == 200, f"PIN unlock failed: {r.text}"
    tok = r.json().get("token")
    assert tok
    s.headers.update({"X-Pin-Token": tok})
    yield s
    # Cleanup
    for rid in CREATED_APPTS:
        try:
            s.delete(f"{BASE_URL}/api/appointments/{rid}", timeout=10)
        except Exception:
            pass
    for cid in CREATED_CLIENTS:
        try:
            s.delete(f"{BASE_URL}/api/clients/{cid}", timeout=10)
        except Exception:
            pass


def _mk_client(api, first="TestParrain", last=None, referred_by=None):
    last = last or f"T{uuid.uuid4().hex[:6]}"
    payload = {"first_name": first, "last_name": last, "phone": "0600000000"}
    if referred_by is not None:
        payload["referred_by"] = referred_by
    r = api.post(f"{BASE_URL}/api/clients", json=payload, timeout=10)
    return r


def _mk_appointment(api, client_id, services_ids, km=0):
    payload = {
        "client_id": client_id,
        "date": "2026-06-01T10:00:00+00:00",
        "services": [{"service_id": sid, "is_gift": False} for sid in services_ids],
        "kilometrage": km,
        "notes": "TEST",
    }
    return api.post(f"{BASE_URL}/api/appointments", json=payload, timeout=10)


# --------- Settings ---------

def test_settings_has_referral_threshold(api):
    r = api.get(f"{BASE_URL}/api/settings", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "referral_threshold" in data
    assert int(data["referral_threshold"]) == 4


def test_settings_put_referral_threshold(api):
    # set to 5 then restore to 4
    r = api.put(f"{BASE_URL}/api/settings", json={"referral_threshold": 5}, timeout=10)
    assert r.status_code == 200
    assert int(r.json()["referral_threshold"]) == 5
    r2 = api.put(f"{BASE_URL}/api/settings", json={"referral_threshold": 4}, timeout=10)
    assert r2.status_code == 200
    assert int(r2.json()["referral_threshold"]) == 4


# --------- Clients + referral validation ---------

def test_create_client_with_valid_referred_by(api):
    # Create sponsor
    r_sponsor = _mk_client(api, first="TestSponsor")
    assert r_sponsor.status_code == 200, r_sponsor.text
    sponsor = r_sponsor.json()
    CREATED_CLIENTS.append(sponsor["id"])

    # Create child referencing sponsor
    r_child = _mk_client(api, first="TestChild", referred_by=sponsor["id"])
    assert r_child.status_code == 200, r_child.text
    child = r_child.json()
    CREATED_CLIENTS.append(child["id"])
    assert child["referred_by"] == sponsor["id"]


def test_create_client_with_invalid_referred_by(api):
    r = _mk_client(api, first="TestBadRef", referred_by="nonexistent_xyz")
    assert r.status_code == 400


def test_update_client_self_referral_forbidden(api):
    r_c = _mk_client(api, first="TestSelf")
    assert r_c.status_code == 200
    cid = r_c.json()["id"]
    CREATED_CLIENTS.append(cid)
    r = api.put(f"{BASE_URL}/api/clients/{cid}", json={"referred_by": cid}, timeout=10)
    assert r.status_code == 400


def test_list_clients_returns_godchildren_count(api):
    # sponsor + 2 kids
    r_sp = _mk_client(api, first="TestSponsorList")
    sp_id = r_sp.json()["id"]; CREATED_CLIENTS.append(sp_id)
    for i in range(2):
        rc = _mk_client(api, first=f"TestKid{i}", referred_by=sp_id)
        assert rc.status_code == 200
        CREATED_CLIENTS.append(rc.json()["id"])
    r = api.get(f"{BASE_URL}/api/clients", timeout=10)
    assert r.status_code == 200
    rows = r.json()
    sp = next((x for x in rows if x["id"] == sp_id), None)
    assert sp is not None
    assert sp.get("godchildren_count") == 2


def test_client_detail_referral_info(api):
    # 5 kids for one sponsor → earned=1 (threshold 4), available=1, remaining=3
    r_sp = _mk_client(api, first="TestSponsorFull")
    sp_id = r_sp.json()["id"]; CREATED_CLIENTS.append(sp_id)
    for i in range(5):
        rc = _mk_client(api, first=f"TestG{i}", referred_by=sp_id)
        assert rc.status_code == 200
        CREATED_CLIENTS.append(rc.json()["id"])
    r = api.get(f"{BASE_URL}/api/clients/{sp_id}", timeout=10)
    assert r.status_code == 200
    ref = r.json().get("referral")
    assert ref is not None
    assert ref["godchildren_count"] == 5
    assert ref["rewards_earned"] == 1
    assert ref["rewards_available"] == 1
    assert ref["rewards_used"] == 0
    assert ref["remaining_to_next"] == 3
    assert len(ref["godchildren"]) == 5


# --------- Timer ---------

def _get_services(api):
    r = api.get(f"{BASE_URL}/api/services", timeout=10)
    assert r.status_code == 200
    return r.json()


def test_start_timer_and_auto_duration(api):
    services = _get_services(api)
    assert len(services) > 0
    sid = services[0]["id"]

    r_c = _mk_client(api, first="TestTimer")
    cid = r_c.json()["id"]; CREATED_CLIENTS.append(cid)

    r_a = _mk_appointment(api, cid, [sid])
    assert r_a.status_code == 200, r_a.text
    rid = r_a.json()["id"]; CREATED_APPTS.append(rid)

    r = api.post(f"{BASE_URL}/api/appointments/{rid}/start-timer", timeout=10)
    assert r.status_code == 200
    assert r.json().get("started_at")

    # Wait so auto duration is at least 1 minute (capped at max(1,...))
    time.sleep(3)

    r_f = api.post(
        f"{BASE_URL}/api/appointments/{rid}/finish",
        json={"payment_mode": "cb"},
        timeout=10,
    )
    assert r_f.status_code == 200, r_f.text
    data = r_f.json()
    assert data["status"] == "done"
    assert data.get("duration_minutes") is not None
    assert 1 <= data["duration_minutes"] <= 240


def test_start_timer_on_done_rdv_400(api):
    services = _get_services(api)
    sid = services[0]["id"]
    r_c = _mk_client(api, first="TestTimerDone")
    cid = r_c.json()["id"]; CREATED_CLIENTS.append(cid)
    r_a = _mk_appointment(api, cid, [sid])
    rid = r_a.json()["id"]; CREATED_APPTS.append(rid)
    r_f = api.post(f"{BASE_URL}/api/appointments/{rid}/finish", json={"payment_mode": "cb", "duration_minutes": 30}, timeout=10)
    assert r_f.status_code == 200
    r = api.post(f"{BASE_URL}/api/appointments/{rid}/start-timer", timeout=10)
    assert r.status_code == 400


def test_manual_duration_wins_over_auto(api):
    services = _get_services(api)
    sid = services[0]["id"]
    r_c = _mk_client(api, first="TestManualDur")
    cid = r_c.json()["id"]; CREATED_CLIENTS.append(cid)
    r_a = _mk_appointment(api, cid, [sid])
    rid = r_a.json()["id"]; CREATED_APPTS.append(rid)

    api.post(f"{BASE_URL}/api/appointments/{rid}/start-timer", timeout=10)
    time.sleep(2)
    r_f = api.post(
        f"{BASE_URL}/api/appointments/{rid}/finish",
        json={"payment_mode": "cb", "duration_minutes": 77},
        timeout=10,
    )
    assert r_f.status_code == 200
    assert r_f.json()["duration_minutes"] == 77


# --------- Referral reward at finish ---------

def test_use_referral_reward_at_finish(api):
    services = _get_services(api)
    # Find two different services with prices
    priced = [s for s in services if s.get("price", 0) > 0]
    assert len(priced) >= 2
    priced.sort(key=lambda s: -s["price"])
    expensive = priced[0]
    cheap = priced[1]

    # Create sponsor
    r_sp = _mk_client(api, first="TestRewardSp")
    sp_id = r_sp.json()["id"]; CREATED_CLIENTS.append(sp_id)
    # 4 kids → 1 reward available
    for i in range(4):
        rc = _mk_client(api, first=f"TestRK{i}", referred_by=sp_id)
        CREATED_CLIENTS.append(rc.json()["id"])

    # Verify reward available
    r_info = api.get(f"{BASE_URL}/api/clients/{sp_id}", timeout=10)
    assert r_info.json()["referral"]["rewards_available"] == 1

    # Create RDV for sponsor with 2 services
    r_a = _mk_appointment(api, sp_id, [expensive["id"], cheap["id"]])
    assert r_a.status_code == 200, r_a.text
    rdv = r_a.json()
    rid = rdv["id"]; CREATED_APPTS.append(rid)
    initial_final = rdv["price_final"]

    # Finish with use_referral_reward=true
    r_f = api.post(
        f"{BASE_URL}/api/appointments/{rid}/finish",
        json={"payment_mode": "cb", "duration_minutes": 45, "use_referral_reward": True},
        timeout=10,
    )
    assert r_f.status_code == 200, r_f.text
    done = r_f.json()
    assert done["status"] == "done"
    # Price reduced by expensive service price
    assert abs(done["price_final"] - (initial_final - expensive["price"])) < 0.01
    # Expensive service is now a referral gift
    expensive_srv = next(s for s in done["services"] if s["service_id"] == expensive["id"])
    assert expensive_srv["is_gift"] is True
    assert expensive_srv.get("gift_source") == "referral"

    # Verify client history updated
    r_info2 = api.get(f"{BASE_URL}/api/clients/{sp_id}", timeout=10)
    ref2 = r_info2.json()["referral"]
    assert ref2["rewards_used"] == 1
    assert ref2["rewards_available"] == 0
    hist = ref2["rewards_used_history"]
    assert len(hist) == 1
    assert hist[0]["appointment_id"] == rid
    assert hist[0]["service_name"] == expensive["name"]

    # Verify loyalty_counters: not incremented for the referral-gifted service, incremented for the paid one
    client_doc = r_info2.json()["client"]
    counters = client_doc.get("loyalty_counters") or {}
    # expensive service (referral gift) should NOT have been incremented (i.e., stays absent/0)
    assert counters.get(expensive["id"], 0) == 0
    # cheap service (paid) should be incremented to 1
    assert counters.get(cheap["id"], 0) == 1


def test_use_referral_reward_without_available_400(api):
    services = _get_services(api)
    sid = services[0]["id"]
    r_c = _mk_client(api, first="TestNoReward")
    cid = r_c.json()["id"]; CREATED_CLIENTS.append(cid)
    r_a = _mk_appointment(api, cid, [sid])
    rid = r_a.json()["id"]; CREATED_APPTS.append(rid)
    r_f = api.post(
        f"{BASE_URL}/api/appointments/{rid}/finish",
        json={"payment_mode": "cb", "duration_minutes": 30, "use_referral_reward": True},
        timeout=10,
    )
    assert r_f.status_code == 400


# --------- Public + Analytics ---------

def test_public_client_space_has_referral():
    r = requests.get(f"{BASE_URL}/api/public/client/{SOPHIE_TOKEN}", timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "referral" in data
    ref = data["referral"]
    assert "godchildren_count" in ref
    assert "rewards_available" in ref
    assert "threshold" in ref


def test_analytics_has_service_time_stats(api):
    r = api.get(f"{BASE_URL}/api/analytics", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "service_time_stats" in data
    assert isinstance(data["service_time_stats"], list)
    if data["service_time_stats"]:
        first = data["service_time_stats"][0]
        assert "name" in first
        assert "avg_minutes" in first
        assert "count" in first
