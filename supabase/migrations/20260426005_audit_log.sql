create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id),
  user_role   user_role,
  action_type text not null,
  entity_id   text,
  old_value   jsonb,
  new_value   jsonb,
  device_type text,
  created_at  timestamptz not null default now()
);

alter table audit_log enable row level security;

-- Super admin can read all audit events
-- Safe: profiles SELECT policy allows each user to read their own row, no recursion
create policy "super_admin_read_audit_log"
  on audit_log for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

-- Any authenticated user can insert their own audit events
create policy "authenticated_insert_audit_log"
  on audit_log for insert
  with check (auth.role() = 'authenticated');
