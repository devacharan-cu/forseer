# FORSEER — Permanent Project Rules

FORSEER is an AI-powered Industrial Resilience & Scenario Intelligence system for the "Silent Machine Breakdown" problem: workshops, printing units, tailoring shops and small factories depend on a handful of machines, servicing is reactive, maintenance history is lost, repeated failures happen, machines fail during important orders, and downtime causes lost income, missed deadlines and expensive emergency repairs.

FORSEER is **not** a generic maintenance tracker or dashboard. It learns from machine history, detects emerging operational risk, simulates what could happen if nothing is done, compares preventive actions, recommends what to do, and supports recovery if a failure still occurs.

## Priority order

1. **BEFORE** — prevent failure
2. **AFTER** — recover + learn
3. **DURING** — understand + contain

## Core product loop

```
PAST → CURRENT STATE → RISK → FUTURE SCENARIOS → INTERVENTION → RE-PLAN → LEARN
```

## Hero capability: BEFORE mode

A machine shows warning signs. FORSEER uses history + current operational state to identify risk. The user can simulate:

- doing nothing
- preventive inspection
- preventive maintenance
- workload reduction / rerouting

FORSEER then compares the resulting futures and shows downstream impact.

We do **not** claim the AI literally knows the future. We generate conditional future scenarios using a deterministic simulation engine.

## CRITICAL architecture principle

- **AI** = interpretation, historical reasoning, scenario generation, explanation and recommendations.
- **Deterministic engine** = simulation calculations, state transitions, capacity, dependencies, order impact, deadlines, cascades and breaking points.

**The LLM must NEVER invent simulation numbers.**

## Core system model

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

## Core scenario flow

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

## Later features (not yet built)

- BEFORE risk detection + preventive scenario comparison
- AFTER recovery scenario comparison
- DURING incident understanding
- historical replay
- composite scenarios
- breaking-point analysis
- AI what-if interaction
- re-plan after applying an action

## Tech stack — fixed

- React
- Vite
- JavaScript/JSX
- Supabase PostgreSQL
- `@supabase/supabase-js`
- Vercel
- GitHub
- Plain CSS initially

**Do not use:** Next.js, Express, Lovable, Replit, Base44, or other one-click app builders.

**Do not** add libraries unless necessary and explicitly justified.

## Project structure

```
src/
  api/        # data access / Supabase queries
  ai/         # AI interpretation, scenario generation, explanations
  components/ # reusable UI components
  engine/     # deterministic simulation engine
  pages/      # top-level views
  data/       # static/reference data, seed data
  utils/      # shared helpers
  styles/     # CSS
  App.jsx
  main.jsx
  supabaseClient.js
```

## Commands

- `npm run dev` — app on http://localhost:4327
- `npm run build` / `npm run lint`
- `npm test` — engine tests (`node:test`, files in `tests/`)
- `npm run engine:demo` — NOVA-01 hero flow from the engine
- `npm run check:edge` — type-check and test the Edge Function (requires Deno)

## Engine rules

- `src/engine/` stays pure: no Supabase, network, AI, clock (`Date.now`), randomness or third-party imports. `tests/engine/purity.test.js` enforces this.
- Engine imports use explicit `.js` extensions so Node can run the tests without a bundler.
- Demo data (NOVA-01, hero scenarios) lives in `src/data/`, never in the engine. `src/data/nova01.js` must stay in sync with `supabase/seed.sql` (enforced by a test).

## AI rules

- `src/ai/` proposes, parses and explains; it never computes figures. Every number in AI output must be grounded in engine facts or the user's text (`src/ai/grounding.js`).
- All model calls go through `provider.generateStructured(...)`. Provider SDKs, model names and API keys live only in `supabase/functions/forseer-ai/`; never in `src/` or `VITE_*` variables.
- AI output is untrusted: validate schema, references and grounding; proposed actions must pass engine validation.
- AI never writes factory data; it returns drafts marked `requiresConfirmation`.
- Every AI step must degrade gracefully to engine-only behaviour. Tests use a mock provider and no network.
- `src/ai/` imports the engine only via `src/engine/index.js`, and never imports `src/api/`.

## General working rules

- Keep code beginner-readable.
- Do not over-engineer.
- Do not add unnecessary dependencies.
- Build incrementally, phase by phase; do not jump ahead to later phases without being asked.
