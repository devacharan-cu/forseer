# FORSEER — Architecture & Phase Plan

## Tech stack (fixed)

- React
- Vite
- JavaScript/JSX
- Supabase PostgreSQL
- `@supabase/supabase-js`
- Vercel
- GitHub
- Plain CSS initially

Do not use Next.js, Express, Lovable, Replit, Base44, or other one-click app builders. Do not add libraries unless necessary and explicitly justified.

## Architecture principle

AI and the simulation engine have strictly separate responsibilities:

- **AI** (`src/ai/`) — interpretation, historical reasoning, scenario generation, explanation and recommendations. Talks to an LLM.
- **Engine** (`src/engine/`) — deterministic simulation: state transitions, capacity, dependencies, order impact, deadlines, cascades, breaking points. Pure calculation, no LLM calls.

The LLM must never invent simulation numbers — all numeric results come from the deterministic engine.

## Data model

```
Factory
→ Machines
→ Production Lines
→ Orders
→ Maintenance History
→ Incidents
→ Dependencies
→ Scenarios
→ Scenario Impacts
→ Actions
→ Recommendations
```

Persisted in Supabase PostgreSQL, accessed through `src/api/`.

## Scenario flow

```
Current factory state
→ apply scenario
→ modify machine availability/state
→ recalculate production capacity
→ propagate dependencies
→ calculate order impact
→ calculate deadline risk
→ identify threshold/breaking point
→ return deterministic result
```

## Project structure

```
src/
  api/         data access / Supabase queries
  ai/          AI interpretation, scenario generation, explanations
  components/  reusable UI components
  engine/      deterministic simulation engine
  pages/       top-level views
  data/        static/reference data, seed data
  utils/       shared helpers
  styles/      CSS
  App.jsx
  main.jsx
  supabaseClient.js
```

## Phase plan

- **Phase 0 — Project Foundation** (done): React + Vite scaffold, folder structure, docs, environment variable placeholders, no feature logic.
- **Phase 1 — Backend & Data Foundation** (done): Supabase schema (`supabase/migrations/`), seed data (`supabase/seed.sql`), `src/api/` data access layer. See [DATA_MODEL.md](DATA_MODEL.md).
- **Phase 2 — Deterministic Simulation Engine** (done): pure-JS engine in `src/engine/` (capacity, dependency cascade, order/deadline impact, actions, breaking points, comparison, operational risk, incident patterns), tested with `node:test`. See [SIMULATION_ENGINE.md](SIMULATION_ENGINE.md).
- **Phase 3+ (future, not started)**: BEFORE-mode risk detection and scenario comparison UI, AI integration (`src/ai/`) for interpretation and recommendations, AFTER-mode recovery scenarios, DURING-mode incident understanding, historical replay, composite scenarios, breaking-point analysis, AI what-if interaction, re-plan after action.

Each phase builds only what it needs; later phases are not implemented ahead of time.
