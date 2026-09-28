# FORSEER — Product Spec (Locked)

## The official problem

Workshops, printing units, tailoring shops and small factories depend on a handful of machines. Servicing is often reactive, maintenance history is lost, repeated failures happen, machines fail during important orders, and downtime causes lost income, missed deadlines and expensive emergency repairs.

## Our interpretation

We are not building a generic maintenance tracker or dashboard.

FORSEER learns from machine history, detects emerging operational risk, simulates what could happen if nothing is done, compares preventive actions, recommends what to do, and supports recovery if a failure still occurs.

## Priority

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

## Important concept

We do **not** claim the AI literally knows the future. We generate conditional future scenarios using a deterministic simulation engine.

## Critical architecture principle

- **AI** = interpretation, historical reasoning, scenario generation, explanation and recommendations.
- **Deterministic engine** = simulation calculations, state transitions, capacity, dependencies, order impact, deadlines, cascades and breaking points.

The LLM must never invent simulation numbers.

## Core system

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

## Later features

- BEFORE risk detection + preventive scenario comparison
- AFTER recovery scenario comparison
- DURING incident understanding
- historical replay
- composite scenarios
- breaking-point analysis
- AI what-if interaction
- re-plan after applying an action
