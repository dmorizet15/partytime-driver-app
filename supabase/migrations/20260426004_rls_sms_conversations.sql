alter table sms_conversations enable row level security;

-- Authenticated users can read SMS conversations
-- Role-based restrictions (scheduler/super_admin only) added once JWT claims are wired
create policy "authenticated_read_sms_conversations"
  on sms_conversations for select
  using (auth.role() = 'authenticated');

-- All writes via service role key only (partytime-sms owns this table)
