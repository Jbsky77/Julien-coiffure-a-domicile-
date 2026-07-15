"""Mongo-compatible document API backed by Supabase/PostgreSQL.

The application historically used Motor/MongoDB.  Keeping this small adapter lets
the existing domain code run unchanged while documents are persisted in a private
PostgreSQL JSONB table.  Only the server-side Supabase secret is used here.
"""
from __future__ import annotations

import copy
import os
import uuid
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, AsyncIterator

import httpx


_MISSING = object()
_active_company_id: ContextVar[str | None] = ContextVar("active_company_id", default=None)


def set_active_company(company_id: str):
    return _active_company_id.set(company_id)


def reset_active_company(token) -> None:
    _active_company_id.reset(token)


def get_active_company() -> str:
    company_id = _active_company_id.get()
    if not company_id:
        raise RuntimeError("Active company context is required")
    return company_id


def _get(doc: dict, path: str, default: Any = _MISSING) -> Any:
    value: Any = doc
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return default
        value = value[part]
    return value


def _set(doc: dict, path: str, value: Any) -> None:
    target = doc
    parts = path.split(".")
    for part in parts[:-1]:
        target = target.setdefault(part, {})
    target[parts[-1]] = value


def _unset(doc: dict, path: str) -> None:
    target = doc
    parts = path.split(".")
    for part in parts[:-1]:
        target = target.get(part, {})
    if isinstance(target, dict):
        target.pop(parts[-1], None)


def _matches(doc: dict, query: dict | None) -> bool:
    query = query or {}
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(doc, part) for part in expected):
                return False
            continue
        actual = _get(doc, key)
        if isinstance(expected, dict) and any(str(k).startswith("$") for k in expected):
            for op, operand in expected.items():
                if op == "$in" and actual not in operand:
                    return False
                if op == "$ne" and actual == operand:
                    return False
                if op == "$exists" and ((actual is not _MISSING) != bool(operand)):
                    return False
                if op == "$gte" and (actual is _MISSING or actual < operand):
                    return False
        elif actual is _MISSING or actual != expected:
            return False
    return True


def _project(doc: dict, projection: dict | None) -> dict:
    if not projection:
        return copy.deepcopy(doc)
    included = [key for key, enabled in projection.items() if enabled and key != "_id"]
    if included:
        result: dict = {}
        for key in included:
            value = _get(doc, key)
            if value is not _MISSING:
                _set(result, key, copy.deepcopy(value))
        return result
    result = copy.deepcopy(doc)
    for key, enabled in projection.items():
        if not enabled:
            _unset(result, key)
    return result


def _apply_update(doc: dict, update: dict, inserting: bool = False) -> dict:
    result = copy.deepcopy(doc)
    operations = update if any(str(k).startswith("$") for k in update) else {"$set": update}
    for key, value in operations.get("$set", {}).items():
        _set(result, key, copy.deepcopy(value))
    if inserting:
        for key, value in operations.get("$setOnInsert", {}).items():
            _set(result, key, copy.deepcopy(value))
    for key in operations.get("$unset", {}):
        _unset(result, key)
    for key, value in operations.get("$inc", {}).items():
        current = _get(result, key, 0)
        _set(result, key, current + value)
    for key, value in operations.get("$push", {}).items():
        current = list(_get(result, key, []))
        current.append(copy.deepcopy(value))
        _set(result, key, current)
    return result


class Cursor:
    def __init__(self, collection: "Collection", query: dict, projection: dict | None):
        self.collection = collection
        self.query = query
        self.projection = projection
        self.sort_key: str | None = None
        self.sort_direction = 1
        self._iter: AsyncIterator | None = None

    def sort(self, key: str, direction: int = 1) -> "Cursor":
        self.sort_key, self.sort_direction = key, direction
        return self

    async def to_list(self, length: int | None = None) -> list[dict]:
        rows = [r for r in await self.collection._all() if _matches(r["document"], self.query)]
        if self.sort_key:
            rows.sort(
                key=lambda r: (_get(r["document"], self.sort_key) is _MISSING, _get(r["document"], self.sort_key, None)),
                reverse=self.sort_direction < 0,
            )
        docs = [_project(r["document"], self.projection) for r in rows]
        return docs if length is None else docs[:length]

    def __aiter__(self):
        async def iterate():
            for item in await self.to_list(None):
                yield item
        return iterate()


@dataclass
class WriteResult:
    modified_count: int = 0
    deleted_count: int = 0


class Collection:
    def __init__(self, store: "Store", name: str):
        self.store, self.name = store, name

    async def _all(self) -> list[dict]:
        return await self.store.request("GET", params={"collection": f"eq.{self.name}", "select": "key,document", "limit": "50000"})

    async def _save(self, key: str, document: dict) -> None:
        await self.store.request(
            "POST",
            json={"company_id": get_active_company(), "collection": self.name, "key": key, "document": document},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    def find(self, query: dict | None = None, projection: dict | None = None) -> Cursor:
        return Cursor(self, query or {}, projection)

    async def find_one(self, query: dict | None = None, projection: dict | None = None) -> dict | None:
        docs = await self.find(query, projection).to_list(1)
        return docs[0] if docs else None

    async def count_documents(self, query: dict | None = None) -> int:
        return len(await self.find(query).to_list(None))

    async def insert_one(self, document: dict) -> WriteResult:
        doc = copy.deepcopy(document)
        key = str(doc.get("_id") or doc.get("id") or uuid.uuid4())
        await self._save(key, doc)
        return WriteResult(modified_count=1)

    async def update_one(self, query: dict, update: dict, upsert: bool = False) -> WriteResult:
        rows = [r for r in await self._all() if _matches(r["document"], query)]
        if rows:
            await self._save(rows[0]["key"], _apply_update(rows[0]["document"], update))
            return WriteResult(modified_count=1)
        if upsert:
            base = {k: v for k, v in query.items() if not k.startswith("$") and not isinstance(v, dict)}
            doc = _apply_update(base, update, inserting=True)
            await self.insert_one(doc)
            return WriteResult(modified_count=1)
        return WriteResult()

    async def update_many(self, query: dict, update: dict) -> WriteResult:
        rows = [r for r in await self._all() if _matches(r["document"], query)]
        for row in rows:
            await self._save(row["key"], _apply_update(row["document"], update))
        return WriteResult(modified_count=len(rows))

    async def find_one_and_update(self, query: dict, update: dict, upsert: bool = False, **_: Any) -> dict | None:
        rows = [r for r in await self._all() if _matches(r["document"], query)]
        if rows:
            doc = _apply_update(rows[0]["document"], update)
            await self._save(rows[0]["key"], doc)
            return doc
        if upsert:
            base = {k: v for k, v in query.items() if not k.startswith("$") and not isinstance(v, dict)}
            doc = _apply_update(base, update, inserting=True)
            await self.insert_one(doc)
            return doc
        return None

    async def _delete(self, query: dict, many: bool) -> WriteResult:
        rows = [r for r in await self._all() if _matches(r["document"], query)]
        if not many:
            rows = rows[:1]
        for row in rows:
            await self.store.request("DELETE", params={"company_id": f"eq.{get_active_company()}", "collection": f"eq.{self.name}", "key": f"eq.{row['key']}"})
        return WriteResult(deleted_count=len(rows))

    async def delete_one(self, query: dict) -> WriteResult:
        return await self._delete(query, False)

    async def delete_many(self, query: dict) -> WriteResult:
        return await self._delete(query, True)


class Store:
    def __init__(self):
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        self.base_url = url
        self.endpoint = f"{url}/rest/v1/app_documents"
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    async def resolve_public_company(self, slug: str) -> str | None:
        """Resolve a public site slug without accepting a browser supplied company UUID."""
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                f"{self.base_url}/rest/v1/company_public_booking_settings",
                params={"public_slug": f"eq.{slug}", "public_booking_enabled": "eq.true", "select": "company_id", "limit": "1"},
                headers=self.headers,
            )
        response.raise_for_status()
        rows = response.json()
        return rows[0]["company_id"] if rows else None

    async def rpc(self, function_name: str, payload: dict) -> Any:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self.base_url}/rest/v1/rpc/{function_name}",
                json=payload,
                headers=self.headers,
            )
        response.raise_for_status()
        return response.json()

    async def resolve_public_client(self, access_token: str) -> tuple[str, dict] | None:
        """Resolve a public client token and return its trusted company context."""
        rows = await self.request("GET", params={
            "collection": "eq.clients",
            "select": "company_id,document",
            "limit": "50000",
        })
        for row in rows:
            if row.get("document", {}).get("access_token") == access_token:
                return row["company_id"], row["document"]
        return None

    def __getattr__(self, name: str) -> Collection:
        return Collection(self, name)

    def __getitem__(self, name: str) -> Collection:
        return Collection(self, name)

    async def request(self, method: str, *, params: dict | None = None, json: Any = None, headers: dict | None = None) -> Any:
        merged = {**self.headers, **(headers or {})}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.request(method, self.endpoint, params=params, json=json, headers=merged)
        response.raise_for_status()
        return response.json() if response.content else []


db = Store()


class _Client:
    def close(self) -> None:
        return None


client = _Client()
