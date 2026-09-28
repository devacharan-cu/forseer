import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NOVA01_IDS } from '../../src/data/nova01.js'
import { EngineValidationError, simulateScenario } from '../../src/engine/index.js'
import { failure, freezeDeep, nova01State, orderOutcome, smallFactory, smallFactoryRows } from './support.js'

// Baseline for the small factory: L1 runs at 120/h, O1 (24 line-hours, due +40 h)
// completes at 24 h with 16 h slack. While MA is down L1 runs at 60/120 = 50%.
describe('simulateScenario', () => {
  it('reports no impact when nothing changes', () => {
    const result = simulateScenario(smallFactory(), { id: 'nothing' })
    assert.deepEqual(result.machineImpacts, [])
    assert.deepEqual(result.lineImpacts, [])
    assert.deepEqual(result.deadlineImpacts, [])
    assert.deepEqual(result.cascade, [])
    assert.deepEqual(result.breakingPoints, [])
    assert.equal(result.metrics.totalDowntimeHours, 0)
    assert.equal(result.metrics.capacityLossLineHours, 0)
    assert.equal(result.metrics.ordersAffected, 0)
    const o1 = orderOutcome(result, 'O1')
    assert.equal(o1.baseline.completionHours, 24)
    assert.equal(o1.scenario.status, 'SAFE')
    assert.equal(o1.scenario.slackHours, 16)
  })

  it('models a single machine failure end to end', () => {
    const result = simulateScenario(smallFactory(), { id: 'ma-fails', machineEvents: [failure('MA', 10)] })
    assert.equal(result.metrics.totalDowntimeHours, 10)
    assert.equal(result.metrics.machinesAffected, 1)
    assert.equal(result.metrics.linesAffected, 1)
    assert.equal(result.metrics.capacityLossLineHours, 5)

    const ma = result.machineImpacts[0]
    assert.equal(ma.code, 'MA')
    assert.equal(ma.downtimeHours, 10)
    assert.deepEqual(ma.causes, ['scenario_event'])
    assert.deepEqual(ma.stateTimeline.slice(0, 2).map((entry) => entry.state), ['failed', 'healthy'])

    const o1 = orderOutcome(result, 'O1')
    assert.equal(o1.delayHours, 5)
    assert.equal(o1.scenario.completionHours, 29)
    assert.equal(o1.scenario.status, 'WARNING')
  })

  it('reduces production-line capacity for the duration of the event only', () => {
    const line = simulateScenario(smallFactory(), { id: 'ma-fails', machineEvents: [failure('MA', 10)] }).lineImpacts[0]
    assert.equal(line.nominalCapacityPerHour, 120)
    assert.equal(line.capacityAtStartPerHour, 60)
    assert.equal(line.minCapacityRatio, 0.5)
    assert.equal(line.hoursBelowBaseline, 10)
    assert.equal(line.lostProductionLineHours, 5)
  })

  it('keeps a deadline SAFE when the slack absorbs the loss', () => {
    const o1 = orderOutcome(simulateScenario(smallFactory(), { id: 'short', machineEvents: [failure('MA', 2)] }), 'O1')
    assert.equal(o1.delayHours, 1)
    assert.equal(o1.scenario.slackHours, 15)
    assert.equal(o1.scenario.status, 'SAFE')
    assert.equal(o1.statusChanged, false)
  })

  it('marks a deadline CRITICAL when slack drops below the critical threshold', () => {
    // 26 h at half rate = 13 line-hours; 11 left at full rate -> done at 37 h, slack 3 h.
    const result = simulateScenario(smallFactory(), { id: 'long', machineEvents: [failure('MA', 26)] })
    const o1 = orderOutcome(result, 'O1')
    assert.equal(o1.scenario.completionHours, 37)
    assert.equal(o1.scenario.status, 'CRITICAL')
    assert.deepEqual(result.deadlineImpacts.map((d) => [d.orderNumber, d.from, d.to, d.direction]), [['O1', 'SAFE', 'CRITICAL', 'worsened']])
  })

  it('marks a deadline BREACHED and reports it as a breaking point', () => {
    // 40 h at half rate = 20 line-hours; 4 left -> done at 44 h, 4 h after the deadline.
    const result = simulateScenario(smallFactory(), { id: 'very-long', machineEvents: [failure('MA', 40)] })
    const o1 = orderOutcome(result, 'O1')
    assert.equal(o1.scenario.completionHours, 44)
    assert.equal(o1.scenario.slackHours, -4)
    assert.equal(o1.scenario.status, 'BREACHED')
    assert.equal(result.metrics.newDeadlineBreaches, 1)
    assert.deepEqual(result.breakingPoints, [
      { entityType: 'order', entityId: 'O1', label: 'O1', condition: 'deadline_breach', atHours: 40 },
    ])
  })

  it('reports orders that cannot finish within the horizon', () => {
    const scenario = { id: 'forever', machineEvents: ['MA', 'MB', 'MC'].map((id) => failure(id, null)) }
    const result = simulateScenario(smallFactory(), scenario)
    const o1 = orderOutcome(result, 'O1')
    assert.equal(o1.scenario.canComplete, false)
    assert.equal(o1.scenario.status, 'BREACHED')
    assert.ok(result.warnings.some((warning) => warning.code === 'order_not_completed_in_horizon'))
    assert.ok(result.warnings.some((warning) => warning.code === 'event_open_ended'))
    assert.ok(result.breakingPoints.some((point) => point.condition === 'line_stopped' && point.atHours === 0))
    assert.ok(result.cascade.some((link) => link.impactType === 'cannot_complete'))
  })

  it('simulates a preventive maintenance action as a planned outage that ends healthy', () => {
    const scenario = { id: 'pm', actions: [{ type: 'preventive_maintenance', machineId: 'MA', durationHours: 3 }] }
    const result = simulateScenario(smallFactory(), scenario)
    const ma = result.machineImpacts[0]
    assert.equal(ma.downtimeHours, 3)
    assert.deepEqual(ma.causes, ['action_event'])
    assert.deepEqual(ma.stateTimeline[0], { state: 'maintenance', fromHours: 0, toHours: 3 })
    assert.equal(ma.stateTimeline[1].state, 'healthy')
    assert.equal(result.metrics.capacityLossLineHours, 1.5)
    assert.equal(result.cascade[0].source, 'action')
    assert.equal(result.cascade[0].sourceId, 'preventive_maintenance')
  })

  it('combines several machine events in one composite scenario', () => {
    const result = simulateScenario(smallFactory(), { id: 'both', machineEvents: [failure('MA', 10), failure('MB', 10)] })
    // Only MC's 20/h remains: 10 h at 1/6 rate loses 8.33 line-hours.
    assert.equal(result.metrics.machinesAffected, 2)
    assert.equal(result.metrics.totalDowntimeHours, 20)
    assert.equal(result.metrics.capacityLossLineHours, 8.33)
    assert.equal(result.lineImpacts[0].minCapacityPerHour, 20)
    assert.equal(orderOutcome(result, 'O1').scenario.status, 'WARNING')
  })

  it('reports a stopped line when a composite failure removes all of its capacity', () => {
    const scenario = { id: 'line2-down', machineEvents: [failure(NOVA01_IDS.M4, 8), failure(NOVA01_IDS.M7, 8)] }
    const result = simulateScenario(nova01State(), scenario)
    assert.deepEqual(
      result.breakingPoints.filter((point) => point.condition === 'line_stopped').map((point) => [point.label, point.atHours]),
      [['LINE-2', 0]],
    )
    assert.equal(result.lineImpacts.find((line) => line.code === 'LINE-2').minCapacityPerHour, 0)
  })

  it('processes each line queue earliest-deadline-first', () => {
    const rows = smallFactoryRows()
    rows.orders.reverse()
    const result = simulateScenario(smallFactory({ orders: rows.orders }), { id: 'q' })
    assert.equal(orderOutcome(result, 'O1').queuePosition, 1)
    assert.equal(orderOutcome(result, 'O2').queuePosition, 2)
    assert.equal(orderOutcome(result, 'O2').scenario.completionHours, 54)
  })

  describe('invalid scenarios fail cleanly', () => {
    const state = smallFactory()
    const cases = {
      'not an object': null,
      'missing id': { machineEvents: [] },
      'unknown field': { id: 'x', surprise: true },
      'unknown machine': { id: 'x', machineEvents: [failure('NOPE', 2)] },
      'invalid state': { id: 'x', machineEvents: [{ machineId: 'MA', state: 'on_fire', durationHours: 2 }] },
      'negative duration': { id: 'x', machineEvents: [failure('MA', -2)] },
      'missing duration': { id: 'x', machineEvents: [{ machineId: 'MA', state: 'failed' }] },
      'capacity factor on a failure': { id: 'x', machineEvents: [{ ...failure('MA', 2), capacityFactor: 0.5 }] },
      'overlapping events': { id: 'x', machineEvents: [failure('MA', 10), failure('MA', 5, 4)] },
      'unknown action': { id: 'x', actions: [{ type: 'pray' }] },
    }
    for (const [name, scenario] of Object.entries(cases)) {
      it(name, () => assert.throws(() => simulateScenario(state, scenario), EngineValidationError))
    }

    it('raw database rows instead of a normalized state', () => {
      assert.throws(() => simulateScenario(smallFactoryRows(), { id: 'x' }), /normalizeFactoryState/)
    })
  })

  it('never mutates the factory state or the scenario', () => {
    const state = freezeDeep(nova01State())
    const before = JSON.stringify(state)
    const scenario = freezeDeep({
      id: 'frozen',
      machineEvents: [failure(NOVA01_IDS.M4, 16, 12)],
      actions: [{ type: 'reroute_order', orderId: NOVA01_IDS.ORD_0482, fromMachineId: NOVA01_IDS.M4, targetMachineId: NOVA01_IDS.M7, loadPerHour: 25 }],
    })
    simulateScenario(state, scenario)
    assert.equal(JSON.stringify(state), before)
  })

  it('returns identical output for identical input', () => {
    const scenario = { id: 'repeat', machineEvents: [failure(NOVA01_IDS.M4, 16, 12)] }
    const first = simulateScenario(nova01State(), scenario)
    const second = simulateScenario(nova01State(), scenario)
    const reusedState = nova01State()
    const third = simulateScenario(reusedState, scenario)
    const fourth = simulateScenario(reusedState, scenario)
    assert.deepEqual(first, second)
    assert.equal(JSON.stringify(third), JSON.stringify(fourth))
    assert.equal(JSON.stringify(first), JSON.stringify(third))
  })

  it('produces plain JSON-safe data', () => {
    const result = simulateScenario(nova01State(), { id: 'json', machineEvents: [failure(NOVA01_IDS.M4, 16, 12)] })
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result)
  })
})
