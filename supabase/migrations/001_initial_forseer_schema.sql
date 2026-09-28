-- FORSEER Phase 1: initial backend & data foundation
-- Represents a single-factory prototype (NOVA-01). No factories table:
-- this is a deliberate simplification — every row belongs to the one
-- demo factory, and a factories table would be an unused relationship.
--
-- Table order: machines, production_lines, machine_line_assignments,
-- orders, maintenance_events, incidents, machine_dependencies,
-- scenarios, scenario_impacts, scenario_actions, recommendations.

-- gen_random_uuid() has been a built-in Postgres function since v13
-- (no pgcrypto extension needed); Supabase runs a newer version.

-- Shared trigger to keep updated_at current on any UPDATE.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ==========================================================
-- machines
-- ==========================================================
create table machines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  machine_type text not null,
  status text not null default 'operational'
    check (status in ('operational', 'degraded', 'down', 'maintenance', 'retired')),
  health_state text not null default 'healthy'
    check (health_state in ('healthy', 'watch', 'at_risk', 'critical')),
  capacity_per_hour numeric not null check (capacity_per_hour >= 0),
  maintenance_interval_days integer not null check (maintenance_interval_days >= 0),
  last_maintenance_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_machines_status on machines (status);
create index idx_machines_health_state on machines (health_state);

create trigger trg_machines_updated_at
  before update on machines
  for each row execute function set_updated_at();

-- ==========================================================
-- production_lines
-- ==========================================================
create table production_lines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  capacity_per_hour numeric not null check (capacity_per_hour >= 0),
  status text not null default 'active'
    check (status in ('active', 'reduced', 'stopped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_production_lines_status on production_lines (status);

create trigger trg_production_lines_updated_at
  before update on production_lines
  for each row execute function set_updated_at();

-- ==========================================================
-- machine_line_assignments
-- which machines contribute to which lines, and by how much.
-- A machine can be assigned to more than one line (e.g. a backup
-- machine whose spare capacity could be redirected to another line).
-- ==========================================================
create table machine_line_assignments (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines (id) on delete cascade,
  production_line_id uuid not null references production_lines (id) on delete cascade,
  contribution_per_hour numeric not null check (contribution_per_hour >= 0),
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (machine_id, production_line_id)
);

create index idx_mla_machine_id on machine_line_assignments (machine_id);
create index idx_mla_production_line_id on machine_line_assignments (production_line_id);

-- ==========================================================
-- orders
-- ==========================================================
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  production_line_id uuid not null references production_lines (id),
  quantity integer not null check (quantity >= 0),
  required_production_hours numeric not null check (required_production_hours >= 0),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  deadline timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'at_risk', 'completed', 'cancelled', 'late')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_orders_production_line_id on orders (production_line_id);
create index idx_orders_deadline on orders (deadline);
create index idx_orders_status on orders (status);

create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- ==========================================================
-- maintenance_events
-- ==========================================================
create table maintenance_events (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines (id) on delete cascade,
  event_type text not null
    check (event_type in ('inspection', 'preventive', 'repair', 'emergency', 'calibration')),
  description text,
  occurred_at timestamptz not null,
  duration_hours numeric check (duration_hours >= 0),
  outcome text
    check (outcome in ('resolved', 'partial', 'no_issue_found', 'failed', 'pending')),
  created_at timestamptz not null default now()
);

create index idx_maintenance_events_machine_id on maintenance_events (machine_id);
create index idx_maintenance_events_occurred_at on maintenance_events (occurred_at);

-- ==========================================================
-- incidents
-- ai_summary / ai_analysis are populated later by the AI layer
-- (Phase 3+); they are nullable and never written by the engine.
-- ==========================================================
create table incidents (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines (id) on delete cascade,
  description text not null,
  severity text not null
    check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'investigating', 'resolved', 'closed')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  ai_summary text,
  ai_analysis jsonb,
  created_at timestamptz not null default now()
);

create index idx_incidents_machine_id on incidents (machine_id);
create index idx_incidents_status on incidents (status);
create index idx_incidents_detected_at on incidents (detected_at);

-- ==========================================================
-- machine_dependencies
-- machine_id's operation depends on depends_on_machine_id.
-- ==========================================================
create table machine_dependencies (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines (id) on delete cascade,
  depends_on_machine_id uuid not null references machines (id) on delete cascade,
  dependency_type text not null default 'sequential'
    check (dependency_type in ('sequential', 'shared_resource', 'backup')),
  notes text,
  created_at timestamptz not null default now(),
  check (machine_id <> depends_on_machine_id),
  unique (machine_id, depends_on_machine_id)
);

create index idx_machine_dependencies_machine_id on machine_dependencies (machine_id);
create index idx_machine_dependencies_depends_on on machine_dependencies (depends_on_machine_id);

-- ==========================================================
-- scenarios
-- assumptions holds flexible, scenario-specific input (e.g. which
-- machine goes down, workload shift %) — never simulation output.
-- ==========================================================
create table scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scenario_type text not null
    check (scenario_type in ('historical', 'hypothetical', 'composite')),
  mode text
    check (mode in ('before', 'during', 'after')),
  description text,
  assumptions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_scenarios_scenario_type on scenarios (scenario_type);

create trigger trg_scenarios_updated_at
  before update on scenarios
  for each row execute function set_updated_at();

-- ==========================================================
-- scenario_impacts
-- Deterministic simulation output, written only by the engine
-- (Phase 2). effects holds structured per-impact detail (e.g.
-- capacity breakdown by hour) — not free-form application state.
-- ==========================================================
create table scenario_impacts (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios (id) on delete cascade,
  machine_id uuid references machines (id) on delete set null,
  production_line_id uuid references production_lines (id) on delete set null,
  order_id uuid references orders (id) on delete set null,
  projected_capacity_per_hour numeric,
  projected_delay_hours numeric,
  deadline_risk text
    check (deadline_risk in ('none', 'low', 'medium', 'high', 'breach')),
  is_breaking_point boolean not null default false,
  effects jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);

create index idx_scenario_impacts_scenario_id on scenario_impacts (scenario_id);
create index idx_scenario_impacts_order_id on scenario_impacts (order_id);

-- ==========================================================
-- scenario_actions
-- Candidate intervention steps proposed for a scenario.
-- parameters holds action-specific structured input (e.g. reroute
-- percentage), not simulation results.
-- ==========================================================
create table scenario_actions (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios (id) on delete cascade,
  action_type text not null
    check (action_type in (
      'do_nothing', 'preventive_inspection', 'preventive_maintenance',
      'workload_reduction', 'reroute', 'repair', 'replace'
    )),
  target_machine_id uuid references machines (id) on delete set null,
  target_production_line_id uuid references production_lines (id) on delete set null,
  sequence_order integer not null default 1 check (sequence_order >= 1),
  parameters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_scenario_actions_scenario_id on scenario_actions (scenario_id);

-- ==========================================================
-- recommendations
-- AI-generated reasoning over deterministic scenario results
-- (Phase 3). summary/reasoning/confidence are AI output; they
-- reference — but never replace — the engine's numeric results.
-- ==========================================================
create table recommendations (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios (id) on delete cascade,
  recommended_action_id uuid references scenario_actions (id) on delete set null,
  summary text not null,
  reasoning text,
  confidence numeric check (confidence >= 0 and confidence <= 1),
  generated_by text not null default 'ai'
    check (generated_by in ('ai', 'system')),
  created_at timestamptz not null default now()
);

create index idx_recommendations_scenario_id on recommendations (scenario_id);

-- ==========================================================
-- Row Level Security
-- Hackathon prototype, no authentication yet: every application
-- table gets RLS enabled with an explicit, permissive policy for
-- the anon/authenticated roles used by the frontend's publishable
-- key. Tighten these policies before any real deployment.
-- ==========================================================
alter table machines enable row level security;
alter table production_lines enable row level security;
alter table machine_line_assignments enable row level security;
alter table orders enable row level security;
alter table maintenance_events enable row level security;
alter table incidents enable row level security;
alter table machine_dependencies enable row level security;
alter table scenarios enable row level security;
alter table scenario_impacts enable row level security;
alter table scenario_actions enable row level security;
alter table recommendations enable row level security;

create policy "prototype_all_machines" on machines
  for all to anon, authenticated using (true) with check (true);
create policy "prototype_all_production_lines" on production_lines
  for all to anon, authenticated using (true) with check (true);
create policy "prototype_all_machine_line_assignments" on machine_line_assignments
  for all to anon, authenticated using (true) with check (true);
create policy "prototype_all_orders" on orders
  for all to anon, authenticated using (true) with check (true);
create policy "prototype_all_maintenance_events" on maintenance_events
  for all to anon, authenticated using (true) with check (true);
create policy "prototype_all_incidents" on incidents
  for all to anon, authenticated using (true) with check (true);
create policy "prototype_all_machine_dependencies" on machine_dependencies
  for all to anon, authenticated using (true) with check (true);
create policy "prototype_all_scenarios" on scenarios
  for all to anon, authenticated using (true) with check (true);
create policy "prototype_all_scenario_impacts" on scenario_impacts
  for all to anon, authenticated using (true) with check (true);
create policy "prototype_all_scenario_actions" on scenario_actions
  for all to anon, authenticated using (true) with check (true);
create policy "prototype_all_recommendations" on recommendations
  for all to anon, authenticated using (true) with check (true);

-- RLS policies only take effect once the role can reach the table at
-- all — Postgres checks GRANTs first. Supabase's platform normally
-- grants these by default, but stating them here keeps the migration
-- self-contained and correct on any Postgres instance.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
