"""Backend tests for Coiffure à domicile Julien Bouche."""
import os
import math
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://julien-bouche-design.preview.emergentagent.com').rstrip('/') + '/api'
TOKEN = 'test_session_julien'
HEADERS = {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'}


@pytest.fixture(scope='module')
def s():
    sess = requests.Session()
    sess.headers.update(HEADERS)
    return sess


# ----- Auth -----
def test_auth_me(s):
    r = s.get(f'{BASE_URL}/auth/me')
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['user_id'] == 'test-user-julien'


def test_auth_unauthorized():
    r = requests.get(f'{BASE_URL}/auth/me')
    assert r.status_code == 401


# ----- Settings -----
def test_settings_get(s):
    r = s.get(f'{BASE_URL}/settings')
    assert r.status_code == 200
    d = r.json()
    assert d['urssaf_rate'] == 0.22
    assert d['fuel_supplement_per_tier'] == 2.5
    assert d['fuel_supplement_tier_km'] == 10.0


def test_settings_put(s):
    # Reset to defaults to keep tests stable
    r = s.put(f'{BASE_URL}/settings', json={'fuel_price_per_liter': 1.85, 'urssaf_rate': 0.22,
                                             'fuel_supplement_per_tier': 2.5, 'fuel_supplement_tier_km': 10.0})
    assert r.status_code == 200


# ----- Services -----
def test_services_seeded(s):
    r = s.get(f'{BASE_URL}/services')
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 5
    cats = {i['category'] for i in items}
    assert {'HOMME', 'FEMME', 'ENFANT'}.issubset(cats)


def test_services_crud(s):
    r = s.post(f'{BASE_URL}/services', json={'name': 'TEST_Svc', 'price': 10.0, 'category': 'AUTRE'})
    assert r.status_code == 200
    sid = r.json()['id']
    r = s.put(f'{BASE_URL}/services/{sid}', json={'price': 12.0})
    assert r.status_code == 200 and r.json()['price'] == 12.0
    r = s.delete(f'{BASE_URL}/services/{sid}')
    assert r.status_code == 200


# ----- Clients -----
@pytest.fixture(scope='module')
def client_id(s):
    r = s.post(f'{BASE_URL}/clients', json={'first_name': 'TEST_Marie', 'last_name': 'Dupont',
                                            'phone': '0600000000', 'birthday': '1990-05-15'})
    assert r.status_code == 200
    cid = r.json()['id']
    yield cid
    s.delete(f'{BASE_URL}/clients/{cid}')


def test_clients_get(s, client_id):
    r = s.get(f'{BASE_URL}/clients/{client_id}')
    assert r.status_code == 200
    d = r.json()
    assert 'client' in d and 'appointments' in d
    assert d['client']['id'] == client_id


def test_clients_update(s, client_id):
    r = s.put(f'{BASE_URL}/clients/{client_id}', json={'phone': '0611111111'})
    assert r.status_code == 200 and r.json()['phone'] == '0611111111'


# ----- Service IDs by category for appointment tests -----
@pytest.fixture(scope='module')
def svc_ids(s):
    items = s.get(f'{BASE_URL}/services').json()
    out = {}
    for i in items:
        out.setdefault(i['category'], i['id'])
    return out


# ----- Appointments: family pack + fuel supplement -----
def test_appointment_family_pack_and_fuel(s, client_id, svc_ids):
    payload = {
        'client_id': client_id,
        'date': (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        'services': [
            {'service_id': svc_ids['HOMME']},
            {'service_id': svc_ids['FEMME']},
            {'service_id': svc_ids['ENFANT']},
        ],
        'kilometrage': 22,
    }
    r = s.post(f'{BASE_URL}/appointments', json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['family_pack_applied'] is True
    assert d['price_base'] == 45.0 + 5.0  # family 45 + fuel 5
    assert d['fuel_supplement'] == 5.0
    s.delete(f'{BASE_URL}/appointments/{d["id"]}')


@pytest.mark.parametrize('km,expected_fuel', [(0, 0), (9, 0), (10, 2.5), (22, 5.0)])
def test_appointment_fuel_tiers(s, client_id, svc_ids, km, expected_fuel):
    r = s.post(f'{BASE_URL}/appointments', json={
        'client_id': client_id,
        'date': (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
        'services': [{'service_id': svc_ids['HOMME']}],
        'kilometrage': km,
    })
    assert r.status_code == 200
    d = r.json()
    assert d['fuel_supplement'] == expected_fuel
    s.delete(f'{BASE_URL}/appointments/{d["id"]}')


def test_appointment_price_override(s, client_id, svc_ids):
    r = s.post(f'{BASE_URL}/appointments', json={
        'client_id': client_id,
        'date': (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
        'services': [{'service_id': svc_ids['HOMME']}],
        'kilometrage': 0,
        'price_final_override': 99.99,
    })
    assert r.status_code == 200
    d = r.json()
    assert d['price_final'] == 99.99
    s.delete(f'{BASE_URL}/appointments/{d["id"]}')


def test_appointment_update_and_finish_and_double_finish(s, client_id, svc_ids):
    r = s.post(f'{BASE_URL}/appointments', json={
        'client_id': client_id,
        'date': (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        'services': [{'service_id': svc_ids['HOMME']}],
        'kilometrage': 5,
    })
    rid = r.json()['id']
    # update
    r = s.put(f'{BASE_URL}/appointments/{rid}', json={'kilometrage': 15, 'notes': 'updated'})
    assert r.status_code == 200 and r.json()['fuel_supplement'] == 2.5
    # finish
    r = s.post(f'{BASE_URL}/appointments/{rid}/finish', json={'payment_mode': 'CB'})
    assert r.status_code == 200 and r.json()['status'] == 'done'
    # double finish -> 400
    r = s.post(f'{BASE_URL}/appointments/{rid}/finish', json={'payment_mode': 'CB'})
    assert r.status_code == 400
    # update on done -> 400
    r = s.put(f'{BASE_URL}/appointments/{rid}', json={'notes': 'x'})
    assert r.status_code == 400
    s.delete(f'{BASE_URL}/appointments/{rid}')


# ----- Loyalty flow -----
def test_loyalty_5_paid_then_gift_resets(s, svc_ids):
    r = s.post(f'{BASE_URL}/clients', json={'first_name': 'TEST_Loy', 'last_name': 'Test'})
    cid = r.json()['id']
    sid_homme = svc_ids['HOMME']
    rids = []
    for i in range(5):
        rr = s.post(f'{BASE_URL}/appointments', json={
            'client_id': cid,
            'date': (datetime.now(timezone.utc) + timedelta(days=i)).isoformat(),
            'services': [{'service_id': sid_homme}],
        })
        rid = rr.json()['id']
        rids.append(rid)
        s.post(f'{BASE_URL}/appointments/{rid}/finish', json={'payment_mode': 'CB'})
    cdoc = s.get(f'{BASE_URL}/clients/{cid}').json()['client']
    assert cdoc['loyalty_counters'].get(sid_homme) == 5
    # 6th gift
    rr = s.post(f'{BASE_URL}/appointments', json={
        'client_id': cid,
        'date': datetime.now(timezone.utc).isoformat(),
        'services': [{'service_id': sid_homme, 'is_gift': True}],
    })
    rid6 = rr.json()['id']
    s.post(f'{BASE_URL}/appointments/{rid6}/finish', json={'payment_mode': 'CB'})
    cdoc = s.get(f'{BASE_URL}/clients/{cid}').json()['client']
    assert cdoc['loyalty_counters'].get(sid_homme) == 0
    # cleanup
    for rid in rids + [rid6]:
        s.delete(f'{BASE_URL}/appointments/{rid}')
    s.delete(f'{BASE_URL}/clients/{cid}')


# ----- Stock -----
def test_stock_crud_and_alerts(s):
    r = s.post(f'{BASE_URL}/stock', json={'name': 'TEST_Shampoo', 'quantity': 1, 'threshold': 5, 'tag': 'Soin'})
    assert r.status_code == 200
    sid = r.json()['id']
    items = s.get(f'{BASE_URL}/stock').json()
    item = next(i for i in items if i['id'] == sid)
    assert item['quantity'] <= item['threshold']  # alert
    s.put(f'{BASE_URL}/stock/{sid}', json={'quantity': 10})
    s.delete(f'{BASE_URL}/stock/{sid}')


# ----- Accounting -----
def test_accounting_urssaf_ceil(s):
    # Create a fresh client + done rdv with price 22.01 in current month
    cdoc = s.post(f'{BASE_URL}/clients', json={'first_name': 'TEST_URS', 'last_name': 'Calc'}).json()
    cid = cdoc['id']
    svcs = s.get(f'{BASE_URL}/services').json()
    sid = svcs[0]['id']
    now = datetime.now(timezone.utc)
    yyyymm = f'{now.year:04d}-{now.month:02d}'
    # Reset month first
    s.post(f'{BASE_URL}/accounting/reset/{yyyymm}')
    rr = s.post(f'{BASE_URL}/appointments', json={
        'client_id': cid, 'date': now.isoformat(),
        'services': [{'service_id': sid}], 'kilometrage': 0,
        'price_final_override': 22.01,
    })
    rid = rr.json()['id']
    s.post(f'{BASE_URL}/appointments/{rid}/finish', json={'payment_mode': 'CB'})
    r = s.get(f'{BASE_URL}/accounting/month/{yyyymm}')
    assert r.status_code == 200
    d = r.json()
    assert d['ca_brut'] == 22.01
    assert d['urssaf_ceil'] == 5  # ceil(22.01*0.22=4.8422)=5
    assert 'CB' in d['payment_breakdown']
    # months listing
    r = s.get(f'{BASE_URL}/accounting/months')
    assert r.status_code == 200
    months = r.json()
    assert any(m['month'] == yyyymm for m in months)
    # urssaf toggle
    r = s.post(f'{BASE_URL}/accounting/urssaf/{yyyymm}', json={'declared': True, 'paid': True})
    assert r.status_code == 200 and r.json()['declared'] is True
    # reset
    r = s.post(f'{BASE_URL}/accounting/reset/{yyyymm}')
    assert r.status_code == 200 and r.json()['deleted'] >= 1
    s.delete(f'{BASE_URL}/clients/{cid}')


# ----- Dashboard -----
def test_dashboard(s):
    r = s.get(f'{BASE_URL}/dashboard')
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ['month_data', 'upcoming_today', 'upcoming_tomorrow', 'upcoming_count',
              'upcoming_amount', 'upcoming_birthdays', 'unseen_clients', 'avg_basket',
              'low_stock', 'gifts_today', 'gifts_month']:
        assert k in d, f'missing {k}'
    assert 'day' in d['avg_basket'] and 'month' in d['avg_basket'] and 'year' in d['avg_basket']
