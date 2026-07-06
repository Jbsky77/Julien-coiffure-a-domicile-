"""Tests for session-4 features: invoice_number, per-service stylists, invoices exposed on client space, and date round-trip stability on PUT /appointments."""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
PIN = "123456"
SOPHIE_TOKEN = "_V-HRjKzLbQYJU0pPRHlad_44GARhDU0"
SOPHIE_ID = "cli_e998044705"


@pytest.fixture(scope="module")
def h():
    tok = requests.post(f"{BASE}/pin/unlock", json={"pin": PIN, "ttl_seconds": 3600}).json()["token"]
    return {"X-Pin-Token": tok}


# --- reference invoice (rdv_037b0f8120) ---
def test_reference_invoice_persisted(h):
    r = requests.get(f"{BASE}/appointments", headers=h)
    assert r.status_code == 200
    ref = next((a for a in r.json() if a["id"] == "rdv_037b0f8120"), None)
    assert ref is not None, "reference RDV missing"
    assert ref.get("invoice_number") == "F-2026-0001"
    stylists = {s["service_id"]: s.get("stylist") for s in ref["services"]}
    assert "Marley" in stylists.values()
    assert "Julien" in stylists.values()


# --- Public client space exposes invoices ---
def test_client_space_invoices():
    r = requests.get(f"{BASE}/public/client/{SOPHIE_TOKEN}")
    assert r.status_code == 200
    data = r.json()
    assert "invoices" in data
    invs = data["invoices"]
    assert len(invs) >= 1
    # rdv_037b0f8120 must be there with F-2026-0001
    ref = next((i for i in invs if i.get("invoice_number") == "F-2026-0001"), None)
    assert ref is not None
    assert ref.get("payment_mode")
    svcs = ref.get("services") or []
    assert svcs, "invoice must expose services"
    for s in svcs:
        assert "name" in s and "price" in s and "is_gift" in s
        assert s.get("stylist") in ("Julien", "Marley")


# --- finish() flow: stylists + invoice_number generation ---
def _create_rdv(h, when):
    payload = {
        "client_id": SOPHIE_ID,
        "date": when,
        "services": [{"service_id": "svc_9bb2d107ea"}, {"service_id": "svc_bcc9764308"}],
        "kilometrage": 0,
    }
    r = requests.post(f"{BASE}/appointments", json=payload, headers=h)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_finish_generates_sequential_invoice_and_persists_stylists(h):
    rid = _create_rdv(h, "2026-08-01T10:00:00+00:00")
    try:
        r = requests.post(
            f"{BASE}/appointments/{rid}/finish",
            json={"payment_mode": "CB", "stylists": {"svc_9bb2d107ea": "Marley", "svc_bcc9764308": "Julien"}},
            headers=h,
        )
        assert r.status_code == 200, r.text
        done = r.json()
        assert done["status"] == "done"
        assert done.get("invoice_number", "").startswith("F-2026-")
        seq = int(done["invoice_number"].split("-")[-1])
        assert seq >= 2  # 0001 already exists on rdv_037b0f8120
        mapping = {s["service_id"]: s["stylist"] for s in done["services"]}
        assert mapping["svc_9bb2d107ea"] == "Marley"
        assert mapping["svc_bcc9764308"] == "Julien"

        # second finish attempt => 400
        r2 = requests.post(
            f"{BASE}/appointments/{rid}/finish",
            json={"payment_mode": "CB"},
            headers=h,
        )
        assert r2.status_code == 400
    finally:
        requests.delete(f"{BASE}/appointments/{rid}", headers=h)


# --- Date stability on PUT without touching date ---
def test_date_stable_on_edit_without_change(h):
    original = "2026-07-25T15:30:00+00:00"
    rid = _create_rdv(h, original)
    try:
        # Read back
        r = requests.get(f"{BASE}/appointments", headers=h)
        a = next(x for x in r.json() if x["id"] == rid)
        stored = a["date"]
        assert stored == original

        # PUT sending exactly the same date -> must remain identical
        r2 = requests.put(
            f"{BASE}/appointments/{rid}",
            json={"date": stored},
            headers=h,
        )
        assert r2.status_code == 200
        assert r2.json()["date"] == original

        # PUT without date field at all -> must not touch date
        r3 = requests.put(
            f"{BASE}/appointments/{rid}",
            json={"notes": "no-op"},
            headers=h,
        )
        assert r3.status_code == 200
        assert r3.json()["date"] == original

        # Repeat 2 more cycles
        for _ in range(2):
            requests.put(f"{BASE}/appointments/{rid}", json={"date": stored}, headers=h)
        r4 = requests.get(f"{BASE}/appointments", headers=h)
        a4 = next(x for x in r4.json() if x["id"] == rid)
        assert a4["date"] == original
    finally:
        requests.delete(f"{BASE}/appointments/{rid}", headers=h)
