create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

create type public.automation_mode as enum (
  'DRY_RUN',
  'REVIEW_REQUIRED',
  'AUTOPILOT'
);

create type public.opportunity_status as enum (
  'NEW',
  'FETCHED',
  'PARSED',
  'QUALIFIED',
  'REJECTED',
  'PROPOSAL_GENERATED',
  'WAITING_REVIEW',
  'APPROVED',
  'SUBMITTED',
  'FAILED',
  'DUPLICATED'
);

create type public.opportunity_decision as enum (
  'AUTO_SUBMIT',
  'REVIEW_REQUIRED',
  'REJECTED',
  'FAILED'
);

create type public.compliance_status as enum (
  'PENDING',
  'APPROVED',
  'REVIEW_REQUIRED',
  'BLOCKED'
);

create type public.submission_status as enum (
  'NOT_SUBMITTED',
  'PENDING',
  'SUBMITTED',
  'FAILED',
  'FAILED_REQUIRES_MANUAL_ACTION',
  'DUPLICATED'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  headline text,
  seniority text not null default 'fullstack',
  main_skills text[] not null default '{}',
  secondary_skills text[] not null default '{}',
  preferred_project_types text[] not null default '{}',
  blocked_project_types text[] not null default '{}',
  minimum_amount_brl numeric(10,2) not null default 150,
  minimum_daily_rate_brl numeric(10,2) not null default 120,
  default_hourly_rate_brl numeric(10,2) not null default 50,
  proposal_tone text not null default 'professional_direct',
  portfolio_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  source text not null,
  source_message_id text,
  url text not null,
  canonical_url text,
  title text,
  description text,
  category text,
  skills text[] not null default '{}',
  budget_text text,
  budget_min numeric(10,2),
  budget_max numeric(10,2),
  average_bid_amount numeric(10,2),
  average_deadline_days integer,
  proposal_count integer,
  interested_count integer,
  client_name text,
  client_rating numeric(4,2),
  client_history_text text,
  raw_payload jsonb not null default '{}'::jsonb,
  status public.opportunity_status not null default 'NEW',
  decision public.opportunity_decision,
  decision_reasons text[] not null default '{}',
  risk_flags text[] not null default '{}',
  score integer,
  matched_skills text[] not null default '{}',
  missing_skills text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_url)
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  mode public.automation_mode not null,
  amount numeric(10,2) not null,
  deadline_days integer not null,
  details_text text not null,
  technical_summary text,
  assumptions text[] not null default '{}',
  questions text[] not null default '{}',
  risks text[] not null default '{}',
  llm_provider text,
  llm_model text,
  llm_prompt_version text,
  quality_score integer,
  compliance_status public.compliance_status not null default 'PENDING',
  compliance_flags text[] not null default '{}',
  pricing_strategy text,
  pricing_explanation text,
  deadline_strategy text,
  deadline_explanation text,
  submission_status public.submission_status not null default 'NOT_SUBMITTED',
  submitted_at timestamptz,
  submission_error text,
  before_screenshot_path text,
  after_screenshot_path text,
  html_snapshot_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id)
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null,
  job_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_counters (
  id uuid primary key default gen_random_uuid(),
  counter_date date not null,
  name text not null,
  value integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (counter_date, name)
);

create index if not exists idx_user_profiles_user_id
  on public.user_profiles (user_id);

create index if not exists idx_opportunities_external_id
  on public.opportunities (external_id);

create index if not exists idx_opportunities_status
  on public.opportunities (status);

create index if not exists idx_opportunities_decision
  on public.opportunities (decision);

create index if not exists idx_opportunities_first_seen_at
  on public.opportunities (first_seen_at desc);

create index if not exists idx_opportunities_score
  on public.opportunities (score desc nulls last);

create index if not exists idx_proposals_submission_status
  on public.proposals (submission_status);

create index if not exists idx_proposals_created_at
  on public.proposals (created_at desc);

create index if not exists idx_automation_runs_type_status
  on public.automation_runs (type, status);

create index if not exists idx_automation_runs_started_at
  on public.automation_runs (started_at desc);

create index if not exists idx_automation_runs_opportunity_id
  on public.automation_runs (opportunity_id);

create index if not exists idx_daily_counters_counter_date
  on public.daily_counters (counter_date desc);

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

create trigger set_opportunities_updated_at
before update on public.opportunities
for each row
execute function public.set_updated_at();

create trigger set_proposals_updated_at
before update on public.proposals
for each row
execute function public.set_updated_at();

create trigger set_settings_updated_at
before update on public.settings
for each row
execute function public.set_updated_at();

create trigger set_daily_counters_updated_at
before update on public.daily_counters
for each row
execute function public.set_updated_at();

grant usage on schema public to authenticated;
grant usage on schema public to service_role;

grant select, insert, update on public.user_profiles to authenticated;
grant select on public.opportunities to authenticated;
grant select on public.proposals to authenticated;
grant select on public.automation_runs to authenticated;
grant select, update on public.settings to authenticated;
grant select on public.daily_counters to authenticated;

alter table public.user_profiles enable row level security;
alter table public.opportunities enable row level security;
alter table public.proposals enable row level security;
alter table public.automation_runs enable row level security;
alter table public.settings enable row level security;
alter table public.daily_counters enable row level security;

create policy "Authenticated users can read profiles"
on public.user_profiles
for select
to authenticated
using (true);

create policy "Authenticated users can insert profiles"
on public.user_profiles
for insert
to authenticated
with check (true);

create policy "Authenticated users can update profiles"
on public.user_profiles
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read opportunities"
on public.opportunities
for select
to authenticated
using (true);

create policy "Authenticated users can read proposals"
on public.proposals
for select
to authenticated
using (true);

create policy "Authenticated users can read automation runs"
on public.automation_runs
for select
to authenticated
using (true);

create policy "Authenticated users can read settings"
on public.settings
for select
to authenticated
using (true);

create policy "Authenticated users can update settings"
on public.settings
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read daily counters"
on public.daily_counters
for select
to authenticated
using (true);

insert into storage.buckets (id, name, public)
values ('proposal-audit', 'proposal-audit', false)
on conflict (id) do nothing;

create policy "Authenticated users can read proposal audit assets"
on storage.objects
for select
to authenticated
using (bucket_id = 'proposal-audit');

comment on table public.user_profiles is
  'MVP note: RLS policies are intentionally broad for the initial single-operator setup. Harden to owner-scoped policies before production multi-user usage.';

comment on table public.opportunities is
  'MVP note: read access is currently simplified to authenticated users only. Replace with tenant-aware ownership before production.';

comment on table public.proposals is
  'MVP note: read access is currently simplified to authenticated users only. Replace with tenant-aware ownership before production.';
