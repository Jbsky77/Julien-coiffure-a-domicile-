from app.tenancy import CompanyContext, can_access_appointment, has_permission


def context(role, permissions=None):
    return CompanyContext(user_id="u", email="u@example.fr", company_id="c", role=role, permissions=permissions or {})


def test_owner_has_every_permission():
    assert has_permission(context("owner"), "team")
    assert has_permission(context("owner"), "stock")


def test_employee_defaults_to_personal_calendar():
    employee = context("employee")
    assert has_permission(employee, "appointments_own")
    assert not has_permission(employee, "appointments_all")
    assert not has_permission(employee, "stock")


def test_explicit_permission_overrides_role_default():
    assert has_permission(context("employee", {"stock": True}), "stock")
    assert not has_permission(context("admin", {"clients": False}), "clients")


def test_employee_can_only_access_assigned_appointment():
    employee = context("employee")
    assert can_access_appointment(employee, {"assigned_employee_id": "u"})
    assert not can_access_appointment(employee, {"assigned_employee_id": "other"})
    assert not can_access_appointment(employee, {"assigned_employee_id": None})


def test_global_calendar_roles_can_access_any_appointment():
    for role in ("owner", "admin", "reception"):
        assert can_access_appointment(context(role), {"assigned_employee_id": "other"})


def test_explicit_global_calendar_permission_is_honoured():
    employee = context("employee", {"appointments_all": True})
    assert can_access_appointment(employee, {"assigned_employee_id": "other"})
