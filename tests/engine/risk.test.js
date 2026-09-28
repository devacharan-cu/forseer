import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildNova01Snapshot, NOVA01_IDS, NOVA01_REFERENCE_AS_OF, machineId } from '../../src/data/nova01.js'
import { assessFactoryRisk, assessMachineRisk, findRecurringPatterns, normalizeFactoryState } from '../../src/engine/index.js'
import { nova01State, smallFactory } from './support.js'

describe('assessMachineRisk', () => {
  it('rates M4 CRITICAL and explains every contributing signal', () => {
    const risk = assessMachineRisk(nova01State(), NOVA01_IDS.M4)
    assert.equal(risk.level, 'CRITICAL')
    assert.equal(risk.points, 11)
    assert.deepEqual(
      risk.signals.map((signal) => [signal.signal, signal.points]),
      [
        ['health_state', 3],
        ['maintenance_overdue', 2],
        ['unresolved_incident', 3],
        ['recurring_incident_pattern', 2],
        ['recurrence_after_repair', 1],
      ],
    )
    // Last service was the bearing repair 50 days ago; the interval is 45 days.
    const overdue = risk.signals.find((signal) => signal.signal === 'maintenance_overdue')
    assert.equal(overdue.detail.daysSinceService, 50)
  })

  it('never presents the score as a failure probability', () => {
    const risk = assessMachineRisk(nova01State(), NOVA01_IDS.M4)
    assert.equal(risk.isFailureProbability, false)
    assert.equal(risk.scoreType, 'forseer_operational_risk_points')
    assert.match(risk.disclaimer, /not a failure probability/)
  })

  it('rates a healthy, recently serviced machine LOW with no signals', () => {
    const risk = assessMachineRisk(nova01State(), machineId(1))
    assert.equal(risk.level, 'LOW')
    assert.deepEqual(risk.signals, [])
  })

  it('always rates a failed machine CRITICAL', () => {
    const state = smallFactory({ machineOverrides: { MA: { status: 'down' } } })
    const risk = assessMachineRisk(state, 'MA')
    assert.equal(risk.level, 'CRITICAL')
    assert.equal(risk.signals[0].signal, 'currently_failed')
  })

  it('ranks the whole factory with the riskiest machine first', () => {
    const ranking = assessFactoryRisk(nova01State())
    assert.equal(ranking[0].code, 'M4')
    assert.ok(ranking.slice(1).every((machine) => machine.level === 'LOW'))
  })
})

describe('findRecurringPatterns', () => {
  it('finds the repeated vibration history on M4', () => {
    const [vibration] = findRecurringPatterns(nova01State(), NOVA01_IDS.M4)
    assert.equal(vibration.matchedPattern, 'vibration')
    assert.equal(vibration.occurrences, 4)
    assert.equal(vibration.recurrenceDetected, true)
    assert.equal(vibration.occurrencesAfterLastRepair, 2)
    assert.equal(vibration.recentOccurrence, '2026-09-25T08:00:00.000Z')
  })

  it('does not call two occurrences a recurrence', () => {
    const [temperature] = findRecurringPatterns(nova01State(), machineId(9))
    assert.equal(temperature.matchedPattern, 'temperature')
    assert.equal(temperature.occurrences, 2)
    assert.equal(temperature.recurrenceDetected, false)
  })

  it('only uses history that existed at asOf (historical replay)', () => {
    // 67 days before the reference: the first vibration incident (detected at -70 d,
    // resolved at -65 d) had happened but was not yet resolved.
    const replayAsOf = new Date(Date.parse(NOVA01_REFERENCE_AS_OF) - 67 * 86_400_000).toISOString()
    const state = normalizeFactoryState(buildNova01Snapshot(NOVA01_REFERENCE_AS_OF), { asOf: replayAsOf })
    const [vibration] = findRecurringPatterns(state, NOVA01_IDS.M4)
    assert.equal(vibration.occurrences, 1)
    assert.equal(vibration.recurrenceDetected, false)
    const risk = assessMachineRisk(state, NOVA01_IDS.M4)
    const unresolved = risk.signals.find((signal) => signal.signal === 'unresolved_incident')
    assert.deepEqual(unresolved.detail.incidentIds, ['inc-01'])
    assert.equal(risk.signals.some((signal) => signal.signal === 'recurring_incident_pattern'), false)
  })
})
