import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AI_ERROR_CODES, AiError, analyzeIncident, analyzeMachineRisk } from '../../src/ai/index.js'
import { assessMachineRisk, EngineValidationError } from '../../src/engine/index.js'
import { INCIDENT_REPLY, mockProvider, NOVA01_IDS, nova01State, RISK_REPLY } from './support.js'

const invalidOutput = (error) => error instanceof AiError && error.code === AI_ERROR_CODES.INVALID_OUTPUT

describe('analyzeMachineRisk', () => {
  it('explains the engine classification without replacing it', async () => {
    const state = nova01State()
    const { provider, calls } = mockProvider({ machine_risk: RISK_REPLY })
    const result = await analyzeMachineRisk({ provider, factoryState: state, machineId: NOVA01_IDS.M4 })

    const engine = assessMachineRisk(state, NOVA01_IDS.M4)
    assert.equal(result.operationalRisk.level, engine.level)
    assert.equal(result.operationalRisk.points, engine.points)
    assert.deepEqual(result.sources, { operationalRisk: 'deterministic_engine', recurringPatterns: 'deterministic_engine', analysis: 'ai' })
    assert.equal(result.analysis.summary, RISK_REPLY.summary)
    // The model saw the engine's facts, not raw tables.
    assert.equal(calls.length, 1)
    assert.match(calls[0].prompt, /"level": "CRITICAL"/)
    assert.match(calls[0].system, /Never describe failure as a probability/)
  })

  it('rejects a failure probability', async () => {
    const reply = { ...RISK_REPLY, summary: 'M4 has a 73% chance of failure this week.' }
    const { provider } = mockProvider({ machine_risk: reply })
    await assert.rejects(analyzeMachineRisk({ provider, factoryState: nova01State(), machineId: NOVA01_IDS.M4 }), invalidOutput)
  })

  it('rejects a risk level that contradicts the engine', async () => {
    const reply = { ...RISK_REPLY, summary: 'FORSEER classifies M4 as LOW operational risk.' }
    const { provider } = mockProvider({ machine_risk: reply })
    await assert.rejects(analyzeMachineRisk({ provider, factoryState: nova01State(), machineId: NOVA01_IDS.M4 }), invalidOutput)
  })

  it('rejects invented signals and records', async () => {
    const reply = {
      ...RISK_REPLY,
      contributingFactors: [{ signal: 'bearing_temperature', explanation: 'Made up.' }],
      historicalEvidence: [{ reference: 'inc-99', observation: 'Made up.' }],
    }
    const { provider } = mockProvider({ machine_risk: reply })
    await assert.rejects(analyzeMachineRisk({ provider, factoryState: nova01State(), machineId: NOVA01_IDS.M4 }), (error) => {
      assert.ok(invalidOutput(error))
      assert.equal(error.issues.length, 2)
      return true
    })
  })

  it('rejects output that does not match the schema', async () => {
    const { provider } = mockProvider({ machine_risk: { ...RISK_REPLY, riskScore: 97 } })
    await assert.rejects(analyzeMachineRisk({ provider, factoryState: nova01State(), machineId: NOVA01_IDS.M4 }), invalidOutput)
  })

  it('rejects an unknown machine before calling the AI', async () => {
    const { provider, calls } = mockProvider({ machine_risk: RISK_REPLY })
    await assert.rejects(analyzeMachineRisk({ provider, factoryState: nova01State(), machineId: 'nope' }), EngineValidationError)
    assert.equal(calls.length, 0)
  })
})

describe('analyzeIncident', () => {
  const report = 'M4 started vibrating heavily during the second production run and the operator noticed unusual noise.'

  it('separates observed facts from inference and grounds history matches', async () => {
    const { provider, calls } = mockProvider({ incident_analysis: INCIDENT_REPLY })
    const result = await analyzeIncident({ provider, factoryState: nova01State(), report })
    assert.equal(result.machine.code, 'M4')
    assert.deepEqual(result.analysis.observedFacts.map((f) => f.source), ['report', 'history'])
    assert.equal(result.analysis.inferences[0].confidence, 'medium')
    assert.equal(result.engineContext.operationalRisk.level, 'CRITICAL')
    assert.match(calls[0].prompt, /<user_input>\nM4 started vibrating/)
  })

  it('returns a draft that still needs a person to confirm it', async () => {
    const { provider } = mockProvider({ incident_analysis: INCIDENT_REPLY })
    const result = await analyzeIncident({ provider, factoryState: nova01State(), report })
    assert.equal(result.requiresConfirmation, true)
    assert.equal(result.incidentDraft.machine_id, NOVA01_IDS.M4)
    assert.equal(result.incidentDraft.description, report)
  })

  it('asks for clarification when the operator names a machine that does not exist', async () => {
    const { provider } = mockProvider({ incident_analysis: { ...INCIDENT_REPLY, machineReference: 'M99', historicalMatches: [] } })
    const result = await analyzeIncident({ provider, factoryState: nova01State(), report: 'M99 is vibrating.' })
    assert.equal(result.machine, null)
    assert.equal(result.unresolvedReference, 'M99')
    assert.match(result.clarification, /no machine "M99"/)
    assert.equal(result.incidentDraft, null)
  })

  it('rejects a definitive diagnosis and invented records', async () => {
    const overclaim = { ...INCIDENT_REPLY, inferences: [{ statement: 'The bearing is definitely failing.', basis: 'vibration', confidence: 'high' }] }
    const invented = { ...INCIDENT_REPLY, historicalMatches: [{ incidentId: 'inc-77', similarity: 'none' }] }
    for (const reply of [overclaim, invented]) {
      const { provider } = mockProvider({ incident_analysis: reply })
      await assert.rejects(analyzeIncident({ provider, factoryState: nova01State(), report }), invalidOutput)
    }
  })

  it('rejects a machine the model made up', async () => {
    const { provider } = mockProvider({ incident_analysis: { ...INCIDENT_REPLY, machineReference: 'M42' } })
    await assert.rejects(analyzeIncident({ provider, factoryState: nova01State(), report }), invalidOutput)
  })
})
