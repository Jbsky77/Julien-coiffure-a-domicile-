-- Security hardening, persistent public API rate limiting and atomic formulas.

-- app_documents is an internal persistence table. Browser clients must use the
-- authenticated API, where company roles and permissions are enforced.
drop policy if exists documents_select_member on public.app_documents;
drop policy if exists documents_insert_operational on public.app_documents;
drop policy if exists documents_update_operational on public.app_documents;
drop policy if exists documents_delete_admin on public.app_documents;
revoke all on public.app_documents from anon, authenticated;
grant select, insert, update, delete on public.app_documents to service_role;

create index if not exists audit_logs_user_id_idx on public.audit_logs(user_id);
create index if not exists companies_owner_user_id_idx on public.companies(owner_user_id);

create table if not exists public.api_rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.api_rate_limits to service_role;

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit configuration';
  end if;

  insert into public.api_rate_limits(key, window_started_at, request_count, updated_at)
  values (p_key, now(), 1, now())
  on conflict (key) do update
    set request_count = case
          when api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
          else api_rate_limits.request_count + 1
        end,
        window_started_at = case
          when api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
          else api_rate_limits.window_started_at
        end,
        updated_at = now()
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

create extension if not exists pgcrypto with schema extensions;
create table if not exists public.client_public_tokens (
  token_hash text primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  unique(company_id, client_id)
);
create index if not exists client_public_tokens_lookup_idx
  on public.client_public_tokens(token_hash)
  where revoked_at is null;
alter table public.client_public_tokens enable row level security;
revoke all on public.client_public_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.client_public_tokens to service_role;

insert into public.client_public_tokens(token_hash, company_id, client_id)
select encode(extensions.digest(document->>'access_token', 'sha256'), 'hex'), company_id, document->>'id'
from public.app_documents
where collection = 'clients'
  and coalesce(document->>'access_token', '') <> ''
on conflict (company_id, client_id) do update
set token_hash = excluded.token_hash, revoked_at = null;

create or replace function public.apply_stock_formula(
  p_company_id uuid,
  p_appointment_key text,
  p_operations jsonb,
  p_product_usages jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_appointment jsonb;
  v_usages jsonb := coalesce(p_product_usages, '[]'::jsonb);
  v_operation jsonb;
  v_stock jsonb;
  v_movement jsonb;
  v_existing_movement jsonb;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_stock_key text;
  v_movement_key text;
  v_usage_id text;
  v_movements jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  select document into v_appointment
  from public.app_documents
  where company_id = p_company_id and collection = 'appointments' and key = p_appointment_key
  for update;

  if v_appointment is null then
    raise exception 'Appointment not found';
  end if;

  for v_operation in select value from jsonb_array_elements(coalesce(p_operations, '[]'::jsonb))
  loop
    v_stock_key := v_operation->>'stock_key';
    v_delta := round(coalesce((v_operation->>'delta')::numeric, 0), 4);
    v_movement := coalesce(v_operation->'movement', '{}'::jsonb);
    v_movement_key := v_movement->>'id';
    v_usage_id := v_movement->>'appointment_product_usage_id';

    if v_stock_key is null or v_movement_key is null then
      raise exception 'Invalid stock operation';
    end if;

    select document into v_existing_movement
    from public.app_documents
    where company_id = p_company_id and collection = 'stock_movements' and key = v_movement_key;

    if v_existing_movement is not null then
      v_movement := v_existing_movement;
    else
      select document into v_stock
      from public.app_documents
      where company_id = p_company_id and collection = 'stock' and key = v_stock_key
      for update;

      if v_stock is null then
        raise exception 'Stock item not found';
      end if;

      v_before := round(coalesce((v_stock->>'quantity')::numeric, 0), 4);
      v_after := round(v_before + v_delta, 4);
      if v_after < 0 then
        raise exception 'Insufficient stock for %', coalesce(v_stock->>'name', v_stock_key);
      end if;

      v_stock := jsonb_set(v_stock, '{quantity}', to_jsonb(v_after), true);
      v_stock := jsonb_set(v_stock, '{updated_at}', to_jsonb(v_now::text), true);
      update public.app_documents
      set document = v_stock, updated_at = v_now
      where company_id = p_company_id and collection = 'stock' and key = v_stock_key;

      v_movement := v_movement || jsonb_build_object(
        'quantity_before', v_before,
        'quantity_after', v_after,
        'quantity_delta', v_delta,
        'created_at', v_now
      );
      insert into public.app_documents(company_id, collection, key, document, updated_at)
      values (p_company_id, 'stock_movements', v_movement_key, v_movement, v_now);
    end if;

    v_movements := v_movements || jsonb_build_array(v_movement);
    if v_usage_id is not null then
      select coalesce(jsonb_agg(
        case when item->>'id' = v_usage_id then item || jsonb_build_object(
          'stock_before', v_movement->'quantity_before',
          'stock_after', v_movement->'quantity_after',
          'updated_at', v_now
        ) || case
          when item->>'consumption_status' = 'reversed'
            then jsonb_build_object('reversal_movement_id', v_movement_key)
          else jsonb_build_object('stock_movement_id', v_movement_key)
        end else item end
      ), '[]'::jsonb)
      into v_usages
      from jsonb_array_elements(v_usages) item;
    end if;
  end loop;

  v_appointment := jsonb_set(v_appointment, '{product_usages}', v_usages, true);
  update public.app_documents
  set document = v_appointment, updated_at = v_now
  where company_id = p_company_id and collection = 'appointments' and key = p_appointment_key;

  return jsonb_build_object(
    'appointment', v_appointment,
    'product_usages', v_usages,
    'movements', v_movements
  );
end;
$$;
revoke all on function public.apply_stock_formula(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_stock_formula(uuid, text, jsonb, jsonb) to service_role;
