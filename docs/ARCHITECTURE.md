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

- **Phase 0 — Project Foundation** (this phase): React + Vite scaffold, folder structure, docs, environment variable placeholders, no feature logic.
- **Phase 1+ (future, not started)**: Supabase schema + `src/api/` data access, deterministic simulation engine (`src/engine/`), BEFORE-mode risk detection and scenario comparison UI, AI integration (`src/ai/`) for interpretation and recommendations, AFTER-mode recovery scenarios, DURING-mode incident understanding, historical replay, composite scenarios, breaking-point analysis, AI what-if interaction, re-plan after action.

Each phase builds only what it needs; later phases are not implemented ahead of time.
