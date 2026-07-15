-- Non-destructive team evolution and atomic stock movements.
alter table public.company_members
  add column if not exists display_name text,
  add column if not exists invited_by uuid,
  add column if not exists invited_at timestamptz,
  add column if not exists invitation_expires_at timestamptz,
  add column if not exists joined_at timestamptz;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.company_members'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%role%' or pg_get_constraintdef(oid) ilike '%status%')
  loop
    execute format('alter table public.company_members drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.company_members
  add constraint company_members_role_check
    check (role in ('owner','admin','employee','reception','accountant')),
  add constraint company_members_status_check
    check (status in ('invited','active','suspended','inactive','disabled'));

create or replace function public.apply_stock_movement(
  p_company_id uuid,
  p_stock_key text,
  p_delta numeric,
  p_movement jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stock jsonb;
  v_before numeric;
  v_after numeric;
  v_now timestamptz := now();
  v_movement jsonb;
begin
  select document
    into v_stock
    from public.app_documents
   where company_id = p_company_id
     and collection = 'stock'
     and key = p_stock_key
   for update;

  if v_stock is null then
    raise exception 'Stock item not found';
  end if;

  v_before := round(coalesce((v_stock->>'quantity')::numeric, 0), 4);
  v_after := round(v_before + p_delta, 4);
  v_stock := jsonb_set(v_stock, '{quantity}', to_jsonb(v_after), true);
  v_stock := jsonb_set(v_stock, '{updated_at}', to_jsonb(v_now::text), true);

  update public.app_documents
     set document = v_stock,
         updated_at = v_now
   where company_id = p_company_id
     and collection = 'stock'
     and key = p_stock_key;

  v_movement := p_movement || jsonb_build_object(
    'quantity_before', v_before,
    'quantity_after', v_after,
    'quantity_delta', round(p_delta, 4),
    'created_at', v_now
  );

  insert into public.app_documents(company_id, collection, key, document, updated_at)
  values (p_company_id, 'stock_movements', v_movement->>'id', v_movement, v_now);

  return jsonb_build_object('stock_item', v_stock, 'movement', v_movement);
end;
$$;

revoke all on function public.apply_stock_movement(uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.apply_stock_movement(uuid, text, numeric, jsonb) to service_role;
