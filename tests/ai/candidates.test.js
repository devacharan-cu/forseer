import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AI_ERROR_CODES, AiError, explainScenario, generateCandidateActions, ruleBasedCandidatePlans } from '../../src/ai/index.js'
import { HERO_SCENARIOS } from '../../src/data/demoScenarios.js'
import { simulateScenario } from '../../src/engine/index.js'
import { actionProposal, EXPLANATION_REPLY, mockProvider, NOVA01_IDS, nova01State, PLANS_REPLY } from './support.js'

const generate = (reply) => {
  const { provider } = mockProvider({ candidate_actions: reply })
  return generateCandidateActions({ provider, factoryState: nova01State(), machineId: NOVA01_IDS.M4 })
}
const withPlan = (plan) => ({ plans: [{ ...PLANS_REPLY.plans[0], ...plan }], notes: '' })

describe('generateCandidateActions', () => {
  it('converts valid proposals into engine actions', async () => {
    const { candidates, rejected } = await generate(PLANS_REPLY)
    assert.deepEqual(rejected, [])
    assert.deepEqual(candidates.map((c) => c.actions), [
      [{ type: 'preventive_maintenance', machineId: NOVA01_IDS.M4, durationHours: 3, startHours: 0 }],
      [{ type: 'split_workload', fromMachineId: NOVA01_IDS.M4, productionLineId: 'a0000000-0000-0000-0000-000000000002', splits: [{ targetMachineId: NOVA01_IDS.M7, loadPerHour: 25 }] }],
    ])
    assert.deepEqual(candidates.map((c) => c.source), ['ai', 'ai'])
  })

  it('rejects an action type FORSEER does not support', async () => {
    const { candidates, rejected } = await generate(withPlan({ actions: [actionProposal('hire_contractor', { machineCode: 'M4' })] }))
    assert.equal(candidates.length, 0)
    assert.equal(rejected[0].reason, 'unsupported_action')
  })

  it('rejects figures that are not in the facts', async () => {
    const { rejected } = await generate(withPlan({ actions: [actionProposal('preventive_maintenance', { machineCode: 'M4', durationHours: 7.5 })] }))
    assert.equal(rejected[0].reason, 'not_grounded')
    assert.match(rejected[0].issues[0], /7\.5 does not appear in the facts/)
  })

  it('lets the engine reject an infeasible action (an incompatible machine taking over)', async () => {
    const plan = withPlan({ actions: [actionProposal('split_workload', { fromMachineCode: 'M4', lineCode: 'LINE-2', splits: [{ targetMachineCode: 'M1', loadPerHour: 25 }] })] })
    const { rejected } = await generate(plan)
    assert.equal(rejected[0].reason, 'engine_rejected')
    assert.ok(rejected[0].issues.some((issue) => /cannot take over work/.test(issue)))
  })

  it('lets the engine reject moving more load than the machine carries', async () => {
    const plan = withPlan({ actions: [actionProposal('split_workload', { fromMachineCode: 'M4', lineCode: 'LINE-2', splits: [{ targetMachineCode: 'M7', loadPerHour: 80 }] })] })
    const { rejected } = await generate(plan)
    assert.equal(rejected[0].reason, 'engine_rejected')
  })

  it('rejects a machine that does not exist', async () => {
    const { rejected } = await generate(withPlan({ actions: [actionProposal('preventive_maintenance', { machineCode: 'M42', durationHours: 3 })] }))
    assert.equal(rejected[0].reason, 'not_grounded')
    assert.match(rejected[0].issues.join(' '), /"M42" is not a machine/)
  })

  it('has a rule-based fallback that needs no AI', () => {
    const { candidates } = ruleBasedCandidatePlans({ factoryState: nova01State(), machineId: NOVA01_IDS.M4, mode: 'before' })
    assert.deepEqual(candidates.map((c) => c.actions[0].type), ['preventive_maintenance', 'split_workload'])
    assert.equal(candidates[0].actions[0].durationHours, 3)
    assert.deepEqual(candidates.map((c) => c.source), ['rule_based', 'rule_based'])
  })
})

describe('explainScenario', () => {
  const result = simulateScenario(nova01State(), HERO_SCENARIOS.doNothing)

  it('explains an engine result using only its figures', async () => {
    const { provider, calls } = mockProvider({ scenario_explanation: EXPLANATION_REPLY })
    const explanation = await explainScenario({ provider, factoryState: nova01State(), results: result })
    assert.equal(explanation.headline, EXPLANATION_REPLY.headline)
    assert.deepEqual(explanation.basedOnScenarioIds, ['hero-do-nothing'])
    assert.match(calls[0].prompt, /"capacityLossLineHours": 13\.18/)
  })

  it('rejects invented metrics and probabilities', async () => {
    const replies = [
      { ...EXPLANATION_REPLY, keyImpacts: ['ORD-0482 ends up 173 hours late.'] },
      { ...EXPLANATION_REPLY, headline: 'There is a 60% chance ORD-0482 is late.' },
    ]
    for (const reply of replies) {
      const { provider } = mockProvider({ scenario_explanation: reply })
      await assert.rejects(
        explainScenario({ provider, factoryState: nova01State(), results: result }),
        (error) => error instanceof AiError && error.code === AI_ERROR_CODES.INVALID_OUTPUT,
      )
    }
  })

  it('refuses input that is not an engine result', async () => {
    const { provider, calls } = mockProvider({ scenario_explanation: EXPLANATION_REPLY })
    await assert.rejects(
      explainScenario({ provider, factoryState: nova01State(), results: { scenarioId: 'x', metrics: { made: 'up' } } }),
      (error) => error.code === AI_ERROR_CODES.UNSUPPORTED_REQUEST,
    )
    assert.equal(calls.length, 0)
  })
})
