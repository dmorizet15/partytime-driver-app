-- Migration 025 — extend sop_entries for Ava Studio (Session A1)
-- Adds Studio editing/versioning columns. Guarded — `version` already exists on
-- sop_entries (as TEXT, from mig 019); the IF NOT EXISTS check below correctly
-- skips re-adding it (the route does not use version, so leaving it TEXT is fine).
-- Adds: status, last_edited_by, last_edited_at.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='sop_entries' and column_name='status'
  ) then
    alter table public.sop_entries
      add column status text not null default 'published';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name='sop_entries' and column_name='version'
  ) then
    alter table public.sop_entries
      add column version integer not null default 1;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name='sop_entries' and column_name='last_edited_by'
  ) then
    alter table public.sop_entries
      add column last_edited_by uuid references public.profiles(id);
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name='sop_entries' and column_name='last_edited_at'
  ) then
    alter table public.sop_entries
      add column last_edited_at timestamptz not null default now();
  end if;
end $$;

update public.sop_entries set status = 'published'
where status is null or status = '';
