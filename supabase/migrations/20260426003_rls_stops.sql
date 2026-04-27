alter table stops enable row level security;

-- Authenticated users can read all stops
-- Granular role-based restrictions added once JWT claims are wired (post Phase 1)
create policy "authenticated_read_stops"
  on stops for select
  using (auth.role() = 'authenticated');

-- Authenticated users can update operational fields
-- Required by StopStateService in Phase 2 (OTW status writes from driver app)
create policy "authenticated_update_stops"
  on stops for update
  using  (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- INSERT and DELETE remain service-role only (partytime-sms creates all stop rows)
