-- Upserting an existing logo requires SELECT in addition to INSERT and UPDATE.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'company_logos_select_authenticated'
  ) then
    create policy company_logos_select_authenticated
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'company-logos');
  end if;
end
$$;
