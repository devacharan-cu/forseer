# FORSEER

FORSEER is an AI-powered Industrial Resilience & Scenario Intelligence system for the "Silent Machine Breakdown" problem faced by workshops, printing units, tailoring shops and small factories.

Instead of a generic maintenance dashboard, FORSEER learns from machine history, detects emerging operational risk, simulates what could happen if nothing is done, compares preventive actions, recommends what to do, and supports recovery if a failure still occurs.

See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) for the full product concept, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the technical architecture and phase plan, and [docs/DATA_MODEL.md](docs/DATA_MODEL.md) for the database schema.

## Tech stack

- React + Vite (JavaScript/JSX)
- Supabase (PostgreSQL) via `@supabase/supabase-js`
- Plain CSS
- Deployed on Vercel

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase project URL and publishable key
npm run dev
```

The app runs at http://localhost:4327 by default (see `vite.config.js`).

### Database

The schema lives in [supabase/migrations/001_initial_forseer_schema.sql](supabase/migrations/001_initial_forseer_schema.sql) and demo data in [supabase/seed.sql](supabase/seed.sql). With the [Supabase CLI](https://supabase.com/docs/guides/cli) linked to a project:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push        # applies migrations
psql "$DATABASE_URL" -f supabase/seed.sql   # or: supabase db reset (local dev)
```

### Simulation engine

The deterministic engine in [src/engine/](src/engine/) is documented in [docs/SIMULATION_ENGINE.md](docs/SIMULATION_ENGINE.md).

```bash
npm test              # engine test suite (Node's built-in test runner)
npm run engine:demo   # prints the NOVA-01 hero scenarios computed by the engine
```

## Project status

This repository is currently at **Phase 2 — Deterministic Simulation Engine**. The database schema, seed data, `src/api/` data access layer, and the tested simulation engine are in place. No AI integration or dashboard UI has been implemented yet. See [CLAUDE.md](CLAUDE.md) for the permanent project rules guiding future phases.
