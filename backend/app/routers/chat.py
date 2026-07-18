"""Company and client messaging, isolated by active company."""
from datetime import datetime, timezone
import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from app.db import db, get_active_company
import httpx

router = APIRouter(tags=["chat"])

def now():
    return datetime.now(timezone.utc).isoformat()

def public_first_name(value):
    """Never expose an employee surname in the public client space."""
    clean = (value or "").strip()
    return clean.split()[0] if clean else "Coiffeur"

def ctx(request):
    value = getattr(request.state, "company", None)
    if not value:
        raise HTTPException(401, "Authentification requise")
    return value

def visible(conversation, context):
    if context.role == "owner" or context.is_platform_admin:
        return True
    return conversation.get("all_company") or context.user_id in conversation.get("participant_user_ids", [])

async def ensure_visible(cid, context):
    item = await db.chat_conversations.find_one({"id": cid})
    if not item or not visible(item, context):
        raise HTTPException(404, "Conversation introuvable")
    return item

class ConversationCreate(BaseModel):
    title: str = Field(default="", max_length=120)
    participant_user_ids: list[str] = Field(default_factory=list)
    all_company: bool = False
    with_platform_admin: bool = False
    client_id: str | None = None

class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)

@router.get("/chat/participants")
async def participants(request: Request):
    context = ctx(request)
    result = await __import__("app.routers.company_members", fromlist=["list_members"]).list_members(request)
    members = [{"id": m["user_id"], "name": m["name"], "role": m["role"]} for m in result["members"] if m["status"] == "active"]
    return {"members": members, "can_contact_platform_admin": context.role == "owner"}

@router.get("/chat/conversations")
async def conversations(request: Request):
    context = ctx(request)
    items = await db.chat_conversations.find({}).sort("updated_at", -1).to_list(None)
    items = [item for item in items if visible(item, context)]
    messages = await db.chat_messages.find({}).to_list(None)
    for item in items:
        own = [m for m in messages if m.get("conversation_id") == item["id"]]
        item["unread_count"] = sum(1 for m in own if context.user_id not in m.get("read_by", []) and m.get("sender_id") != context.user_id)
        item["last_message"] = own[-1]["body"] if own else ""
    return items

@router.post("/chat/conversations")
async def create_conversation(payload: ConversationCreate, request: Request):
    context = ctx(request)
    if payload.with_platform_admin and context.role != "owner":
        raise HTTPException(403, "Seul le propriétaire peut contacter l’administrateur")
    ids = list(dict.fromkeys([context.user_id, *payload.participant_user_ids]))
    cid = f"chat_{os.urandom(8).hex()}"
    item = {"id": cid, "title": payload.title.strip() or "Nouvelle conversation",
            "participant_user_ids": ids, "all_company": payload.all_company,
            "with_platform_admin": payload.with_platform_admin, "client_id": payload.client_id,
            "created_by": context.user_id, "created_at": now(), "updated_at": now()}
    await db.chat_conversations.insert_one(item)
    return item

@router.get("/chat/conversations/{cid}/messages")
async def messages(cid: str, request: Request):
    context = ctx(request)
    await ensure_visible(cid, context)
    items = await db.chat_messages.find({"conversation_id": cid}).sort("created_at", 1).to_list(None)
    for item in items:
        if context.user_id not in item.get("read_by", []):
            item["read_by"] = [*item.get("read_by", []), context.user_id]
            await db.chat_messages.update_one({"id": item["id"]}, {"$set": {"read_by": item["read_by"]}})
    return items

@router.post("/chat/conversations/{cid}/messages")
async def send(cid: str, payload: MessageCreate, request: Request):
    context = ctx(request)
    await ensure_visible(cid, context)
    item = {"id": f"msg_{os.urandom(9).hex()}", "conversation_id": cid,
            "sender_id": context.user_id, "sender_name": "Service technique Coiffure à domicile" if context.is_platform_admin else ("Responsable du salon" if context.role == "owner" else context.display_name),
            "sender_type": "platform_admin" if context.is_platform_admin else "member",
            "body": payload.body.strip(), "read_by": [context.user_id], "created_at": now()}
    await db.chat_messages.insert_one(item)
    await db.chat_conversations.update_one({"id": cid}, {"$set": {"updated_at": item["created_at"]}})
    return item

async def public_identity(token):
    resolved = await db.resolve_public_client(token)
    if not resolved:
        raise HTTPException(404, "Lien client invalide")
    return resolved[1]

@router.get("/public/client/{token}/chat/participants")
async def public_participants(token: str):
    await public_identity(token)
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    headers = {"apikey": secret, "Authorization": f"Bearer {secret}"}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(f"{url}/rest/v1/company_members", params={
            "company_id": f"eq.{get_active_company()}", "status": "eq.active",
            "role": "in.(owner,employee)", "select": "user_id,display_name,role", "order": "role.desc"
        }, headers=headers)
        response.raise_for_status()
    return [{"id": row["user_id"], "name": "Responsable du salon" if row["role"] == "owner" else public_first_name(row.get("display_name")), "role": row["role"]} for row in response.json()]

@router.get("/public/client/{token}/chat")
async def public_threads(token: str):
    client = await public_identity(token)
    items = await db.chat_conversations.find({"client_id": client["id"]}).sort("updated_at", -1).to_list(None)
    messages = await db.chat_messages.find({}).to_list(None)
    for item in items:
        own = [m for m in messages if m.get("conversation_id") == item["id"]]
        item["unread_count"] = sum(1 for m in own if client["id"] not in m.get("read_by", []) and m.get("sender_type") != "client")
        item["messages"] = [
            {**message, "sender_name": public_first_name(message.get("sender_name"))}
            if message.get("sender_type") == "member" and message.get("sender_name") != "Responsable du salon"
            else message
            for message in own
        ]
    return items

@router.post("/public/client/{token}/chat")
async def public_start(token: str, payload: ConversationCreate):
    client = await public_identity(token)
    cid = f"chat_{os.urandom(8).hex()}"
    item = {"id": cid, "title": payload.title.strip() or "Conversation client",
            "participant_user_ids": payload.participant_user_ids, "all_company": False,
            "with_platform_admin": False, "client_id": client["id"],
            "created_by": client["id"], "created_at": now(), "updated_at": now()}
    await db.chat_conversations.insert_one(item)
    return item

@router.post("/public/client/{token}/chat/{cid}")
async def public_send(token: str, cid: str, payload: MessageCreate):
    client = await public_identity(token)
    conversation = await db.chat_conversations.find_one({"id": cid, "client_id": client["id"]})
    if not conversation:
        raise HTTPException(404, "Conversation introuvable")
    item = {"id": f"msg_{os.urandom(9).hex()}", "conversation_id": cid,
            "sender_id": client["id"], "sender_name": client.get("first_name") or "Client",
            "sender_type": "client", "body": payload.body.strip(),
            "read_by": [client["id"]], "created_at": now()}
    await db.chat_messages.insert_one(item)
    await db.chat_conversations.update_one({"id": cid}, {"$set": {"updated_at": item["created_at"]}})
    return item
