// The NOVA-01 demo factory from supabase/seed.sql, as the same snake_case rows
// src/api/ returns, with every timestamp placed relative to `asOf` exactly as the
// seed places them relative to now(). tests/engine/seedConsistency.test.js keeps
// the two in sync.

const DAY_MS = 86_400_000

// A fixed reference time so tests and the engine demo are reproducible.
export const NOVA01_REFERENCE_AS_OF = '2026-09-28T08:00:00.000Z'

const pad = (n) => String(n).padStart(12, '0')
export const lineId = (n) => `a0000000-0000-0000-0000-${pad(n)}`
export const machineId = (n) => `b0000000-0000-0000-0000-${pad(n)}`
export const orderId = (orderNumber) => `c0000000-0000-0000-0000-${pad(Number(orderNumber.slice(4)))}`

export const NOVA01_IDS = Object.freeze({
  LINE_2: lineId(2),
  M4: machineId(4),
  M7: machineId(7),
  ORD_0482: orderId('ORD-0482'),
})

const LINES = [
  [1, 'LINE-1', 'Line 1 — Assembly', 210],
  [2, 'LINE-2', 'Line 2 — Fabrication', 255],
  [3, 'LINE-3', 'Line 3 — Finishing & Packaging', 395],
]

// [n, name, type, health, capacity/h, interval days, last maintenance days ago]
const MACHINES = [
  [1, 'CNC Mill A', 'CNC Mill', 'healthy', 60, 90, 15],
  [2, 'CNC Mill B', 'CNC Mill', 'healthy', 60, 90, 10],
  [3, 'Welding Robot', 'Welding Robot', 'watch', 50, 60, 25],
  [4, 'Stamping Press A', 'Stamping Press', 'at_risk', 80, 45, 5],
  [5, 'Injection Molder', 'Injection Molder', 'healthy', 70, 60, 12],
  [6, 'Hydraulic Press', 'Hydraulic Press', 'healthy', 65, 60, 20],
  [7, 'Stamping Press B', 'Stamping Press', 'healthy', 70, 45, 18],
  [8, 'Packaging Machine', 'Packaging Machine', 'healthy', 90, 30, 8],
  [9, 'Sealing Machine', 'Sealing Machine', 'watch', 85, 30, 12],
  [10, 'Labeling Machine', 'Labeling Machine', 'healthy', 100, 45, 20],
  [11, 'Quality Inspection Station', 'Inspection Station', 'healthy', 120, 90, 50],
  [12, 'Laser Cutter', 'Laser Cutter', 'healthy', 40, 120, 60],
]

// [machine n, line n, contribution/h]
const ASSIGNMENTS = [
  [1, 1, 60],
  [2, 1, 60],
  [3, 1, 50],
  [12, 1, 40],
  [4, 2, 75],
  [5, 2, 70],
  [6, 2, 65],
  [7, 2, 45],
  [8, 3, 90],
  [9, 3, 85],
  [10, 3, 100],
  [11, 3, 120],
]

// [machine n, depends on machine n, type, notes]
const DEPENDENCIES = [
  [2, 1, 'sequential', 'CNC Mill B receives parts milled by CNC Mill A.'],
  [3, 2, 'sequential', 'Welding Robot welds parts milled upstream.'],
  [12, 3, 'sequential', 'Laser Cutter trims welded assemblies.'],
  [5, 4, 'sequential', 'Injection Molder receives stamped components from Stamping Press A.'],
  [6, 5, 'sequential', 'Hydraulic Press forms molded parts.'],
  [9, 8, 'sequential', 'Sealing Machine seals packaged output.'],
  [10, 9, 'sequential', 'Labeling Machine labels sealed units.'],
  [11, 10, 'sequential', 'Quality Inspection Station checks labeled units before dispatch.'],
  [4, 7, 'backup', 'Stamping Press B carries spare capacity that could absorb Line 2 workload if Stamping Press A is degraded or down.'],
]

// [order number, line n, quantity, remaining line-hours, priority, deadline days from asOf, status]
const ORDERS = [
  ['ORD-0470', 1, 2000, 40, 'normal', -20, 'completed'],
  ['ORD-0471', 1, 1500, 30, 'normal', -10, 'completed'],
  ['ORD-0472', 1, 3000, 12, 'high', -2, 'late'],
  ['ORD-0473', 1, 1800, 35, 'normal', 3, 'in_progress'],
  ['ORD-0474', 1, 2200, 42, 'high', 6, 'in_progress'],
  ['ORD-0475', 1, 1200, 25, 'low', 10, 'pending'],
  ['ORD-0476', 1, 2600, 48, 'normal', 15, 'pending'],
  ['ORD-0477', 1, 1900, 34, 'normal', 21, 'pending'],
  ['ORD-0478', 2, 4000, 70, 'normal', -15, 'completed'],
  ['ORD-0479', 2, 3200, 60, 'high', -5, 'completed'],
  ['ORD-0480', 2, 5000, 30, 'high', 2, 'in_progress'],
  ['ORD-0481', 2, 2800, 18, 'normal', 5, 'in_progress'],
  ['ORD-0482', 2, 6000, 56, 'critical', 4, 'at_risk'],
  ['ORD-0483', 2, 3400, 62, 'normal', 9, 'pending'],
  ['ORD-0484', 2, 2600, 48, 'normal', 14, 'pending'],
  ['ORD-0485', 2, 3000, 55, 'high', 18, 'pending'],
  ['ORD-0486', 3, 5000, 45, 'normal', -8, 'completed'],
  ['ORD-0487', 3, 4200, 10, 'normal', -1, 'late'],
  ['ORD-0488', 3, 6000, 40, 'high', 3, 'in_progress'],
  ['ORD-0489', 3, 3800, 34, 'normal', 8, 'pending'],
  ['ORD-0490', 3, 5200, 46, 'normal', 13, 'pending'],
  ['ORD-0491', 3, 4600, 40, 'low', 20, 'pending'],
]

// [machine n, type, description, days ago, duration h, outcome]
const MAINTENANCE_EVENTS = [
  [4, 'preventive', 'Scheduled preventive maintenance service.', 120, 3, 'resolved'],
  [4, 'inspection', 'Routine inspection — minor vibration noted in spindle housing.', 75, 1.5, 'partial'],
  [4, 'repair', 'Bearing replacement due to elevated vibration levels.', 50, 5, 'resolved'],
  [4, 'inspection', 'Follow-up inspection after recurring vibration complaints — levels still above baseline.', 5, 2, 'partial'],
  [1, 'preventive', 'Scheduled preventive maintenance service.', 60, 3, 'resolved'],
  [1, 'inspection', 'Routine inspection.', 15, 1, 'no_issue_found'],
  [2, 'preventive', 'Scheduled preventive maintenance service.', 55, 3, 'resolved'],
  [2, 'calibration', 'Routine calibration check.', 10, 1, 'resolved'],
  [3, 'inspection', 'Routine inspection — alignment drift noted.', 40, 1.5, 'partial'],
  [3, 'repair', 'Weld arm realignment.', 25, 4, 'resolved'],
  [5, 'preventive', 'Scheduled preventive maintenance service.', 45, 3, 'resolved'],
  [5, 'inspection', 'Routine inspection.', 12, 1, 'no_issue_found'],
  [6, 'preventive', 'Scheduled preventive maintenance service.', 50, 3, 'resolved'],
  [6, 'inspection', 'Routine inspection.', 20, 1, 'no_issue_found'],
  [7, 'preventive', 'Scheduled preventive maintenance service.', 40, 3, 'resolved'],
  [7, 'inspection', 'Routine inspection.', 18, 1, 'no_issue_found'],
  [8, 'preventive', 'Scheduled preventive maintenance service.', 35, 2.5, 'resolved'],
  [8, 'inspection', 'Routine inspection.', 8, 1, 'no_issue_found'],
  [9, 'inspection', 'Routine inspection — temperature fluctuation noted.', 30, 1.5, 'partial'],
  [9, 'repair', 'Thermostat replaced.', 12, 3, 'resolved'],
  [10, 'preventive', 'Scheduled preventive maintenance service.', 42, 2.5, 'resolved'],
  [10, 'inspection', 'Routine inspection.', 20, 1, 'no_issue_found'],
  [11, 'preventive', 'Scheduled preventive maintenance service.', 50, 2, 'resolved'],
  [12, 'calibration', 'Routine calibration check.', 60, 1.5, 'resolved'],
]

// [machine n, description, severity, status, detected days ago, resolved days ago | null]
const INCIDENTS = [
  [4, 'Operator reported unusual vibration during high-speed stamping cycles.', 'low', 'resolved', 70, 65],
  [4, 'Vibration levels exceeded warning threshold during shift; production paused briefly.', 'medium', 'resolved', 51, 50],
  [4, 'Recurring vibration detected again post-repair, intermittent.', 'medium', 'resolved', 20, 18],
  [4, 'Vibration levels rising again during peak load while running Order ORD-0482.', 'high', 'open', 3, null],
  [3, 'Weld seam alignment drifting out of tolerance.', 'low', 'resolved', 38, 36],
  [3, 'Minor spark irregularity observed during welding pass.', 'low', 'resolved', 10, 9],
  [9, 'Sealing temperature dipped below spec, minor overheating on restart.', 'low', 'resolved', 60, 60],
  [9, 'Sealing temperature fluctuation caused several under-sealed units.', 'medium', 'resolved', 13, 12],
  [1, 'Unusual noise from spindle during operation.', 'low', 'resolved', 55, 54],
  [6, 'Hydraulic pressure fluctuation during press cycle.', 'low', 'resolved', 45, 44],
  [8, 'Packaging feed jam cleared by operator.', 'low', 'resolved', 33, 33],
  [11, 'Inspection station calibration drift flagged by daily check.', 'low', 'resolved', 58, 57],
]

export const NOVA01_SEED_TABLES = Object.freeze({ LINES, MACHINES, ASSIGNMENTS, DEPENDENCIES, ORDERS, MAINTENANCE_EVENTS, INCIDENTS })

export function buildNova01Snapshot(asOf = NOVA01_REFERENCE_AS_OF) {
  const asOfMs = Date.parse(asOf)
  if (Number.isNaN(asOfMs)) throw new Error('buildNova01Snapshot needs a valid asOf timestamp')
  const at = (days) => new Date(asOfMs + days * DAY_MS).toISOString()

  return {
    productionLines: LINES.map(([n, code, name, capacity]) => ({
      id: lineId(n),
      code,
      name,
      capacity_per_hour: capacity,
      status: 'active',
    })),
    machines: MACHINES.map(([n, name, type, health, capacity, interval, daysAgo]) => ({
      id: machineId(n),
      code: `M${n}`,
      name,
      machine_type: type,
      status: 'operational',
      health_state: health,
      capacity_per_hour: capacity,
      maintenance_interval_days: interval,
      last_maintenance_at: at(-daysAgo),
    })),
    machineLineAssignments: ASSIGNMENTS.map(([m, l, contribution]) => ({
      id: `mla-M${m}-LINE-${l}`,
      machine_id: machineId(m),
      production_line_id: lineId(l),
      contribution_per_hour: contribution,
      is_primary: true,
    })),
    machineDependencies: DEPENDENCIES.map(([m, upstream, type, notes]) => ({
      id: `dep-M${m}-M${upstream}`,
      machine_id: machineId(m),
      depends_on_machine_id: machineId(upstream),
      dependency_type: type,
      notes,
    })),
    orders: ORDERS.map(([orderNumber, l, quantity, hours, priority, days, status]) => ({
      id: orderId(orderNumber),
      order_number: orderNumber,
      production_line_id: lineId(l),
      quantity,
      required_production_hours: hours,
      priority,
      deadline: at(days),
      status,
    })),
    maintenanceEvents: MAINTENANCE_EVENTS.map(([m, type, description, daysAgo, duration, outcome], index) => ({
      id: `mnt-${String(index + 1).padStart(2, '0')}`,
      machine_id: machineId(m),
      event_type: type,
      description,
      occurred_at: at(-daysAgo),
      duration_hours: duration,
      outcome,
    })),
    incidents: INCIDENTS.map(([m, description, severity, status, detectedDaysAgo, resolvedDaysAgo], index) => ({
      id: `inc-${String(index + 1).padStart(2, '0')}`,
      machine_id: machineId(m),
      description,
      severity,
      status,
      detected_at: at(-detectedDaysAgo),
      resolved_at: resolvedDaysAgo === null ? null : at(-resolvedDaysAgo),
    })),
  }
}
