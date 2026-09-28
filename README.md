# FORSEER

FORSEER is an AI-powered Industrial Resilience & Scenario Intelligence system for the "Silent Machine Breakdown" problem faced by workshops, printing units, tailoring shops and small factories.

Instead of a generic maintenance dashboard, FORSEER learns from machine history, detects emerging operational risk, simulates what could happen if nothing is done, compares preventive actions, recommends what to do, and supports recovery if a failure still occurs.

See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) for the full product concept and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the technical architecture and phase plan.

## Tech stack

- React + Vite (JavaScript/JSX)
- Supabase (PostgreSQL) via `@supabase/supabase-js`
- Plain CSS
- Deployed on Vercel

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase project values
npm run dev
```

The app runs at http://localhost:5173 by default.

## Project status

This repository is currently at **Phase 0 — Project Foundation**. No AI integration, simulation engine, or dashboard UI has been implemented yet. See [CLAUDE.md](CLAUDE.md) for the permanent project rules guiding future phases.
