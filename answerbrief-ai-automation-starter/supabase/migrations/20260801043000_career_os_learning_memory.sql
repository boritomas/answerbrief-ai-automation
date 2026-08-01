create table if not exists public.career_os_ats_platforms (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  platform_key text not null,
  display_name text not null,
  known_selectors jsonb not null default '{}'::jsonb,
  known_steps jsonb not null default '[]'::jsonb,
  supported_operations jsonb not null default '[]'::jsonb,
  confidence_score numeric(5,2) not null default 0,
  successful_runs integer not null default 0,
  failed_runs integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_email, platform_key)
);

create table if not exists public.career_os_employer_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  employer_key text not null,
  employer_name text not null,
  ats_platform_key text,
  account_status text not null default 'unknown',
  session_status text not null default 'unknown',
  identity_verified boolean not null default false,
  resume_uploaded boolean not null default false,
  profile_completion_percent integer not null default 0,
  reusable_answers_count integer not null default 0,
  jobs_waiting integer not null default 0,
  last_successful_submission_at timestamptz,
  raw_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_email, employer_key)
);

create table if not exists public.career_os_question_memory (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  normalized_question text not null,
  question_hash text not null,
  answer_value jsonb not null,
  answer_type text not null default 'text',
  scope text not null default 'global',
  employer_key text,
  ats_platform_key text,
  confidence_score numeric(5,2) not null default 100,
  times_used integer not null default 0,
  times_accepted integer not null default 0,
  times_rejected integer not null default 0,
  requires_human_confirmation boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_email, question_hash, scope, employer_key, ats_platform_key)
);

create table if not exists public.career_os_checkpoint_memory (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  checkpoint_key text not null,
  checkpoint_type text not null,
  employer_key text,
  ats_platform_key text,
  resolution_strategy text,
  resolution_payload jsonb not null default '{}'::jsonb,
  autonomous boolean not null default false,
  confidence_score numeric(5,2) not null default 0,
  times_seen integer not null default 0,
  times_resolved integer not null default 0,
  last_seen_at timestamptz,
  last_resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_email, checkpoint_key, employer_key, ats_platform_key)
);

create table if not exists public.career_os_application_memory (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  application_id text,
  opportunity_id text,
  employer_key text,
  ats_platform_key text,
  learned_questions jsonb not null default '[]'::jsonb,
  learned_steps jsonb not null default '[]'::jsonb,
  learned_selectors jsonb not null default '{}'::jsonb,
  submission_evidence jsonb not null default '{}'::jsonb,
  outcome text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists career_os_question_memory_lookup_idx
  on public.career_os_question_memory(owner_email, question_hash, confidence_score desc);
create index if not exists career_os_checkpoint_memory_lookup_idx
  on public.career_os_checkpoint_memory(owner_email, checkpoint_type, employer_key, ats_platform_key);
create index if not exists career_os_employer_profiles_platform_idx
  on public.career_os_employer_profiles(owner_email, ats_platform_key);
create index if not exists career_os_application_memory_application_idx
  on public.career_os_application_memory(owner_email, application_id);
