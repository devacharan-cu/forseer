# FORSEER — Simulation Engine

Code: [src/engine/](../src/engine/) · Tests: [tests/engine/](../tests/engine/) · Demo: `npm run engine:demo`

The engine turns a factory state plus a scenario into a structured, deterministic description of what happens. It is the only part of FORSEER that produces numbers. The AI layer (Phase 3) interprets, explains and proposes scenarios; it never computes or edits results.

## Design principles

- **Pure.** No database, network, AI, `Date.now()`, randomness or environment access. `tests/engine/purity.test.js` enforces this by scanning the source.
- **Deterministic.** Same input, same output, byte for byte. Time comes only from the `asOf` you pass in. All ordering uses fixed tie-breaks (natural code order, never object-insertion or locale order).
- **Immutable inputs.** Every function clones before changing anything. Tests run the engine on deep-frozen inputs.
- **Explicit assumptions.** Every threshold is in [config.js](../src/engine/config.js). Every scenario states its assumptions as data. The result repeats the assumptions it used.
- **Generic.** The engine knows nothing about NOVA-01, M4 or ORD-0482. The demo lives in [src/data/](../src/data/).
- **Fails loudly.** Bad input throws `EngineValidationError` with a list of `issues`. Unknown fields are rejected, not ignored.

## Public API ([index.js](../src/engine/index.js))

| Function | Purpose |
|---|---|
| `normalizeFactoryState(rows, { asOf })` | DB rows → canonical engine state (validated) |
| `simulateScenario(state, scenario, config?)` | Run one scenario against a baseline |
| `applyAction(state, action)` / `applyActions(state, actions)` | Return a new state with interventions applied |
| `findBreakingPoint(state, template, parameter, config?)` | Smallest downtime at which a condition happens |
| `compareScenarios(results)` | Side-by-side metric differences |
| `assessMachineRisk(state, machineId)` / `assessFactoryRisk(state)` | BEFORE-mode operational risk read |
| `findRecurringPatterns(state, machineId)` | Keyword recurrence in incident history |
| `calculateCurrentCapacity(state)` | Machine and line capacity right now |

## Factory state

`normalizeFactoryState` takes the snake_case rows that `src/api/` returns:

```js
{ machines, productionLines, machineLineAssignments, orders, maintenanceEvents, incidents, machineDependencies }
```

It checks types, the schema vocabulary, references, uniqueness and dependency cycles. It then returns camelCase records sorted in a fixed order, and adds three things:

- `machine.baselineState`: the engine state (see below).
- `machine.stageNominalPerHour`: the machine's total assigned load.
- `line.nominalCapacityPerHour`: the sum of the line's assignments.

If a line's stored `capacity_per_hour` disagrees with the sum of its assignments, the engine uses the sum and adds a warning. The state also carries `plannedMachineEvents` and `appliedActions`. Both start empty and are filled by actions.

## Machine states

| Engine state | From the database | Capacity factor |
|---|---|---|
| `healthy` | `operational` + `healthy` | 1 |
| `monitoring` | `operational` + `watch` | 1 |
| `at_risk` | `operational` + `at_risk` / `critical` | 1 |
| `degraded` | `degraded` | explicit `capacityFactor`, else `config.degradedCapacityFactor` (0.5) |
| `failed` | `down` | 0 |
| `maintenance` | `maintenance` | 0 |
| `retired` | `retired` | 0 |

An at-risk machine still produces at full capacity. Risk describes how likely trouble is. Only an explicit state change, such as a failure, reduces output.

## Capacity calculation ([capacity.js](../src/engine/capacity.js))

For each machine, evaluated in dependency order:

```
usable        = capacity_per_hour × stateFactor
demand        = sum of the machine's assigned loads (own work + work it covers for others)
ownRatio      = min(1, usable / demand)        overload is shared proportionally across its assignments
upstreamLimit = lowest stage ratio among the machines it depends on (sequential / shared_resource)
outputRatio   = min(ownRatio, upstreamLimit)
delivered     = each assigned load × outputRatio
utilization   = demand / usable                 (null when usable = 0)
stage ratio   = (its own delivered work + work others cover for it) / stageNominalPerHour
```

Line capacity is the sum of delivered loads on the line. A `stopped` line produces 0. The engine never adds up raw machine capacities: spare capacity that is not assigned to a line does not count toward that line. That prevents double counting.

**Dependencies.** `sequential` and `shared_resource` dependencies limit a machine to what its upstream stage produces. For example, when M4 fails, M5 and M6 are starved, and only the independent M7 keeps producing on Line 2. `backup` dependencies do not limit output. They mark which machines may take over each other's work.

## Time model and order calculation ([orders.js](../src/engine/orders.js), [simulation.js](../src/engine/simulation.js))

- Time is measured in hours after `asOf`. Machine events are placed on this timeline, and the timeline is split into segments wherever any machine's state changes. Capacity is constant within a segment.
- `orders.required_production_hours` means the **remaining** work, measured in hours of the line running at its nominal capacity. While a line runs at ratio *r*, an order progresses *r* line-hours per hour, scaled by `operatingHoursPerDay / 24` (default 24, which means continuous operation).
- Each line works through its open orders (`pending`, `in_progress`, `at_risk`, `late`) one at a time: **earliest deadline first**, then priority, then order number.
- The horizon is the latest open deadline (at least 24 h) plus `horizonPaddingHours` (168 h), capped at `maxHorizonHours`. An order that does not finish inside the horizon has `canComplete: false`.
- **Deadline status** is based on slack, which is the deadline minus the projected completion:

| Status | Rule (defaults) |
|---|---|
| `SAFE` | slack ≥ 12 h |
| `WARNING` | 4 h ≤ slack < 12 h |
| `CRITICAL` | 0 h ≤ slack < 4 h |
| `BREACHED` | slack < 0, or the order cannot complete within the horizon |

`quantity` is carried through but not used for timing. The seed's line capacities and order quantities are not in the same units, so the engine relies on line-hours only.

## Scenario format

```js
{
  id: 'hero-do-nothing',            // required
  name: 'Do nothing',                // optional
  description: 'Assumption: ...',    // optional, state your assumptions here
  machineEvents: [{
    machineId,                       // required
    state: 'failed',                 // any engine state
    startHours: 12,                  // default 0
    durationHours: 16,               // required: > 0, or null for "until the horizon ends"
    capacityFactor: 0.6,             // degraded only, 0 < f < 1
    afterState: 'healthy',           // optional; default = the state before the event
    label: 'M4 unplanned failure',   // optional, shown in the cascade
  }],
  actions: [ /* action objects, applied before the timeline runs */ ],
}
```

Events on the same machine may not overlap, including events created by actions. `simulateScenario` compares the scenario against a **baseline**: the same state with no scenario events and no scenario actions. Every impact is a difference from that baseline.

## Action format ([actions.js](../src/engine/actions.js))

| Type | Fields | Effect |
|---|---|---|
| `preventive_maintenance` | `machineId, durationHours, startHours?` | 0 capacity for the window, then `healthy` |
| `repair` | `machineId, durationHours, startHours?` | Same, only for a machine currently failed or degraded |
| `reroute_order` | `orderId, fromMachineId, targetMachineId, loadPerHour?` | Moves `loadPerHour` (default: all of it) of the source machine's work on the order's line to the target |
| `split_workload` | `fromMachineId, productionLineId, splits: [{ targetMachineId, loadPerHour }]` | Moves load to several machines at once |
| `reduce_machine_load` | `machineId, fraction` | Runs the machine lighter; the work is not moved, so output drops |
| `reschedule_order` | `orderId, newDeadline` | Changes the deadline (for example, after negotiating with the customer) |

A load transfer is only allowed between machines of the same `machine_type`, or between machines linked by a `backup` dependency. The target must not be failed or retired, and the transfer must not create a circular dependency. The moved work becomes a separate assignment on the target that *covers* the source machine, so it still counts toward the source machine's stage. Orders are line-level, so a reroute benefits the whole line queue in deadline order.

Whether maintenance or load reduction **prevents** a future failure is not something the engine infers. The scenario states it, either by including the failure event or by leaving it out.

## Result contract

```js
{
  engineVersion, scenarioId, scenarioName, description, asOf, horizonHours,
  summary,          // one deterministic sentence built from metrics
  assumptions,      // events, resolved actions, thresholds used
  metrics: {
    machinesAffected, linesAffected, ordersAffected,
    ordersAtRisk,           // WARNING + CRITICAL in the scenario
    deadlineBreaches,       // BREACHED in the scenario
    newDeadlineBreaches,    // BREACHED in the scenario but not in the baseline
    baselineOrdersAtRisk, baselineDeadlineBreaches,
    totalDowntimeHours,     // machine-hours at zero capacity introduced by the scenario
    capacityLossLineHours,  // production lost across lines, in nominal line-hours (negative = gained)
    secondaryRisks,
  },
  machineImpacts,   // affected machines only: state timeline, downtime, starvation, utilization, per-line loss share
  lineImpacts,      // affected lines only: nominal / start / minimum capacity, lost line-hours
  orderImpacts,     // every open order: baseline vs scenario completion, slack, status, delay
  deadlineImpacts,  // orders whose status changed (from, to, worsened/improved)
  resourceImpacts,  // secondary risks
  cascade,          // causal chain, see below
  breakingPoints,   // hard limits crossed: new breaches, machine overloads, stopped lines
  warnings,         // { code, entityId, message }
}
```

All values are plain JSON. Hours are rounded to 2 decimals and ratios to 4 decimals, only at the output.

## Cascade ([cascade.js](../src/engine/cascade.js))

A list of `{ step, source, sourceId, sourceLabel, target, targetId, targetLabel, impactType, magnitude, unit, detail? }` records, ordered by causal step:

| Step | Link | Impact types |
|---|---|---|
| 0 | scenario event / action → machine or order | `state_change`, `load_reduction`, `deadline_change` |
| 1 | machine → machine | `upstream_starvation`, `load_transfer`, `secondary_high_utilization`, `secondary_overload` |
| 2 | machine → production line | `capacity_reduction` / `capacity_increase` (line-hours) |
| 3 | production line → order | `completion_delay` / `completion_advance` / `cannot_complete` (hours) |
| 4 | order → deadline | `deadline_status_change` (slack hours, from → to) |

Line capacity is a sum, so each machine's step-2 share adds up exactly to the line's lost production.

## Secondary risks

A machine is a secondary risk when the scenario **moved extra load onto it** and its peak utilization reaches `highUtilizationThreshold` (0.9) and rises above its baseline. A machine above 1.0 is `overload`: it cannot deliver everything assigned to it, so it shares its capacity proportionally. A machine that is merely weakened by its own failure or degradation is a primary impact, not a secondary risk.

## Breaking-point search ([breakingPoint.js](../src/engine/breakingPoint.js))

```js
findBreakingPoint(state, scenarioTemplate, {
  name: 'durationHours', eventIndex: 0,
  min: 0, max: 48, step: 1, precision: 0.1,
  condition: { type: 'order_status_at_least', orderId, status: 'BREACHED' },  // or { type: 'any_new_deadline_breach' }
})
```

1. It evaluates `min`. A duration of 0 means the event is removed. If the condition already holds, the result is `found: false, reason: 'unsafe_at_minimum'`.
2. It scans `min … max` in `step` increments and stops at the first value where the condition holds. If none does, the result is `reason: 'no_breaking_point_in_range'`.
3. It runs a binary search on a grid of `precision` between the last safe and first unsafe scan values.

The result reports `breakingPoint`, meaning the smallest tested unsafe value on that grid, and `lastSafeValue`. It also reports the precision, the coarse bracket, the number of simulations, and the order status observed at both values. The true threshold lies between those two values. The engine does not claim more precision than the grid gives. The search assumes the condition does not flip back to safe inside the bracket, which holds when longer downtime can only reduce capacity. Invalid ranges and impossible templates throw.

## Scenario comparison ([comparison.js](../src/engine/comparison.js))

`compareScenarios(results)` uses the first result as the reference. It returns:

- per-metric values, deltas and which scenarios share the lowest value
- named differences: downtime, capacity loss, orders at risk, breaches, secondary risks
- per-order outcomes wherever the scenarios disagree

It deliberately does **not** pick a winner. A trade-off such as "no breach, but M7 becomes a secondary risk" is for a person or the AI layer to weigh.

## Operational risk ([risk.js](../src/engine/risk.js))

This is a sum of explicit points, built only from data FORSEER records. It is **not a failure probability**. Every result says so (`isFailureProbability: false`, plus a disclaimer).

| Signal | Points (default) |
|---|---|
| health state `watch` / `at_risk` / `critical` | 1 / 3 / 5 |
| status `degraded` | 2 |
| currently failed | 5, and the level is always CRITICAL |
| no maintenance record | 1 |
| service overdue: days since last `preventive`/`repair`/`emergency` event > interval | 2 (3 if more than 1.5× the interval) |
| unresolved incident (worst severity: low / medium / high / critical) | 1 / 2 / 3 / 5 |
| recurring incident pattern | 2 |
| pattern recurred after the last repair | 1 |
| machine overloaded (utilization > 1) | 2 |

Levels: **LOW** < 3 ≤ **MODERATE** < 6 ≤ **HIGH** < 10 ≤ **CRITICAL**. Inspections and calibrations do not reset the service interval. Only history at or before `asOf` counts. An incident resolved after `asOf` counts as open, so replaying a past date sees what was known then.

## Historical patterns ([patterns.js](../src/engine/patterns.js))

`findRecurringPatterns` counts a machine's incidents in the lookback window (180 days) whose description contains each configured keyword (vibration, temperature, …). It reports the occurrences, the first and most recent dates, the incident ids, and how many occurred after the last repair. `recurrenceDetected` means occurrences ≥ `minOccurrences` (3). This is descriptive keyword matching, not machine learning.

## NOVA-01 hero flow

[src/data/demoScenarios.js](../src/data/demoScenarios.js), run against [src/data/nova01.js](../src/data/nova01.js), which mirrors `seed.sql`. A test keeps the two in sync.

| Scenario | Downtime | Lost line-h | ORD-0482 | Secondary risks |
|---|---|---|---|---|
| Do nothing (M4 fails at +12 h for 16 h) | 16 | 13.18 | BREACHED (−3.18 h) | 0 |
| Preventive maintenance now (2.5 h) | 2.5 | 2.06 | WARNING (7.94 h) | 0 |
| Failure + reroute 25/h to M7 | 16 | 8.78 | CRITICAL (1.22 h) | M7 at 100 % |
| Shift 25/h of M4 load to M7 | 0 | 0 | WARNING (10 h) | M7 at 100 % |

Breaking point: ORD-0482 breaches once M4 is down for **12.2 h** (still safe at 12.1 h). This follows from 10 h of slack ÷ (210/255) line-hours lost per hour of downtime ≈ 12.14 h.

## Assumptions and limitations

- Line throughput is modelled as the sum of the machines' delivered loads, with dependencies acting as caps. The model does not simulate buffers, work-in-progress, changeovers, setup times or shift calendars. `operatingHoursPerDay` is one uniform scaling factor.
- Orders on a line run one at a time in earliest-deadline-first order. Real dispatching may differ.
- `required_production_hours` is taken as the remaining work at nominal line capacity. The engine does not track partial progress between snapshots.
- Degradation is a single capacity factor. The engine does not model how a machine gets worse over time.
- Overload is shared proportionally across a machine's assignments. The engine does not prioritize one line over another.
- The engine does not predict failures or their duration. Failure timing, repair length and whether an action prevents a failure are all scenario inputs.
- Risk points and thresholds are FORSEER's explicit judgement, not validated statistics.
- The breaking-point search assumes the condition does not flip back to safe inside the bracket, and it is only as precise as its grid.
