"""Pure calculation helpers for employee payroll drafts and contractor invoices.

This module never guesses statutory rates. It only combines amounts explicitly
provided by the employer or their accountant and returns a transparent breakdown.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any


CENT = Decimal("0.01")


def _amount(value: Any, field: str) -> Decimal:
    try:
        amount = Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"Montant invalide pour {field}") from exc
    if amount < 0:
        raise ValueError(f"{field} ne peut pas être négatif")
    return amount


def _as_float(value: Decimal) -> float:
    return float(value.quantize(CENT, rounding=ROUND_HALF_UP))


def calculate_payroll_document(values: dict[str, Any]) -> dict[str, Any]:
    """Calculate a non-certified payroll preparation from manually supplied amounts."""
    keys = (
        "base_salary", "normal_hours_amount", "overtime_amount", "commissions",
        "bonuses", "tips", "benefits_in_kind", "absence_deduction",
        "employee_contributions", "employer_contributions", "withholding_tax",
        "expenses", "advances", "other_deductions", "net_social",
    )
    amounts = {key: _amount(values.get(key), key) for key in keys}
    gross = (
        amounts["base_salary"] + amounts["normal_hours_amount"] + amounts["overtime_amount"]
        + amounts["commissions"] + amounts["bonuses"] + amounts["tips"]
        + amounts["benefits_in_kind"] - amounts["absence_deduction"]
    )
    if gross < 0:
        raise ValueError("Les absences ne peuvent pas rendre le salaire brut négatif")
    net_before_tax = gross - amounts["employee_contributions"]
    if net_before_tax < 0:
        raise ValueError("Les cotisations salariales dépassent le salaire brut")
    net_paid = (
        net_before_tax - amounts["withholding_tax"] + amounts["expenses"]
        - amounts["advances"] - amounts["other_deductions"]
    )
    employer_cost = gross + amounts["employer_contributions"] + amounts["expenses"]
    return {
        "kind": "payroll",
        "inputs": {key: _as_float(value) for key, value in amounts.items()},
        "gross": _as_float(gross),
        "net_social": _as_float(amounts["net_social"]),
        "net_before_tax": _as_float(net_before_tax),
        "withholding_tax": _as_float(amounts["withholding_tax"]),
        "net_paid": _as_float(net_paid),
        "employer_cost": _as_float(employer_cost),
        "calculation_mode": "manual_amounts",
        "certified": False,
    }


def calculate_employee_invoice(values: dict[str, Any]) -> dict[str, Any]:
    quantity = _amount(values.get("quantity", 1), "quantity")
    unit_price = _amount(values.get("unit_price_ht"), "unit_price_ht")
    vat_rate = _amount(values.get("vat_rate"), "vat_rate")
    subtotal = (quantity * unit_price).quantize(CENT, rounding=ROUND_HALF_UP)
    vat = (subtotal * vat_rate / Decimal("100")).quantize(CENT, rounding=ROUND_HALF_UP)
    total = subtotal + vat
    return {
        "kind": "invoice",
        "inputs": {
            "quantity": _as_float(quantity),
            "unit_price_ht": _as_float(unit_price),
            "vat_rate": _as_float(vat_rate),
        },
        "subtotal_ht": _as_float(subtotal),
        "vat_amount": _as_float(vat),
        "total_ttc": _as_float(total),
        "calculation_mode": "invoice_amounts",
        "certified": False,
    }
