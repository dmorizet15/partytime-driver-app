-- Migration 024 — ava_vocabulary (Ava Studio Foundation, Session A1)
-- PTR-specific terminology injected into the /api/ava/ask system prompt so Ava
-- interprets jargon + aliases correctly. Authenticated read published; super_admin
-- manages all.
--
-- RLS role check: `'super_admin' = ANY(p.roles)` — see mig 022 note.

create table if not exists public.ava_vocabulary (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  definition text not null,
  aliases text[] not null default '{}',
  category text not null default 'general',
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ava_vocabulary enable row level security;

drop policy if exists "Authenticated read published" on public.ava_vocabulary;
create policy "Authenticated read published"
  on public.ava_vocabulary for select to authenticated
  using (status = 'published');

drop policy if exists "Super admin full access" on public.ava_vocabulary;
create policy "Super admin full access"
  on public.ava_vocabulary for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and 'super_admin' = any(p.roles)
  ));

insert into public.ava_vocabulary
  (term, definition, aliases, category, status) values
  ('MQ tent','Cross-cable high-peak frame tent. Requires pry bar for setup. Secured with 4 guy ropes (one per corner). Ratchets are the fallback if guy ropes unavailable.',ARRAY['MQ','high peak','high-peak','cross cable'],'equipment','published'),
  ('pole tent','Traditional tent with center and side poles. Requires one wood block per pole. Uses stakes and ratchets. Wood blocks not used on frame tents.',ARRAY['S pole','s-pole','traditional tent'],'equipment','published'),
  ('frame tent','Freestanding tent with no center poles. No wood blocks. Legs sit in base plates anchored with stakes.',ARRAY['frame','CPB','center peak buckle'],'equipment','published'),
  ('DE tent','Double-pole engineered tent. Large format pole tent (typically 60-wide) using two poles per position. Uses stake bar system instead of individual stakes.',ARRAY['double pole','double-pole engineered','60-wide'],'equipment','published'),
  ('sailcloth tent','Specialty pole tent with translucent fabric and cherry-finished aluminum poles. 44-wide only. Center poles are King (25 ft) and Queen (22 ft). Handle cherry poles carefully — scratches are visible.',ARRAY['sailcloth','sail cloth'],'equipment','published'),
  ('pry bar','Required on every tent and MQ job. Used to drive stakes. Job cannot be completed without one.',ARRAY['bar'],'equipment','published'),
  ('rhino','Electric stake driver. Required on pole tent jobs and when walls are going out. Always load the standard hammer as backup.',ARRAY['electric stake driver','stake driver'],'equipment','published'),
  ('wood blocks','Protective blocks placed under tent poles. One per pole (side and center) for all pole tents. Not used for frame tents.',ARRAY['blocks','pole blocks'],'equipment','published'),
  ('king pole','Tallest center pole on sailcloth tents (25 ft). Cherry-finished aluminum — handle carefully.',ARRAY['king'],'equipment','published'),
  ('queen pole','Second center pole on sailcloth tents (22 ft). Cherry-finished aluminum.',ARRAY['queen'],'equipment','published'),
  ('side poles','Perimeter poles on a pole tent. One wood block required per side pole. Count varies by size — e.g. 30x60 has 24 side poles.',ARRAY['perimeter poles'],'equipment','published'),
  ('guy ropes','Ropes anchoring MQ tents at corners. Standard: 4 per tent, one per corner. 2 spare guy ropes are also in every cleaner bag.',ARRAY['ropes','anchor ropes','tie ropes'],'equipment','published'),
  ('ratchets','Tensioning straps for tent tops and walls. Fallback for guy ropes on MQ tents (4 per tent). Sailcloth tent counts vary by size.',ARRAY['ratchet straps','straps'],'equipment','published'),
  ('gooseneck','Curved attachment at the top of the trailer tongue connecting trailer to truck. See SOP-001 for safe detachment.',ARRAY['goose neck','tongue'],'equipment','published'),
  ('COD','Cash on delivery. Customer owes payment at delivery. Flagged on stop card. Driver must collect before leaving.',ARRAY['cash on delivery','cash due'],'operations','published'),
  ('will call','Customer pickup from the warehouse rather than PTR delivery. Managed on the Will Call board.',ARRAY['pickup','customer pickup','willcall'],'operations','published'),
  ('WIW','When I Work — crew scheduling platform for driver and crew shift assignments. Webhook confirmed live.',ARRAY['when i work','scheduling'],'operations','published'),
  ('TapGoods','Order management system. Source of all rental orders, customer data, and route manifests. GraphQL API.',ARRAY['tap goods','order system'],'operations','published'),
  ('cleaner bag','Loaded on every truck every day. Contents: 2 bottles cleaner, 6 towels, 4 magic erasers, white caulk, repair tape + scissors, 2 spare guy ropes, zip ties.',ARRAY['cleaning bag','clean bag','bag'],'equipment','published'),
  ('wheel chocks','Wedge blocks behind trailer or generator wheels to prevent rolling. Required for restroom trailers and towable generators.',ARRAY['chocks','wedges'],'equipment','published'),
  ('hitch wood block','Block placed under trailer tongue when disconnected to keep it level. Required per restroom trailer SOP.',ARRAY['tongue block','trailer block'],'equipment','published'),
  ('purlin bars','Horizontal connecting bars on structure and clear span tents. Different hardware from standard pole tent — confirm correct bars loaded.',ARRAY['purlins','horizontal bars'],'equipment','published'),
  ('stake bar','Anchoring bar system used on DE (60-wide) tents instead of individual stakes. Confirm stake bar hardware is on the truck before loading.',ARRAY['stake bars','anchor bar'],'equipment','published'),
  ('base plates','Metal plates at the base of frame tent legs. Stakes drive through the plate holes to anchor the tent.',ARRAY['plates','foot plates'],'equipment','published'),
  ('cherry poles','Aluminum poles used in sailcloth tents with a cherry wood-tone finish. Scratches are visible and hard to repair — handle with care.',ARRAY['cherry','cherry finished','cherry aluminum'],'equipment','published');
