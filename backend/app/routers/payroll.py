"""Payroll preparation and employee invoice endpoints.

The module is intentionally not a certified payroll engine and does not emit DSN.
All statutory contribution amounts are entered or imported by the employer/accountant.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.db import db
from app.services.payroll import calculate_employee_invoice, calculate_payroll_document
from app.tenancy import require_role


router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _context(request: Request):
    return require_role(request, "owner", "admin")


async def _audit(request: Request, action: str, entity_id: str, details: dict[str, Any] | None = None) -> None:
    context = _context(request)
    await db.audit_logs.insert_one({
        "id": f"aud_{uuid.uuid4().hex[:16]}",
        "action": action,
        "entity_type": "employee_financial_document",
        "entity_id": entity_id,
        "actor_user_id": context.user_id,
        "details": details or {},
        "created_at": _now(),
    })


class EmployerPayrollSettings(BaseModel):
    legal_name: str = Field(default="", max_length=160)
    address: str = Field(default="", max_length=500)
    siret: str = Field(default="", pattern=r"^$|^[0-9]{14}$")
    ape_code: str = Field(default="", max_length=12)
    urssaf_number: str = Field(default="", max_length=80)
    workforce: int = Field(default=0, ge=0, le=100000)
    department: str = Field(default="", max_length=100)
    municipality: str = Field(default="", max_length=160)
    accident_rate: float | None = Field(default=None, ge=0, le=100)
    mutual_organization: str = Field(default="", max_length=200)
    provident_organization: str = Field(default="", max_length=200)
    collective_agreement: str = Field(default="Convention collective de la coiffure — IDCC 2596", max_length=240)


class EmployeeProfileInput(BaseModel):
    member_user_id: str | None = Field(default=None, max_length=100)
    name: str = Field(min_length=2, max_length=160)
    email: str = Field(default="", max_length=200)
    address: str = Field(default="", max_length=500)
    birth_date: str | None = None
    entry_date: str | None = None
    employee_type: Literal["employee", "apprentice", "contractor"] = "employee"
    contract_type: str = Field(default="CDI", max_length=80)
    job_title: str = Field(default="", max_length=160)
    classification: str = Field(default="", max_length=120)
    level: str = Field(default="", max_length=80)
    step: str = Field(default="", max_length=80)
    full_time: bool = True
    contractual_hours: float = Field(default=151.67, ge=0, le=744)
    base_salary: float = Field(default=0, ge=0, le=1000000)
    hourly_rate: float = Field(default=0, ge=0, le=10000)
    withholding_rate: float = Field(default=0, ge=0, le=100)
    apprentice_contract_start: str | None = None
    apprentice_year: int | None = Field(default=None, ge=1, le=4)
    apprentice_diploma: str = Field(default="", max_length=240)
    apprentice_smic_percentage: float | None = Field(default=None, ge=0, le=200)
    contractor_siret: str = Field(default="", pattern=r"^$|^[0-9]{14}$")
    notes: str = Field(default="", max_length=2000)


class EmployeeDocumentInput(BaseModel):
    employee_id: str = Field(min_length=4, max_length=100)
    kind: Literal["payroll", "invoice"]
    period: str = Field(pattern=r"^[0-9]{4}-(0[1-9]|1[0-2])$")
    payment_date: str | None = None
    description: str = Field(default="", max_length=500)
    values: dict[str, float] = Field(default_factory=dict)


class CancellationInput(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


DEFAULT_EMPLOYER_SETTINGS = EmployerPayrollSettings().model_dump()


@router.get("/payroll/settings")
async def payroll_settings(request: Request):
    _context(request)
    stored = await db.payroll_settings.find_one({"id": "employer"}, {"_id": 0}) or {}
    return {**DEFAULT_EMPLOYER_SETTINGS, **stored}


@router.put("/payroll/settings")
async def update_payroll_settings(payload: EmployerPayrollSettings, request: Request):
    context = _context(request)
    document = {"id": "employer", **payload.model_dump(), "updated_at": _now(), "updated_by": context.user_id}
    await db.payroll_settings.update_one({"id": "employer"}, {"$set": document}, upsert=True)
    await _audit(request, "payroll.settings_updated", "employer")
    return document


@router.get("/payroll/employees")
async def payroll_employees(request: Request):
    _context(request)
    rows = await db.payroll_employees.find({}, {"_id": 0}).to_list(1000)
    return sorted(rows, key=lambda item: (item.get("name") or "").casefold())


@router.post("/payroll/employees")
async def create_payroll_employee(payload: EmployeeProfileInput, request: Request):
    context = _context(request)
    if payload.member_user_id:
        duplicate = await db.payroll_employees.find_one({"member_user_id": payload.member_user_id}, {"_id": 0})
        if duplicate:
            raise HTTPException(409, "Une fiche existe déjà pour cet employé")
    employee_id = f"payemp_{uuid.uuid4().hex[:12]}"
    document = {
        "id": employee_id,
        **payload.model_dump(),
        "created_at": _now(),
        "created_by": context.user_id,
        "updated_at": _now(),
    }
    await db.payroll_employees.insert_one(document)
    await _audit(request, "payroll.employee_created", employee_id)
    return document


@router.put("/payroll/employees/{employee_id}")
async def update_payroll_employee(employee_id: str, payload: EmployeeProfileInput, request: Request):
    context = _context(request)
    current = await db.payroll_employees.find_one({"id": employee_id}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Fiche employé introuvable")
    changes = {**payload.model_dump(), "updated_at": _now(), "updated_by": context.user_id}
    await db.payroll_employees.update_one({"id": employee_id}, {"$set": changes})
    await _audit(request, "payroll.employee_updated", employee_id)
    return await db.payroll_employees.find_one({"id": employee_id}, {"_id": 0})


@router.get("/payroll/documents")
async def payroll_documents(request: Request, period: str | None = None, kind: str | None = None):
    _context(request)
    query: dict[str, Any] = {}
    if period:
        query["period"] = period
    if kind:
        if kind not in {"payroll", "invoice"}:
            raise HTTPException(400, "Type de document invalide")
        query["kind"] = kind
    rows = await db.employee_financial_documents.find(query, {"_id": 0}).to_list(5000)
    return sorted(rows, key=lambda item: item.get("created_at", ""), reverse=True)


def _calculate(payload: EmployeeDocumentInput) -> dict[str, Any]:
    try:
        if payload.kind == "payroll":
            return calculate_payroll_document(payload.values)
        return calculate_employee_invoice(payload.values)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/payroll/documents")
async def create_payroll_document(payload: EmployeeDocumentInput, request: Request):
    context = _context(request)
    employee = await db.payroll_employees.find_one({"id": payload.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(404, "Fiche employé introuvable")
    employer = await db.payroll_settings.find_one({"id": "employer"}, {"_id": 0}) or DEFAULT_EMPLOYER_SETTINGS
    calculation = _calculate(payload)
    doc_id = f"empdoc_{uuid.uuid4().hex[:14]}"
    prefix = "PAIE" if payload.kind == "payroll" else "FACT"
    document = {
        "id": doc_id,
        "document_number": f"{prefix}-{payload.period.replace('-', '')}-{uuid.uuid4().hex[:6].upper()}",
        "kind": payload.kind,
        "period": payload.period,
        "payment_date": payload.payment_date,
        "description": payload.description.strip(),
        "employee_id": payload.employee_id,
        "employee_snapshot": employee,
        "employer_snapshot": {**DEFAULT_EMPLOYER_SETTINGS, **employer},
        "calculation": calculation,
        "status": "draft",
        "version": 1,
        "certified": False,
        "created_at": _now(),
        "created_by": context.user_id,
    }
    await db.employee_financial_documents.insert_one(document)
    await _audit(request, "payroll.document_created", doc_id, {"kind": payload.kind, "period": payload.period})
    return document


@router.post("/payroll/documents/{document_id}/validate")
async def validate_payroll_document(document_id: str, request: Request):
    context = _context(request)
    document = await db.employee_financial_documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(404, "Document introuvable")
    if document.get("status") != "draft":
        raise HTTPException(409, "Seul un brouillon peut être validé")
    employer = document.get("employer_snapshot") or {}
    if not employer.get("legal_name") or not employer.get("address") or not employer.get("siret"):
        raise HTTPException(400, "Complétez la raison sociale, l’adresse et le SIRET avant validation")
    changes = {"status": "validated", "validated_at": _now(), "validated_by": context.user_id}
    await db.employee_financial_documents.update_one({"id": document_id}, {"$set": changes})
    await _audit(request, "payroll.document_validated", document_id)
    return await db.employee_financial_documents.find_one({"id": document_id}, {"_id": 0})


@router.post("/payroll/documents/{document_id}/cancel")
async def cancel_payroll_document(document_id: str, payload: CancellationInput, request: Request):
    context = _context(request)
    document = await db.employee_financial_documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(404, "Document introuvable")
    if document.get("status") == "cancelled":
        raise HTTPException(409, "Document déjà annulé")
    changes = {
        "status": "cancelled",
        "cancelled_at": _now(),
        "cancelled_by": context.user_id,
        "cancellation_reason": payload.reason.strip(),
    }
    await db.employee_financial_documents.update_one({"id": document_id}, {"$set": changes})
    await _audit(request, "payroll.document_cancelled", document_id, {"reason": payload.reason.strip()})
    return await db.employee_financial_documents.find_one({"id": document_id}, {"_id": 0})


@router.post("/payroll/documents/{document_id}/rectify")
async def rectify_payroll_document(document_id: str, request: Request):
    context = _context(request)
    original = await db.employee_financial_documents.find_one({"id": document_id}, {"_id": 0})
    if not original:
        raise HTTPException(404, "Document introuvable")
    if original.get("status") == "draft":
        raise HTTPException(409, "Modifiez le brouillon existant avant validation")
    new_id = f"empdoc_{uuid.uuid4().hex[:14]}"
    copy = {
        **original,
        "id": new_id,
        "document_number": f"{original.get('document_number', 'DOC')}-R{int(original.get('version', 1)) + 1}",
        "status": "draft",
        "version": int(original.get("version", 1)) + 1,
        "rectifies_id": original["id"],
        "created_at": _now(),
        "created_by": context.user_id,
    }
    for key in ("validated_at", "validated_by", "cancelled_at", "cancelled_by", "cancellation_reason"):
        copy.pop(key, None)
    await db.employee_financial_documents.insert_one(copy)
    await _audit(request, "payroll.document_rectification_created", new_id, {"original_id": original["id"]})
    return copy


@router.delete("/payroll/documents/{document_id}")
async def delete_payroll_draft(document_id: str, request: Request):
    _context(request)
    document = await db.employee_financial_documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(404, "Document introuvable")
    if document.get("status") != "draft":
        raise HTTPException(409, "Un document validé doit être annulé, jamais supprimé")
    await db.employee_financial_documents.delete_one({"id": document_id})
    await _audit(request, "payroll.document_draft_deleted", document_id)
    return {"ok": True}
