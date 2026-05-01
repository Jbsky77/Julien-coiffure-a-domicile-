"""Unit tests for the geocoding service (cache + normalization).

Network calls to Nominatim are monkey-patched.
"""
import asyncio
from unittest.mock import patch

import pytest

from app.services import geocoding
from app.utils.formatting import normalize_address


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(autouse=True)
def _reset_stats():
    for k in geocoding._stats:
        geocoding._stats[k] = 0


def test_normalize_address_collapses_spaces_and_accents():
    a = "  1, Rue DE LA paix - Paris  "
    b = "1 rue de la Paix, Paris"
    assert normalize_address(a) == normalize_address(b)
    c = "5 Avénue de la République"
    assert normalize_address(c) == "5 avenue de la republique"


def test_resolve_empty_address_returns_error_dict():
    out = _run(geocoding.resolve(""))
    assert out["error"] == "empty_address"
    assert out["lat"] is None and out["lng"] is None


def test_resolve_uses_cache_for_normalized_match(loop_clean_db):
    addr1 = "1 rue de la Paix, Paris"
    addr2 = "  1, Rue DE LA paix - Paris  "

    async def fake_query(_addr):
        return 48.0, 2.0, None

    with patch.object(geocoding, "_query_nominatim", side_effect=fake_query):
        first = _run(geocoding.resolve(addr1))
        second = _run(geocoding.resolve(addr2))

    assert first["cached"] is False
    assert first["source"] == "nominatim"
    assert second["cached"] is True
    assert second["source"] == "cache"
    assert second["lat"] == 48.0 and second["lng"] == 2.0
    assert geocoding._stats["hit"] == 1
    assert geocoding._stats["miss"] == 1


def test_resolve_handles_nominatim_error_without_persisting(loop_clean_db):
    async def fake_query(_addr):
        return None, None, "timeout"

    with patch.object(geocoding, "_query_nominatim", side_effect=fake_query):
        out = _run(geocoding.resolve("address that times out"))

    assert out["error"] == "timeout"
    assert out["cached"] is False
    assert geocoding._stats["error"] == 1


def test_resolve_persists_not_found_marker(loop_clean_db):
    async def fake_query(_addr):
        return None, None, "not_found"

    from app.db import db

    async def count():
        return await db.geocache.count_documents({"address_norm": normalize_address("ghost street")})

    with patch.object(geocoding, "_query_nominatim", side_effect=fake_query):
        out = _run(geocoding.resolve("ghost street"))
    assert out["error"] == "not_found"
    assert out["lat"] is None
    assert _run(count()) == 1
    assert geocoding._stats["empty"] == 1


@pytest.fixture
def loop_clean_db():
    """Wipe the geocache collection before each test so cache state is deterministic."""
    from app.db import db
    _run(db.geocache.delete_many({}))
    yield
    _run(db.geocache.delete_many({}))
