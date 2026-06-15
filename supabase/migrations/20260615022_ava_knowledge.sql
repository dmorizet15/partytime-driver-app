-- Migration 022 — ava_knowledge (Ava Studio Foundation, Session A1)
-- Verified Q&A knowledge base injected into the /api/ava/ask system prompt.
-- Authenticated users read published rows; super_admin manages all.
--
-- NOTE: RLS role check uses `'super_admin' = ANY(p.roles)` against the shared
-- DB's `profiles.roles` text[] column — NOT the spec's `profiles.role`, which
-- does not exist in this dashboard-owned shared DB (the driver-app's local
-- 20260426001 still defines a legacy `role` enum, but production migrated to a
-- `roles` array long ago; the whole codebase + migs 014/016 use this pattern).

create table if not exists public.ava_knowledge (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null default 'general',
  source text not null default 'answer_queue',
  status text not null default 'published',
  version integer not null default 1,
  last_edited_by uuid references public.profiles(id),
  last_edited_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.ava_knowledge enable row level security;

drop policy if exists "Authenticated read published" on public.ava_knowledge;
create policy "Authenticated read published"
  on public.ava_knowledge for select to authenticated
  using (status = 'published');

drop policy if exists "Super admin full access" on public.ava_knowledge;
create policy "Super admin full access"
  on public.ava_knowledge for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and 'super_admin' = any(p.roles)
  ));

insert into public.ava_knowledge
  (question, answer, category, source, status) values
  (
    'How do we stack chairs?',
    'Stack chairs seat-down so the metal underside faces up. Bundle in groups of 60.',
    'operations', 'dictated', 'published'
  ),
  (
    'What goes in the cleaner bag?',
    'Every cleaner bag: 2 bottles cleaner, 6 towels, 4 magic erasers, white caulk, repair tape + scissors, 2 spare guy ropes, zip ties. Goes on every truck every day.',
    'operations', 'dictated', 'published'
  );
