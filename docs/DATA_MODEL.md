# FORSEER — Data Model

Schema: [supabase/migrations/001_initial_forseer_schema.sql](../supabase/migrations/001_initial_forseer_schema.sql)
Demo data: [supabase/seed.sql](../supabase/seed.sql)

This is a single-factory prototype (demo factory: **NOVA-01**). There is no `factories` table — every row belongs to the one demo factory, so a factory table would be an unused relationship. If FORSEER ever needs multiple factories, add it then.

## Tables

### machines

One physical machine on the shop floor.

| Column | Notes |
|---|---|
| `code` | short human ID, e.g. `M4` |
| `machine_type` | free text, e.g. `Stamping Press` |
| `status` | `operational` \| `degraded` \| `down` \| `maintenance` \| `retired` — is it running right now |
| `health_state` | `healthy` \| `watch` \| `at_risk` \| `critical` — FORSEER's current risk read on the machine |
| `capacity_per_hour` | max throughput; ≥ 0 |
| `maintenance_interval_days` | how often it should be serviced |
| `last_maintenance_at` | timestamp of most recent `maintenance_events` row for this machine |

`status` describes whether it's running; `health_state` describes how worried FORSEER is about it. A machine can be `operational` and `at_risk` at the same time — that combination is exactly what the BEFORE-mode hero scenario (machine M4) demonstrates.

### production_lines

A production line made up of several machines. `capacity_per_hour` here is the line's currently configured throughput — the sum of its machines' `machine_line_assignments.contribution_per_hour`, not their raw `capacity_per_hour`.

### machine_line_assignments

Which machines feed which line, and how much each contributes (`contribution_per_hour`). A machine's spare capacity is `machines.capacity_per_hour - machine_line_assignments.contribution_per_hour` — this is how the seed data represents machine M7 as a viable alternative that could absorb workload from M4 on Line 2, without a separate "backup capacity" column.

### orders

A production order against one line, with a `deadline` and `priority`. `status` tracks lifecycle (`pending` → `in_progress` → `completed`, or `at_risk` / `late` / `cancelled`). This is the table the future simulation engine will check deadline risk against.

### maintenance_events

Historical service record for a machine: `event_type` (`inspection` \| `preventive` \| `repair` \| `emergency` \| `calibration`), `occurred_at`, `duration_hours`, `outcome`. This is the "maintenance history" the product spec says is usually lost — FORSEER keeps it.

### incidents

A detected problem on a machine: `severity`, `status` (`open` \| `investigating` \| `resolved` \| `closed`), `detected_at` / `resolved_at`. `ai_summary` and `ai_analysis` (jsonb) are nullable and are only ever written by the AI layer (Phase 3+) — the engine and seed data never populate them.

### machine_dependencies

Machine-to-machine relationships: `machine_id` depends on `depends_on_machine_id`, typed as `sequential` (production flow order), `shared_resource`, or `backup`. The seed data uses `sequential` to encode each line's process order, and one `backup` row (M4 → M7) to encode the hero scenario's alternative machine.

### scenarios

A named what-if: `scenario_type` (`historical` \| `hypothetical` \| `composite`), `mode` (`before` \| `during` \| `after`), and `assumptions` (jsonb) — the scenario's *inputs* only (e.g. "M4 goes down on day 2"), never its results.

### scenario_impacts

Deterministic output of running a scenario through the simulation engine: projected capacity, delay, `deadline_risk`, and whether a `is_breaking_point` was crossed, optionally scoped to a machine/line/order. `effects` (jsonb) holds structured per-impact detail, not the whole application state. **Only the engine writes this table.**

### scenario_actions

A candidate intervention step attached to a scenario (`do_nothing`, `preventive_inspection`, `preventive_maintenance`, `workload_reduction`, `reroute`, `repair`, `replace`), with `sequence_order` for multi-step plans and `parameters` (jsonb) for action-specific input (e.g. reroute percentage).

### recommendations

AI-generated explanation and confidence score attached to a scenario, optionally pointing at a recommended `scenario_actions` row. `summary`, `reasoning`, and `confidence` are AI output (`generated_by = 'ai'`) that *interprets* the engine's numbers — recommendations never contain numbers the engine didn't already compute.

## Relationships (machine → line → order → deadline)

```
machines --< machine_line_assignments >-- production_lines --< orders
```

A machine's risk affects a line's real (assigned) capacity, and a line's capacity affects whether its orders can hit their deadlines. `machine_dependencies` adds machine-to-machine sequencing/backup relationships on top of that, which the future engine will use to propagate a failure through a line instead of just at a single machine.

## Deterministic engine vs. AI — which fields are which

| Concern | Owner | Fields |
|---|---|---|
| Machine/line/order state | Data (Phase 1) | everything in `machines`, `production_lines`, `machine_line_assignments`, `orders` |
| Simulation math | Engine (Phase 2), `src/engine/` | `scenario_impacts.*` (except `id`/`created_at`), `scenarios.assumptions` (input only) |
| Interpretation & recommendations | AI (Phase 3), `src/ai/` | `incidents.ai_summary`, `incidents.ai_analysis`, `recommendations.summary`, `recommendations.reasoning`, `recommendations.confidence` |

The AI layer must never write to `scenario_impacts` — that table exists specifically so simulation numbers always come from deterministic code, per [CLAUDE.md](../CLAUDE.md).

## Row Level Security

RLS is enabled on every application table. This is a hackathon prototype with no authentication, so each table has one explicit permissive policy (`using (true) with check (true)`) granted to the `anon` and `authenticated` roles — i.e. the roles reachable via the frontend's publishable key. Tighten or replace these policies before any real deployment.
