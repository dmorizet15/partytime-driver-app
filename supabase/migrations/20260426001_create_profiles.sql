create type user_role as enum (
  'super_admin',
  'scheduler',
  'warehouse',
  'driver',
  'read_only',
  'display'
);

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         user_role not null default 'driver',
  display_name text,
  created_at   timestamptz not null default now()
);
