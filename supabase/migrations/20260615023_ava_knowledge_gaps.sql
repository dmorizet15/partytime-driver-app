-- Migration 023 — ava_knowledge_gaps (Ava Studio Foundation, Session A1)
-- Queue of questions Ava couldn't answer confidently (UNKNOWN: signal). Drivers
-- insert + read their own; super_admin manages all (the answer-queue UI lives in
-- the dashboard). Server inserts via the service-role client (bypasses RLS).
--
-- RLS role check: `'super_admin' = ANY(p.roles)` — see mig 022 note.

create table if not exists public.ava_knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  asked_by uuid references public.profiles(id),
  surface text not null default 'driver_home',
  context jsonb,
  answer text,
  answered_by uuid references public.profiles(id),
  answered_at timestamptz,
  is_answered boolean not null default false,
  knowledge_id uuid references public.ava_knowledge(id),
  created_at timestamptz not null default now()
);

alter table public.ava_knowledge_gaps enable row level security;

drop policy if exists "Drivers insert own gaps" on public.ava_knowledge_gaps;
create policy "Drivers insert own gaps"
  on public.ava_knowledge_gaps for insert to authenticated
  with check (auth.uid() = asked_by);

drop policy if exists "Drivers read own gaps" on public.ava_knowledge_gaps;
create policy "Drivers read own gaps"
  on public.ava_knowledge_gaps for select to authenticated
  using (asked_by = auth.uid());

drop policy if exists "Super admin full access" on public.ava_knowledge_gaps;
create policy "Super admin full access"
  on public.ava_knowledge_gaps for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and 'super_admin' = any(p.roles)
  ));
