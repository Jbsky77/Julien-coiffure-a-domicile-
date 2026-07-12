create table if not exists public.app_documents (
  collection text not null,
  key text not null,
  document jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, key)
);

create index if not exists app_documents_collection_idx
  on public.app_documents (collection);

create index if not exists app_documents_document_gin_idx
  on public.app_documents using gin (document jsonb_path_ops);

alter table public.app_documents enable row level security;
revoke all on table public.app_documents from anon, authenticated;
grant select, insert, update, delete on table public.app_documents to service_role;

comment on table public.app_documents is
  'Private server-side document store migrated from the Emergent MongoDB application.';
