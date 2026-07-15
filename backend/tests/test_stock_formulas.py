"""Unit tests for the professional catalogue and idempotent stock formulas."""
import asyncio
from copy import deepcopy

from app.catalog.color_products import PRODUCTS
from app.services import stock as domain


class FakeCollection:
    def __init__(self):
        self.rows = []

    async def find_one(self, query, projection=None):
        return next((deepcopy(row) for row in self.rows if all(row.get(k) == v for k, v in query.items())), None)

    async def insert_one(self, document):
        self.rows.append(deepcopy(document))

    async def update_one(self, query, update):
        row = next(row for row in self.rows if all(row.get(k) == v for k, v in query.items()))
        row.update(deepcopy(update.get("$set", {})))


class FakeDb:
    def __init__(self):
        self.stock = FakeCollection()
        self.stock_movements = FakeCollection()


def majirel(code):
    return next(p for p in PRODUCTS if p["range"] == "Majirel" and p["shadeCode"] == code)


def usage(product_id, amount, usage_id="use_test"):
    dose = "full" if amount == 1 else "half" if amount == 0.5 else "quarter" if amount == 0.25 else "custom"
    return {
        "id": usage_id,
        "catalog_product_id": product_id,
        "stock_item_id": None,
        "dose_type": dose,
        "used_stock_units": amount,
        "physical_amount": None,
        "physical_amount_unit": None,
        "technical_note": "test",
    }


def appointment(usages=None):
    return {"id": "rdv_test", "client_id": "cli_test", "product_usages": usages or []}


async def seeded_db(monkeypatch, initial=1):
    fake = FakeDb()
    monkeypatch.setattr(domain, "db", fake)
    product = majirel("3")
    item = await domain.ensure_stock_item(product["id"])
    item["quantity"] = initial
    fake.stock.rows[0]["quantity"] = initial
    return fake, product


def test_catalog_has_stable_unique_ids_and_correct_majirel_codes():
    ids = [p["id"] for p in PRODUCTS]
    assert len(ids) == len(set(ids))
    assert majirel("3")["normalizedShadeCode"] == "3/0"
    assert not any(p["range"] == "Majirel" and p.get("normalizedShadeCode") == "2/0" for p in PRODUCTS)
    assert {p["brand"] for p in PRODUCTS} == {"Lâ€™OrÃ©al Professionnel", "Wella Professionals", "Schwarzkopf Professional"}


def test_decimal_quantity_never_leaves_artificial_residue():
    assert domain.quantity(1 - 0.5 - 0.5) == 0
    assert domain.quantity(1 - 0.25) == 0.75
    assert domain.quantity(0.1 + 0.2) == 0.3


def test_full_dose_is_idempotent(monkeypatch):
    async def scenario():
        fake, product = await seeded_db(monkeypatch, 1)
        first = await domain.reconcile_formula(appointment(), [usage(product["id"], 1)], "user")
        assert fake.stock.rows[0]["quantity"] == 0
        second = await domain.reconcile_formula(appointment(first), [usage(product["id"], 1)], "user")
        assert fake.stock.rows[0]["quantity"] == 0
        assert len(fake.stock_movements.rows) == 1
        assert second[0]["consumption_status"] == "applied"
    asyncio.run(scenario())


def test_half_dose_then_difference_only_then_removal(monkeypatch):
    async def scenario():
        fake, product = await seeded_db(monkeypatch, 1)
        half = await domain.reconcile_formula(appointment(), [usage(product["id"], 0.5)], "user")
        assert fake.stock.rows[0]["quantity"] == 0.5
        full = await domain.reconcile_formula(appointment(half), [usage(product["id"], 1)], "user")
        assert fake.stock.rows[0]["quantity"] == 0
        assert fake.stock_movements.rows[-1]["quantity_delta"] == -0.5
        empty = await domain.reconcile_formula(appointment(full), [], "user")
        assert empty == []
        assert fake.stock.rows[0]["quantity"] == 1
        assert fake.stock_movements.rows[-1]["movement_type"] == "appointment_reversal"
    asyncio.run(scenario())


def test_usage_is_allowed_at_zero_and_reversal_restores_stock(monkeypatch):
    async def scenario():
        fake, product = await seeded_db(monkeypatch, 0)
        applied = await domain.reconcile_formula(appointment(), [usage(product["id"], 1)], "user")
        assert fake.stock.rows[0]["quantity"] == -1
        reversed_lines = await domain.reverse_formula(appointment(applied), "user", "Annulation")
        assert fake.stock.rows[0]["quantity"] == 0
        assert reversed_lines[0]["consumption_status"] == "reversed"
    asyncio.run(scenario())


def test_physical_amount_fraction_examples():
    product = majirel("3")
    assert product["packageAmount"] == 60
    assert domain.quantity(30 / product["packageAmount"]) == 0.5

