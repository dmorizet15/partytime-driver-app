alter table profiles enable row level security;

-- Each authenticated user can read their own profile row
create policy "users_read_own_profile"
  on profiles for select
  using (auth.uid() = id);

-- Inserts, updates, and deletes via service role key only (admin-created accounts, no self-signup)
