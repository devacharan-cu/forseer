import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createUnavailableProvider,
  runAfterModeRecovery,
  runBeforeModeAnalysis,
  runDuringModeAssessment,
  runStructuredWhatIf,
  runWhatIf,
} from '../../src/ai/index.js'
import { buildNova01Snapshot, NOVA01_REFERENCE_AS_OF } from '../../src/data/nova01.js'
import { EngineValidationError, normalizeFactoryState, simulateScenario } from '../../src/engine/index.js'
import {
  actionProposal,
  EXPLANATION_REPLY,
  freezeDeep,
  INCIDENT_REPLY,
  mockProvider,
  NOVA01_IDS,
  nova01State,
  PLANS_REPLY,
  RECOMMENDATION_REPLY,
  RISK_REPLY,
  scenarioReply,
} from './support.js'

const HYPOTHETICAL_FAILURE = { startHours: 12, durationHours: 16 }
const BEFORE_REPLIES = {
  machine_risk: RISK_REPLY,
  candidate_actions: PLANS_REPLY,
  scenario_explanation: EXPLANATION_REPLY,
  recommendation: RECOMMENDATION_REPLY,
}

const runBefore = (provider, factoryState = nova01State()) =>
  runBeforeModeAnalysis({ provider, factoryState, machineId: NOVA01_IDS.M4, hypotheticalFailure: HYPOTHETICAL_FAILURE })

function failedM4State() {
  const rows = buildNova01Snapshot(NOVA01_REFERENCE_AS_OF)
  rows.machines.find((m) => m.code === 'M4').status = 'down'
  return normalizeFactoryState(rows, { asOf: NOVA01_REFERENCE_AS_OF })
}

describe('BEFORE mode: AI proposes, engine evaluates, AI explains', () => {
  it('runs the full preventive flow on NOVA-01 with real simulations', async () => {
    const state = nova01State()
    const { provider, calls } = mockProvider(BEFORE_REPLIES)
    const outcome = await runBefore(provider, state)

    assert.equal(outcome.operationalRisk.level, 'CRITICAL')
    assert.equal(outcome.riskAnalysis.analysis.summary, RISK_REPLY.summary)
    assert.equal(outcome.candidateSource, 'ai')
    assert.deepEqual(outcome.options.map((o) => o.result.scenarioId), ['ai-plan-1', 'ai-plan-2'])

    // Every number comes from the engine: re-running the same scenarios directly gives identical results.
    assert.deepEqual(outcome.baseline, simulateScenario(state, {
      id: 'do-nothing',
      name: 'Do nothing',
      description: outcome.baseline.description,
      machineEvents: [{ machineId: NOVA01_IDS.M4, state: 'failed', startHours: 12, durationHours: 16, afterState: 'healthy', label: 'M4 hypothetical failure' }],
      actions: [],
    }))
    for (const option of outcome.options) assert.deepEqual(option.result, simulateScenario(state, option.scenario))

    const [maintenance, shiftLoad] = outcome.options
    assert.equal(outcome.baseline.metrics.newDeadlineBreaches, 1)
    assert.equal(maintenance.result.metrics.newDeadlineBreaches, 0)
    assert.equal(maintenance.result.metrics.totalDowntimeHours, 3)
    assert.match(maintenance.assumptions.join(' '), /prevents the M4 failure/)
    assert.equal(shiftLoad.result.metrics.capacityLossLineHours, 8.78)
    assert.equal(shiftLoad.result.metrics.secondaryRisks, 1)

    assert.equal(outcome.comparison.referenceScenarioId, 'do-nothing')
    assert.equal(outcome.recommendation.recommendedScenarioId, 'ai-plan-1')
    assert.deepEqual(outcome.recommendation.recommendedActions, maintenance.scenario.actions)
    assert.equal(outcome.recommendation.requiresConfirmation, true)
    assert.deepEqual(outcome.ai, { available: true, errors: [] })

    // The recommendation is requested only after the engine has simulated every option.
    assert.deepEqual(calls.map((c) => c.task), ['machine_risk', 'candidate_actions', 'scenario_explanation', 'recommendation'])
    assert.match(calls[3].prompt, /"scenarioId": "ai-plan-1"/)
    assert.match(calls[3].prompt, /"newDeadlineBreaches": 0/)
  })

  it('still works end to end when the AI is unavailable', async () => {
    const outcome = await runBefore(createUnavailableProvider())
    assert.equal(outcome.candidateSource, 'rule_based')
    assert.equal(outcome.options.length, 2)
    assert.ok(outcome.comparison)
    assert.equal(outcome.riskAnalysis, null)
    assert.equal(outcome.explanation, null)
    assert.equal(outcome.recommendation, null)
    assert.equal(outcome.ai.available, false)
    assert.deepEqual(outcome.ai.errors.map((e) => [e.step, e.code]), [
      ['analyzeMachineRisk', 'ai_unavailable'],
      ['generateCandidateActions', 'ai_unavailable'],
      ['explainScenario', 'ai_unavailable'],
      ['recommendOption', 'ai_unavailable'],
    ])
  })

  it('falls back to rule-based plans when the provider times out', async () => {
    const { provider } = mockProvider({ ...BEFORE_REPLIES, candidate_actions: () => new Promise(() => {}) }, { timeoutMs: 30 })
    const outcome = await runBefore(provider)
    assert.equal(outcome.candidateSource, 'rule_based')
    assert.ok(outcome.ai.errors.some((e) => e.step === 'generateCandidateActions' && e.code === 'ai_timeout'))
    assert.ok(outcome.recommendation === null || outcome.recommendation.recommendedScenarioId !== 'ai-plan-1')
  })

  it('drops a recommendation for an option that was never simulated', async () => {
    const { provider } = mockProvider({ ...BEFORE_REPLIES, recommendation: { ...RECOMMENDATION_REPLY, recommendedScenarioId: 'secret-plan' } })
    const outcome = await runBefore(provider)
    assert.equal(outcome.recommendation, null)
    assert.ok(outcome.ai.errors.some((e) => e.step === 'recommendOption' && e.code === 'ai_invalid_output'))
    assert.equal(outcome.options.length, 2)
  })

  it('requires the hypothetical failure to be stated, not predicted', async () => {
    await assert.rejects(runBeforeModeAnalysis({ provider: createUnavailableProvider(), factoryState: nova01State(), machineId: NOVA01_IDS.M4 }), EngineValidationError)
  })

  it('is deterministic for the same inputs', async () => {
    const first = await runBefore(mockProvider(BEFORE_REPLIES).provider)
    const second = await runBefore(mockProvider(BEFORE_REPLIES).provider)
    assert.equal(JSON.stringify(first), JSON.stringify(second))
  })
})

describe('AFTER mode: recovery from a recorded failure', () => {
  const recoveryReplies = {
    incident_analysis: INCIDENT_REPLY,
    candidate_actions: {
      plans: [
        {
          title: 'Repair M4',
          actions: [actionProposal('repair', { machineCode: 'M4', durationHours: 5 })],
          rationale: 'The last repair on M4 took 5 hours.',
          expectedEffect: 'Should restore LINE-2 capacity once M4 is back.',
          risks: 'Vibration may recur after the repair.',
        },
      ],
      notes: '',
    },
    scenario_explanation: { ...EXPLANATION_REPLY, headline: 'Repairing M4 restores LINE-2.', causalChain: ['M4 is down, so LINE-2 runs on M7 alone.'], keyImpacts: [] },
    recommendation: { ...RECOMMENDATION_REPLY, rationale: 'Repairing M4 restores LINE-2 in the simulated results.', caveats: ['Assumes the repair takes as long as last time.'] },
  }

  it('evaluates recovery plans against doing nothing and returns an action sequence', async () => {
    const state = failedM4State()
    const { provider } = mockProvider(recoveryReplies)
    const outcome = await runAfterModeRecovery({ provider, factoryState: state, machineId: NOVA01_IDS.M4, incidentReport: 'M4 stopped after heavy vibration.' })

    assert.equal(outcome.mode, 'after')
    assert.equal(outcome.incident.machine.code, 'M4')
    const [repair] = outcome.options
    assert.deepEqual(repair.scenario.actions, [{ type: 'repair', machineId: NOVA01_IDS.M4, durationHours: 5, startHours: 0 }])
    assert.ok(repair.result.metrics.capacityLossLineHours < 0, 'repairing gains capacity over staying down')
    assert.ok(repair.result.metrics.deadlineBreaches < outcome.baseline.metrics.deadlineBreaches)
    assert.deepEqual(outcome.recommendation.actionSequence, RECOMMENDATION_REPLY.actionSequence)
    assert.deepEqual(outcome.recommendation.recommendedActions, repair.scenario.actions)
  })

  it('refuses a machine that has not failed', async () => {
    await assert.rejects(
      runAfterModeRecovery({ provider: createUnavailableProvider(), factoryState: nova01State(), machineId: NOVA01_IDS.M4 }),
      /use BEFORE mode/,
    )
  })
})

describe('DURING mode', () => {
  it('structures the report and shows the engine picture for the machine', async () => {
    const { provider } = mockProvider({ incident_analysis: INCIDENT_REPLY })
    const outcome = await runDuringModeAssessment({ provider, factoryState: nova01State(), report: 'M4 is vibrating heavily right now.' })
    assert.equal(outcome.machineId, NOVA01_IDS.M4)
    assert.deepEqual(outcome.engineContext.lineCapacity.map((l) => l.code), ['LINE-2'])
    assert.ok(outcome.engineContext.orderOutlook.some((o) => o.orderNumber === 'ORD-0482'))
  })

  it('without AI, still gives the engine picture when the machine is known', async () => {
    const outcome = await runDuringModeAssessment({ provider: createUnavailableProvider(), factoryState: nova01State(), report: 'M4 is vibrating.', machineId: NOVA01_IDS.M4 })
    assert.equal(outcome.incident, null)
    assert.equal(outcome.engineContext.operationalRisk.level, 'CRITICAL')
  })
})

describe('What-if', () => {
  const explanation = {
    headline: 'M4 being down delays the orders queued on LINE-2.',
    causalChain: ['M4 stops, so M5 and M6 lose their input.'],
    keyImpacts: [],
    warnings: [],
    explanation: 'The engine traced the outage through LINE-2.',
    tradeoffs: [],
  }

  it('parses, simulates with the engine, and explains', async () => {
    const state = nova01State()
    const { provider } = mockProvider({
      scenario_parse: scenarioReply({ events: [{ machineCode: 'M4', state: 'failed', durationHours: 12 }] }),
      scenario_explanation: explanation,
    })
    const outcome = await runWhatIf({ provider, factoryState: state, question: 'What happens if M4 stays offline for 12 hours?' })
    assert.equal(outcome.type, 'result')
    assert.deepEqual(outcome.result, simulateScenario(state, outcome.scenario))
    assert.equal(outcome.explanation.headline, explanation.headline)
  })

  it('returns the clarification for a follow-up that needs one', async () => {
    const baseScenario = { id: 'what-if', name: 'M4 offline', machineEvents: [{ machineId: NOVA01_IDS.M4, state: 'failed', startHours: 0, durationHours: 12 }], actions: [] }
    const { provider } = mockProvider({
      scenario_parse: scenarioReply({ extendsBaseScenario: true, events: [{ machineCode: 'M7', state: 'failed' }] }),
    })
    const outcome = await runWhatIf({ provider, factoryState: nova01State(), question: 'What if M7 is also unavailable?', baseScenario })
    assert.equal(outcome.type, 'clarification_required')
    assert.ok(outcome.suggestedScenario)
  })

  it('degrades to the structured path when the AI is unavailable', async () => {
    const state = nova01State()
    const outcome = await runWhatIf({ provider: createUnavailableProvider(), factoryState: state, question: 'What if M4 fails for 8 hours?' })
    assert.equal(outcome.type, 'ai_unavailable')
    const structured = runStructuredWhatIf({
      factoryState: state,
      scenario: { id: 'manual', machineEvents: [{ machineId: NOVA01_IDS.M4, state: 'failed', durationHours: 8 }] },
    })
    assert.equal(structured.result.metrics.totalDowntimeHours, 8)
  })
})

describe('the AI layer never mutates factory state', () => {
  it('leaves a deep-frozen state untouched through every workflow', async () => {
    const state = freezeDeep(nova01State())
    const before = JSON.stringify(state)
    await runBefore(mockProvider(BEFORE_REPLIES).provider, state)
    await runWhatIf({
      provider: mockProvider({ scenario_parse: scenarioReply({ actions: [actionProposal('reroute_order', { orderNumber: 'ORD-0482', targetMachineCode: 'M7' })] }), scenario_explanation: {} }).provider,
      factoryState: state,
      question: 'What if we move ORD-0482 to M7?',
    })
    await runDuringModeAssessment({ provider: mockProvider({ incident_analysis: INCIDENT_REPLY }).provider, factoryState: state, report: 'M4 vibrates.' })
    assert.equal(JSON.stringify(state), before)
  })
})
