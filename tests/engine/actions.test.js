import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NOVA01_IDS } from '../../src/data/nova01.js'
import { applyAction, applyActions, EngineValidationError, simulateScenario } from '../../src/engine/index.js'
import { AS_OF, atHours, failure, freezeDeep, nova01State, order, orderOutcome, smallFactory } from './support.js'

const reroute = (loadPerHour, targetMachineId = 'MC') => ({
  type: 'reroute_order',
  orderId: 'O1',
  fromMachineId: 'MA',
  targetMachineId,
  ...(loadPerHour === undefined ? {} : { loadPerHour }),
})

describe('applyAction', () => {
  it('returns a new state and leaves the original untouched', () => {
    const state = freezeDeep(smallFactory())
    const before = JSON.stringify(state)
    const next = applyAction(state, reroute(30))
    assert.notEqual(next, state)
    assert.equal(JSON.stringify(state), before)
    assert.equal(next.appliedActions.length, 1)
    const ma = next.machineLineAssignments.find((a) => a.machineId === 'MA' && a.coversMachineId === null)
    const cover = next.machineLineAssignments.find((a) => a.machineId === 'MC' && a.coversMachineId === 'MA')
    assert.equal(ma.contributionPerHour, 30)
    assert.equal(cover.contributionPerHour, 30)
  })

  it('a planned action becomes part of the baseline when applied before simulating', () => {
    const planned = applyAction(smallFactory(), { type: 'preventive_maintenance', machineId: 'MA', durationHours: 3 })
    const result = simulateScenario(planned, { id: 'after-plan' })
    assert.equal(result.metrics.totalDowntimeHours, 0)
    assert.equal(orderOutcome(result, 'O1').baseline.completionHours, 25.5)
  })
})

describe('reroute_order', () => {
  it('moves work to an alternative machine and recovers line capacity', () => {
    const withoutReroute = simulateScenario(smallFactory(), { id: 'plain', machineEvents: [failure('MA', 10)] })
    const withReroute = simulateScenario(smallFactory(), { id: 'reroute', machineEvents: [failure('MA', 10)], actions: [reroute(30)] })
    // During the failure: MB 40 + MC 20 own + 30 covered = 90/h instead of 60/h.
    assert.equal(withReroute.lineImpacts[0].minCapacityPerHour, 90)
    assert.equal(withReroute.metrics.capacityLossLineHours, 2.5)
    assert.equal(orderOutcome(withoutReroute, 'O1').scenario.completionHours, 29)
    assert.equal(orderOutcome(withReroute, 'O1').scenario.completionHours, 26.5)
    assert.ok(withReroute.cascade.some((link) => link.impactType === 'load_transfer' && link.sourceLabel === 'MA' && link.targetLabel === 'MC'))
  })

  it('flags the alternative machine as a secondary risk when it reaches the utilization threshold', () => {
    const result = simulateScenario(smallFactory(), { id: 'reroute', machineEvents: [failure('MA', 10)], actions: [reroute(30)] })
    assert.deepEqual(result.resourceImpacts.map((risk) => [risk.code, risk.riskType, risk.baselinePeakUtilization, risk.scenarioPeakUtilization]), [
      ['MC', 'high_utilization', 0.4, 1],
    ])
    assert.deepEqual(result.resourceImpacts[0].coveringForCodes, ['MA'])
    assert.equal(result.metrics.secondaryRisks, 1)
    assert.ok(result.cascade.some((link) => link.impactType === 'secondary_high_utilization'))
  })

  it('an overloaded alternative machine becomes a secondary risk and a breaking point', () => {
    // Moving all 60/h onto MC (50/h capacity, 20/h already assigned) asks 80/h of it.
    const result = simulateScenario(smallFactory(), { id: 'overload', actions: [reroute(60)] })
    const mc = result.resourceImpacts[0]
    assert.equal(mc.riskType, 'overload')
    assert.equal(mc.scenarioPeakUtilization, 1.6)
    assert.ok(result.breakingPoints.some((point) => point.condition === 'machine_overload' && point.label === 'MC'))
    // MC shares its 50/h proportionally: line = MB 40 + MC 50 = 90/h, even though MA is healthy.
    assert.equal(result.lineImpacts[0].minCapacityPerHour, 90)
  })

  it('defaults to moving all of the source machine load on that line', () => {
    const next = applyAction(smallFactory(), reroute(undefined))
    assert.equal(next.appliedActions[0].effect.transfers[0].loadPerHour, 60)
  })

  it('rejects an alternative machine of a different type without a backup relationship', () => {
    const lathe = { id: 'MD', code: 'MD', name: 'Lathe', machine_type: 'Lathe', status: 'operational', health_state: 'healthy', capacity_per_hour: 80, maintenance_interval_days: 30, last_maintenance_at: null }
    const assignment = { id: 'MD-L1', machine_id: 'MD', production_line_id: 'L1', contribution_per_hour: 0, is_primary: true }
    const state = smallFactory({ extraMachines: [lathe], extraAssignments: [assignment] })
    assert.throws(() => applyAction(state, reroute(10, 'MD')), /cannot take over work/)

    const backup = { id: 'bk', machine_id: 'MA', depends_on_machine_id: 'MD', dependency_type: 'backup' }
    const withBackup = smallFactory({ extraMachines: [lathe], extraAssignments: [assignment], dependencies: [backup] })
    assert.equal(applyAction(withBackup, reroute(10, 'MD')).appliedActions.length, 1)
  })

  it('rejects moving more load than the source machine carries', () => {
    assert.throws(() => applyAction(smallFactory(), reroute(61)), EngineValidationError)
  })

  it('rejects completed orders', () => {
    const state = smallFactory({ orders: [order('O1', 24, 40, { status: 'completed' })] })
    assert.throws(() => applyAction(state, reroute(10)), /completed and cannot be changed/)
  })
})

describe('split_workload', () => {
  it('spreads load across several machines', () => {
    const action = { type: 'split_workload', fromMachineId: 'MA', productionLineId: 'L1', splits: [{ targetMachineId: 'MC', loadPerHour: 20 }] }
    const result = simulateScenario(smallFactory(), { id: 'split', actions: [action] })
    // Load moved, not lost: the line keeps its 120/h.
    assert.equal(result.metrics.capacityLossLineHours, 0)
    assert.equal(result.machineImpacts.find((m) => m.code === 'MA').scenarioPeakUtilization, 0.6667)
  })

  it('rejects splits that exceed the source load', () => {
    const action = {
      type: 'split_workload',
      fromMachineId: 'MA',
      productionLineId: 'L1',
      splits: [
        { targetMachineId: 'MB', loadPerHour: 40 },
        { targetMachineId: 'MC', loadPerHour: 30 },
      ],
    }
    assert.throws(() => applyAction(smallFactory(), action), /splits total 70/)
  })
})

describe('reduce_machine_load', () => {
  it('lowers the machine output and therefore the line capacity', () => {
    const result = simulateScenario(smallFactory(), { id: 'reduce', actions: [{ type: 'reduce_machine_load', machineId: 'MA', fraction: 0.5 }] })
    assert.equal(result.lineImpacts[0].minCapacityPerHour, 90)
    assert.deepEqual(result.machineImpacts[0].causes, ['load_reduction'])
  })

  it('starves downstream machines of a reduced upstream stage', () => {
    const result = simulateScenario(nova01State(), { id: 'reduce-m4', actions: [{ type: 'reduce_machine_load', machineId: NOVA01_IDS.M4, fraction: 0.2 }] })
    assert.equal(result.machineImpacts.find((m) => m.code === 'M5').minOutputRatio, 0.8)
  })
})

describe('reschedule_order', () => {
  it('moves the deadline and re-evaluates deadline status', () => {
    const result = simulateScenario(smallFactory(), { id: 'resched', actions: [{ type: 'reschedule_order', orderId: 'O1', newDeadline: atHours(20) }] })
    const o1 = orderOutcome(result, 'O1')
    assert.equal(o1.scenario.status, 'BREACHED')
    assert.equal(o1.scenario.slackHours, -4)
    assert.ok(result.cascade.some((link) => link.impactType === 'deadline_change' && link.magnitude === -20))
  })
})

describe('repair', () => {
  it('brings a failed machine back after the repair window', () => {
    const state = smallFactory({ machineOverrides: { MA: { status: 'down' } } })
    const result = simulateScenario(state, { id: 'repair', actions: [{ type: 'repair', machineId: 'MA', durationHours: 6 }] })
    const ma = result.machineImpacts[0]
    assert.deepEqual(ma.stateTimeline.map((entry) => entry.state), ['maintenance', 'healthy'])
    // Baseline: MA stays down, so repairing it gains capacity after 6 h.
    assert.ok(result.metrics.capacityLossLineHours < 0)
  })

  it('refuses to repair a machine that is not failed or degraded', () => {
    assert.throws(() => applyAction(smallFactory(), { type: 'repair', machineId: 'MA', durationHours: 2 }), /use preventive_maintenance/)
  })
})

describe('action validation', () => {
  it('rejects unknown action types and fields', () => {
    assert.throws(() => applyAction(smallFactory(), { type: 'teleport' }), EngineValidationError)
    assert.throws(() => applyAction(smallFactory(), { type: 'preventive_maintenance', machineId: 'MA', durationHours: 2, colour: 'red' }), /colour/)
    assert.throws(() => applyActions(smallFactory(), 'not an array'), EngineValidationError)
  })

  it('applies actions in sequence', () => {
    const next = applyActions(smallFactory(), [
      { type: 'preventive_maintenance', machineId: 'MA', durationHours: 2 },
      { type: 'reschedule_order', orderId: 'O2', newDeadline: AS_OF },
    ])
    assert.deepEqual(next.appliedActions.map((record) => record.effect.kind), ['service_window', 'deadline_change'])
  })
})
