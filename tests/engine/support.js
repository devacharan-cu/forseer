import { buildNova01Snapshot, NOVA01_REFERENCE_AS_OF } from '../../src/data/nova01.js'
import { normalizeFactoryState } from '../../src/engine/index.js'

export const AS_OF = '2026-03-02T08:00:00.000Z'
const HOUR_MS = 3_600_000

export const atHours = (hours) => new Date(Date.parse(AS_OF) + hours * HOUR_MS).toISOString()

// One line (L1, nominal 120/h) fed by three independent presses:
//   MA 60/h (fully loaded), MB 40/h (fully loaded), MC 50/h capacity with 20/h assigned (30/h spare).
// Default orders: O1 needs 24 line-hours by +40 h; O2 needs 30 line-hours by +100 h.
export function smallFactoryRows({ orders, extraMachines = [], extraAssignments = [], dependencies = [], machineOverrides = {} } = {}) {
  const machine = (id, capacity, type = 'Press') => ({
    id,
    code: id,
    name: `Machine ${id}`,
    machine_type: type,
    status: 'operational',
    health_state: 'healthy',
    capacity_per_hour: capacity,
    maintenance_interval_days: 30,
    last_maintenance_at: atHours(-24 * 5),
    ...machineOverrides[id],
  })
  const assignment = (machineId, contribution, lineId = 'L1') => ({
    id: `${machineId}-${lineId}`,
    machine_id: machineId,
    production_line_id: lineId,
    contribution_per_hour: contribution,
    is_primary: true,
  })
  return {
    productionLines: [{ id: 'L1', code: 'L1', name: 'Line 1', capacity_per_hour: 120, status: 'active' }],
    machines: [machine('MA', 60), machine('MB', 40), machine('MC', 50), ...extraMachines],
    machineLineAssignments: [assignment('MA', 60), assignment('MB', 40), assignment('MC', 20), ...extraAssignments],
    machineDependencies: dependencies,
    orders: orders ?? [order('O1', 24, 40), order('O2', 30, 100)],
    maintenanceEvents: [],
    incidents: [],
  }
}

export function order(id, requiredHours, deadlineHours, extra = {}) {
  return {
    id,
    order_number: id,
    production_line_id: 'L1',
    quantity: 100,
    required_production_hours: requiredHours,
    priority: 'normal',
    deadline: atHours(deadlineHours),
    status: 'pending',
    ...extra,
  }
}

export function smallFactory(options) {
  return normalizeFactoryState(smallFactoryRows(options), { asOf: AS_OF })
}

export function nova01State() {
  return normalizeFactoryState(buildNova01Snapshot(NOVA01_REFERENCE_AS_OF), { asOf: NOVA01_REFERENCE_AS_OF })
}

export function failure(machineId, durationHours, startHours = 0) {
  return { machineId, state: 'failed', startHours, durationHours }
}

export function orderOutcome(result, orderId) {
  return result.orderImpacts.find((impact) => impact.orderId === orderId)
}

// Freezes every nested object, even inside already-frozen parents.
export function freezeDeep(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}
