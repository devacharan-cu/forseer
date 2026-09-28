import { NOVA01_IDS } from './nova01.js'

// Canonical BEFORE-mode hero flow for NOVA-01, expressed purely as scenario
// input data. The engine knows nothing about M4 or ORD-0482; every assumption
// the numbers depend on is written here where it can be read and challenged.
const { M4, M7, LINE_2, ORD_0482 } = NOVA01_IDS

const m4UnplannedFailure = {
  machineId: M4,
  state: 'failed',
  startHours: 12,
  durationHours: 16,
  afterState: 'healthy',
  label: 'M4 unplanned failure',
}

export const HERO_SCENARIOS = Object.freeze({
  doNothing: {
    id: 'hero-do-nothing',
    name: 'Do nothing',
    description:
      'Assumption: M4 keeps running in its current at-risk condition, fails 12 h from now, and the emergency repair takes 16 h.',
    machineEvents: [m4UnplannedFailure],
    actions: [],
  },
  preventiveMaintenance: {
    id: 'hero-preventive-maintenance',
    name: 'Preventive maintenance on M4 now',
    description:
      'Assumption: a planned 2.5 h service starting now addresses the vibration, so the unplanned failure does not occur within the horizon.',
    machineEvents: [],
    actions: [{ type: 'preventive_maintenance', machineId: M4, durationHours: 2.5, startHours: 0 }],
  },
  failureWithRerouteToM7: {
    id: 'hero-reroute-to-m7',
    name: 'M4 fails; reroute ORD-0482 stamping work to M7',
    description:
      'Same failure as "Do nothing", but M7 takes over 25 units/h of M4 stamping work on Line 2 (its current spare capacity).',
    machineEvents: [m4UnplannedFailure],
    actions: [{ type: 'reroute_order', orderId: ORD_0482, fromMachineId: M4, targetMachineId: M7, loadPerHour: 25 }],
  },
  loadReduction: {
    id: 'hero-load-reduction',
    name: 'Shift part of M4 load to M7',
    description:
      'Assumption: running M4 at 50 of its usual 75 units/h avoids the failure within the horizon (FORSEER does not calculate this). M7 absorbs the 25 units/h.',
    machineEvents: [],
    actions: [{ type: 'split_workload', fromMachineId: M4, productionLineId: LINE_2, splits: [{ targetMachineId: M7, loadPerHour: 25 }] }],
  },
})

// "How long can M4 be down before ORD-0482 breaches its deadline?"
export const HERO_BREAKING_POINT_QUERY = Object.freeze({
  scenarioTemplate: HERO_SCENARIOS.doNothing,
  parameter: {
    name: 'durationHours',
    eventIndex: 0,
    min: 0,
    max: 48,
    step: 1,
    precision: 0.1,
    condition: { type: 'order_status_at_least', orderId: ORD_0482, status: 'BREACHED' },
  },
})
