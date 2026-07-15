import pytest

from app.services.payroll import calculate_employee_invoice, calculate_payroll_document


def test_payroll_combines_only_manually_validated_amounts():
    result = calculate_payroll_document({
        "base_salary": 1800,
        "overtime_amount": 120,
        "commissions": 75.55,
        "bonuses": 50,
        "absence_deduction": 40,
        "employee_contributions": 430,
        "employer_contributions": 610,
        "withholding_tax": 65,
        "expenses": 30,
        "advances": 100,
        "net_social": 1510.25,
    })
    assert result["gross"] == 2005.55
    assert result["net_before_tax"] == 1575.55
    assert result["net_paid"] == 1440.55
    assert result["employer_cost"] == 2645.55
    assert result["net_social"] == 1510.25
    assert result["calculation_mode"] == "manual_amounts"
    assert result["certified"] is False


def test_part_time_and_apprentice_amounts_are_not_inferred():
    # The legal percentage depends on dates and the individual contract. The
    # engine deliberately preserves the amount validated by the payroll adviser.
    before_march_2025 = calculate_payroll_document({"base_salary": 900})
    after_march_2025 = calculate_payroll_document({"base_salary": 950})
    assert before_march_2025["gross"] == 900
    assert after_march_2025["gross"] == 950
    assert before_march_2025["inputs"]["employee_contributions"] == 0
    assert after_march_2025["inputs"]["employee_contributions"] == 0


def test_payroll_rounds_to_cents_and_rejects_invalid_deductions():
    assert calculate_payroll_document({"base_salary": "1000.005"})["gross"] == 1000.01
    with pytest.raises(ValueError, match="absences"):
        calculate_payroll_document({"base_salary": 100, "absence_deduction": 101})
    with pytest.raises(ValueError, match="cotisations salariales"):
        calculate_payroll_document({"base_salary": 100, "employee_contributions": 101})
    with pytest.raises(ValueError, match="ne peut pas être négatif"):
        calculate_payroll_document({"base_salary": -1})


def test_employee_invoice_calculation_and_rounding():
    result = calculate_employee_invoice({
        "quantity": 2.5,
        "unit_price_ht": 80,
        "vat_rate": 20,
    })
    assert result["subtotal_ht"] == 200
    assert result["vat_amount"] == 40
    assert result["total_ttc"] == 240
    assert result["certified"] is False


def test_employee_invoice_rejects_negative_values():
    with pytest.raises(ValueError, match="ne peut pas être négatif"):
        calculate_employee_invoice({"quantity": 1, "unit_price_ht": -20, "vat_rate": 20})
