import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AI_ERROR_CODES, AiError, parseScenario } from '../../src/ai/index.js'
import { actionProposal, mockProvider, NOVA01_IDS, nova01State, scenarioReply } from './support.js'

const parse = (reply, text, extra = {}) => {
  const { provider, calls } = mockProvider({ scenario_parse: reply })
  return parseScenario({ provider, factoryState: nova01State(), text, ...extra }).then((result) => ({ result, calls }))
}

describe('parseScenario', () => {
  it('turns a clear question into an engine scenario', async () => {
    const { result, calls } = await parse(
      scenarioReply({ events: [{ machineCode: 'M4', state: 'failed', durationHours: 8 }] }),
      'What happens if M4 fails for 8 hours?',
    )
    assert.equal(result.type, 'scenario')
    assert.deepEqual(result.scenario.machineEvents, [{ machineId: NOVA01_IDS.M4, state: 'failed', startHours: 0, durationHours: 8, label: 'M4 down' }])
    assert.deepEqual(result.assumptions, ['M4 is down starting now'])
    assert.match(calls[0].prompt, /<user_input>\nWhat happens if M4 fails for 8 hours\?/)
  })

  it('handles several shocks and durations written in days', async () => {
    const { result } = await parse(
      scenarioReply({
        events: [
          { machineCode: 'M4', state: 'failed', durationHours: 12 },
          { machineCode: 'M7', state: 'maintenance', durationHours: 24 },
        ],
      }),
      'M4 is down for 12 hours and M7 is in maintenance for a day.',
    )
    assert.equal(result.type, 'scenario')
    assert.deepEqual(result.scenario.machineEvents.map((e) => e.durationHours), [12, 24])
  })

  it('parses a preventive maintenance action', async () => {
    const { result } = await parse(
      scenarioReply({ actions: [actionProposal('preventive_maintenance', { machineCode: 'M4', durationHours: 2.5 })] }),
      'What happens if we perform preventive maintenance on M4 for 2.5 hours?',
    )
    assert.equal(result.type, 'scenario')
    assert.deepEqual(result.scenario.actions, [{ type: 'preventive_maintenance', machineId: NOVA01_IDS.M4, durationHours: 2.5, startHours: 0 }])
  })

  it('infers the only machine whose work can move for "move ORD-0482 to M7", and says so', async () => {
    const { result } = await parse(
      scenarioReply({ actions: [actionProposal('reroute_order', { orderNumber: 'ORD-0482', targetMachineCode: 'M7' })] }),
      'What happens if we move ORD-0482 to M7?',
    )
    assert.equal(result.type, 'scenario')
    assert.deepEqual(result.scenario.actions, [
      { type: 'reroute_order', orderId: NOVA01_IDS.ORD_0482, fromMachineId: NOVA01_IDS.M4, targetMachineId: NOVA01_IDS.M7 },
    ])
    assert.ok(result.assumptions.some((a) => a.startsWith('M4 is the only machine on LINE-2')))
  })

  it('asks instead of accepting a duration the user never gave', async () => {
    const { result } = await parse(scenarioReply({ events: [{ machineCode: 'M4', state: 'failed', durationHours: 8 }] }), 'What happens if M4 fails?')
    assert.equal(result.type, 'clarification_required')
    assert.equal(result.question, 'For how long is M4 down?')
  })

  it('asks instead of silently choosing a machine', async () => {
    const { result } = await parse(scenarioReply({ events: [{ machineCode: 'M4', state: 'failed', durationHours: 8 }] }), 'What happens if a machine fails for 8 hours?')
    assert.equal(result.type, 'clarification_required')
    assert.match(result.question, /does not name M4/)
  })

  it('passes through a clarification from the model', async () => {
    const { result } = await parse(scenarioReply({ outcome: 'clarification_required', question: 'Which machine do you want to simulate?' }), 'What if something breaks?')
    assert.deepEqual([result.type, result.question], ['clarification_required', 'Which machine do you want to simulate?'])
  })

  it('reports an unknown machine reference', async () => {
    const { result } = await parse(scenarioReply({ events: [{ machineCode: 'M99', state: 'failed', durationHours: 8 }] }), 'What if M99 fails for 8 hours?')
    assert.equal(result.type, 'clarification_required')
    assert.deepEqual(result.unknownReferences, ['M99'])
  })

  it('offers, but does not assume, the base window for "M7 is also unavailable"', async () => {
    const baseScenario = { id: 'what-if', name: 'M4 offline', machineEvents: [{ machineId: NOVA01_IDS.M4, state: 'failed', startHours: 0, durationHours: 12 }], actions: [] }
    const { result } = await parse(
      scenarioReply({ extendsBaseScenario: true, events: [{ machineCode: 'M7', state: 'failed', durationHours: null }] }),
      'What if M7 is also unavailable?',
      { baseScenario },
    )
    assert.equal(result.type, 'clarification_required')
    assert.equal(result.question, 'For how long is M7 down?')
    assert.deepEqual(
      result.suggestedScenario.machineEvents.map((e) => [e.machineId, e.startHours, e.durationHours]),
      [[NOVA01_IDS.M4, 0, 12], [NOVA01_IDS.M7, 0, 12]],
    )
  })

  it('lets the engine reject an invalid action (repairing a machine that has not failed)', async () => {
    const { result } = await parse(
      scenarioReply({ actions: [actionProposal('repair', { machineCode: 'M4', durationHours: 4 })] }),
      'What if we repair M4 for 4 hours?',
    )
    assert.equal(result.type, 'invalid_scenario')
    assert.ok(result.issues.some((issue) => /use preventive_maintenance/.test(issue)))
  })

  it('reports unsupported requests', async () => {
    const { result } = await parse(scenarioReply({ outcome: 'unsupported', unsupportedReason: 'FORSEER cannot simulate hiring staff.' }), 'What if we hire two technicians?')
    assert.deepEqual([result.type, result.reason], ['unsupported', 'FORSEER cannot simulate hiring staff.'])
  })

  it('rejects a reply that breaks the schema', async () => {
    const reply = { ...scenarioReply({ events: [{ machineCode: 'M4', state: 'exploded', durationHours: 8 }] }) }
    await assert.rejects(parse(reply, 'M4 fails for 8 hours'), (error) => error instanceof AiError && error.code === AI_ERROR_CODES.INVALID_OUTPUT)
  })

  it('asks for a question when given empty text, without calling the AI', async () => {
    const { result, calls } = await parse(scenarioReply(), '   ')
    assert.equal(result.type, 'clarification_required')
    assert.equal(calls.length, 0)
  })
})
