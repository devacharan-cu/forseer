import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareScenarios, EngineValidationError, normalizeFactoryState, simulateScenario } from '../../src/engine/index.js'
import { AS_OF, failure, smallFactory, smallFactoryRows } from './support.js'

describe('compareScenarios', () => {
  const state = smallFactory()
  const shortOutage = simulateScenario(state, { id: 'short', machineEvents: [failure('MA', 2)] })
  const longOutage = simulateScenario(state, { id: 'long', machineEvents: [failure('MA', 40)] })

  it('reports metric differences against the first scenario', () => {
    const comparison = compareScenarios([longOutage, shortOutage])
    assert.equal(comparison.referenceScenarioId, 'long')
    assert.deepEqual(comparison.differences, [
      {
        scenarioId: 'short',
        referenceScenarioId: 'long',
        downtimeHours: -38,
        capacityLossLineHours: -19,
        ordersAtRisk: 0,
        deadlineBreaches: -1,
        secondaryRisks: 0,
      },
    ])
  })

  it('lists every value per metric without choosing a winner', () => {
    const comparison = compareScenarios([longOutage, shortOutage])
    const downtime = comparison.metrics.find((metric) => metric.metric === 'totalDowntimeHours')
    assert.deepEqual(downtime.values, [
      { scenarioId: 'long', value: 40 },
      { scenarioId: 'short', value: 2 },
    ])
    assert.deepEqual(downtime.lowestValueScenarioIds, ['short'])
    assert.equal('winner' in comparison, false)
  })

  it('shows per-order outcomes only where they differ', () => {
    const comparison = compareScenarios([longOutage, shortOutage])
    const o1 = comparison.orders.find((entry) => entry.orderNumber === 'O1')
    assert.deepEqual(o1.outcomes.map((outcome) => outcome.status), ['BREACHED', 'SAFE'])
  })

  it('rejects invalid input', () => {
    assert.throws(() => compareScenarios([shortOutage]), EngineValidationError)
    assert.throws(() => compareScenarios([shortOutage, shortOutage]), /repeats scenarioId/)
    assert.throws(() => compareScenarios([shortOutage, { hello: 'world' }]), EngineValidationError)
    const laterState = normalizeFactoryState(smallFactoryRows(), { asOf: '2026-03-03T08:00:00.000Z' })
    assert.notEqual(laterState.asOf, AS_OF)
    const later = simulateScenario(laterState, { id: 'later' })
    assert.throws(() => compareScenarios([shortOutage, later]), /different asOf/)
  })
})
