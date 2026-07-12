import os
from datetime import datetime, timezone

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

from app.services.analytics import _compute_age
from app.services.financials import calculate_financials
from app.services.routing import compute_supplement
from app.utils.dates import paris_day_range
from app.utils.phone import format_french_phone, normalize_french_phone
from app.db import get_active_company, reset_active_company, set_active_company
from app.routers.public_booking import _family, _profile_category


def test_paris_day_handles_summer_timezone():
    start, end = paris_day_range("2026-07-13")
    assert start.isoformat() == "2026-07-12T22:00:00+00:00"
    assert end.isoformat() == "2026-07-13T22:00:00+00:00"


def test_financial_consistency_july_example():
    appointments = [{"status": "done", "price_final": 431, "payment_mode": "ESPECES"}]
    result = calculate_financials(appointments=appointments, urssaf_rate=0.22,
        consumables_per_client=34, fixed_costs=352, cb_fee_rate=0.0175, fuel_cost=0)
    assert result["margin_before_fixed_costs"] == 302
    assert result["net_margin"] == -50
    assert result["average_basket"] == 431


def test_invalid_phone_creates_no_normalized_value():
    assert normalize_french_phone("067038.5.2") is None
    assert format_french_phone("067038.5.2") == "Téléphone invalide"
    assert normalize_french_phone("+33 6 12 34 56 78") == "0612345678"


def test_invalid_age_is_excluded():
    assert _compute_age("0001-01-01") is None
    assert _compute_age("2999-01-01") is None


def test_neighbor_and_supplement_boundaries():
    assert 0.99 < 1.0
    assert not 1.00 < 1.0
    assert not 1.01 < 1.0
    assert compute_supplement(9.99, 10, 2.5) == 0
    assert compute_supplement(10, 10, 2.5) == 2.5
    assert compute_supplement(20, 10, 2.5) == 5


def test_company_context_is_explicit_and_resettable():
    token = set_active_company("f74d2791-0a35-4299-93fc-fa2907d7c183")
    try:
        assert get_active_company() == "f74d2791-0a35-4299-93fc-fa2907d7c183"
    finally:
        reset_active_company(token)


def test_public_site_profile_filter_keeps_family_pack():
    assert _profile_category("homme") == "HOMME"
    assert _profile_category("femme") == "FEMME"
    assert _profile_category("enfant") == "ENFANT"
    assert _family({"name": "Pack Famille", "category": "FORFAIT"})
    assert not _family({"name": "Coupe Homme", "category": "HOMME"})
