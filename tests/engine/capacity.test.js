import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NOVA01_IDS } from '../../src/data/nova01.js'
import { calculateCurrentCapacity, simulateScenario } from '../../src/engine/index.js'
import { failure, nova01State, smallFactory } from './support.js'

describe('capacity model', () => {
  it('healthy machines deliver their full assigned load', () => {
    const capacity = calculateCurrentCapacity(smallFactory())
    const line = capacity.productionLines[0]
    assert.equal(line.nominalCapacityPerHour, 120)
    assert.equal(line.currentCapacityPerHour, 120)
    assert.equal(line.capacityLossPerHour, 0)
    assert.equal(line.capacityRatio, 1)
    const mc = capacity.machines.find((machine) => machine.code === 'MC')
    assert.equal(mc.utilization, 0.4)
    assert.equal(mc.usableCapacityPerHour, 50)
  })

  it('counts assigned load, not raw machine capacity, so spare capacity is not double-counted', () => {
    // MA+MB+MC raw capacity is 150/h, but only 120/h is assigned to L1.
    assert.equal(calculateCurrentCapacity(smallFactory()).productionLines[0].nominalCapacityPerHour, 120)
  })

  it('a failed machine contributes nothing', () => {
    const result = simulateScenario(smallFactory(), { id: 'fail', machineEvents: [failure('MA', 10)] })
    assert.equal(result.lineImpacts[0].minCapacityPerHour, 60)
    assert.equal(result.lineImpacts[0].minCapacityRatio, 0.5)
  })

  it('a degraded machine delivers its explicit capacity factor', () => {
    const scenario = { id: 'degraded', machineEvents: [{ machineId: 'MA', state: 'degraded', capacityFactor: 0.5, durationHours: 12 }] }
    const result = simulateScenario(smallFactory(), scenario)
    // MA 30 + MB 40 + MC 20
    assert.equal(result.lineImpacts[0].minCapacityPerHour, 90)
    assert.equal(result.machineImpacts[0].minOutputRatio, 0.5)
  })

  it('maintenance takes a machine to zero capacity', () => {
    const scenario = { id: 'maint', machineEvents: [{ machineId: 'MB', state: 'maintenance', durationHours: 4 }] }
    assert.equal(simulateScenario(smallFactory(), scenario).lineImpacts[0].minCapacityPerHour, 80)
  })

  it('propagates a failure to sequentially dependent machines', () => {
    const state = nova01State()
    const result = simulateScenario(state, { id: 'm4', machineEvents: [failure(NOVA01_IDS.M4, 8)] })
    const line2 = result.lineImpacts.find((line) => line.code === 'LINE-2')
    // M5 depends on M4 and M6 on M5, so only M7 (45/h) keeps producing.
    assert.equal(line2.minCapacityPerHour, 45)
    const m6 = result.machineImpacts.find((machine) => machine.code === 'M6')
    assert.deepEqual(m6.limitedByMachineCodes, ['M5'])
    assert.equal(m6.upstreamLimitedHours, 8)
    assert.ok(m6.causes.includes('upstream_dependency'))
  })

  it('a degraded upstream machine limits its dependents to the same output ratio', () => {
    const state = nova01State()
    const scenario = { id: 'deg', machineEvents: [{ machineId: NOVA01_IDS.M4, state: 'degraded', capacityFactor: 0.6, durationHours: 12 }] }
    const line2 = simulateScenario(state, scenario).lineImpacts.find((line) => line.code === 'LINE-2')
    // M4 48/75 = 0.64 -> M5 44.8, M6 41.6, M7 45 -> 179.4
    assert.equal(line2.minCapacityPerHour, 179.4)
  })
})
