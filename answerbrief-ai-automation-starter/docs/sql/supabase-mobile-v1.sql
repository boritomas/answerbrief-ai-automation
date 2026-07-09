-- AnswerBrief AI Mobile v1.0 Supabase schema
-- Run this in the Supabase SQL editor for the production project.
-- The server uses SUPABASE_SERVICE_ROLE_KEY for trusted writes.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key,
  user_id uuid references public.users(id) on delete set null,
  customer_email text not null,
  customer_name text,
  package_key text,
  package_name text not null,
  amount_paid integer,
  stripe_session_id text unique,
  stripe_payment_id text,
  payment_status text not null,
  intake_status text not null,
  brief_status text not null,
  delivery_status text not null,
  status text not null,
  delivery_date date,
  intake_token_hash text,
  prep_workspace_url text,
  drive_folder_id text,
  drive_folder_url text,
  drive_error text,
  generated_brief_url text,
  generated_brief_mode text,
  error_message text,
  intake jsonb,
  intake_submitted_at timestamptz,
  logs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  event text not null,
  message text,
  severity text not null default 'info' check (severity in ('info', 'warning', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  submitted_by_email text not null,
  intake jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  filename text not null,
  content_type text not null,
  size_bytes integer,
  storage_key text,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  generation_mode text,
  filename text,
  delivery_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  email text not null,
  platform text not null default 'unknown' check (platform in ('ios', 'android', 'web', 'unknown')),
  token text not null unique,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  email text not null,
  subject text,
  message text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (lower(email));
create index if not exists orders_customer_email_idx on public.orders (lower(customer_email));
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_payment_status_idx on public.orders (payment_status);
create index if not exists orders_intake_status_idx on public.orders (intake_status);
create index if not exists orders_brief_status_idx on public.orders (brief_status);
create index if not exists orders_delivery_status_idx on public.orders (delivery_status);
create index if not exists order_events_order_id_idx on public.order_events (order_id);
create index if not exists order_events_event_idx on public.order_events (event);
create index if not exists intake_submissions_order_id_idx on public.intake_submissions (order_id);
create index if not exists uploads_order_id_idx on public.uploads (order_id);
create index if not exists briefs_order_id_idx on public.briefs (order_id);
create index if not exists push_tokens_email_idx on public.push_tokens (lower(email));
create index if not exists support_requests_email_idx on public.support_requests (lower(email));
create index if not exists support_requests_status_idx on public.support_requests (status);

alter table public.users enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.intake_submissions enable row level security;
alter table public.uploads enable row level security;
alter table public.briefs enable row level security;
alter table public.push_tokens enable row level security;
alter table public.support_requests enable row level security;

-- RLS note:
-- The Next.js server currently reads/writes using SUPABASE_SERVICE_ROLE_KEY,
-- which bypasses RLS. Do not expose the service role key to clients.
-- When direct Supabase client access is added, create authenticated-user
-- policies that compare auth.jwt()->>'email' to lower(customer_email/email).

drop policy if exists "service role only users" on public.users;
create policy "service role only users"
  on public.users for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role only orders" on public.orders;
create policy "service role only orders"
  on public.orders for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role only order_events" on public.order_events;
create policy "service role only order_events"
  on public.order_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role only intake_submissions" on public.intake_submissions;
create policy "service role only intake_submissions"
  on public.intake_submissions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role only uploads" on public.uploads;
create policy "service role only uploads"
  on public.uploads for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role only briefs" on public.briefs;
create policy "service role only briefs"
  on public.briefs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role only push_tokens" on public.push_tokens;
create policy "service role only push_tokens"
  on public.push_tokens for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role only support_requests" on public.support_requests;
create policy "service role only support_requests"
  on public.support_requests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
