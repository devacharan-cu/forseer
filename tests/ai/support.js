import { NOVA01_IDS } from '../../src/data/nova01.js'
import { createAiProvider } from '../../src/ai/index.js'

export { nova01State, freezeDeep } from '../engine/support.js'
export { NOVA01_IDS }

// Any network access during AI tests is a bug: the suite must never depend on a live provider.
export const network = { calls: 0 }
globalThis.fetch = async () => {
  network.calls += 1
  throw new Error('Network access is disabled in tests')
}

// A provider whose transport returns canned replies per task and records every request.
export function mockProvider(responses, { timeoutMs = 1000 } = {}) {
  const calls = []
  const provider = createAiProvider({
    name: 'mock',
    timeoutMs,
    transport: async (request, options) => {
      calls.push({ ...request, signal: options?.signal })
      const response = responses[request.task]
      if (response === undefined) throw new Error(`No mock reply for task ${request.task}`)
      return typeof response === 'function' ? response(request) : structuredClone(response)
    },
  })
  return { provider, calls }
}

export const RISK_REPLY = {
  summary: 'FORSEER classifies M4 as CRITICAL operational risk because vibration keeps recurring, an incident is still open and its service interval has passed.',
  contributingFactors: [
    { signal: 'recurring_incident_pattern', explanation: 'Vibration appears in 4 incidents.' },
    { signal: 'unresolved_incident', explanation: 'A high-severity vibration incident is still open.' },
  ],
  historicalEvidence: [
    { reference: 'inc-04', observation: 'Vibration rising under peak load while running ORD-0482.' },
    { reference: 'mnt-03', observation: 'Bearing replaced after elevated vibration.' },
  ],
  concerns: ['Vibration returned after the bearing repair.'],
  suggestedPreventiveActions: [{ actionType: 'preventive_maintenance', description: 'Service M4 before the next long run.' }],
  uncertainty: 'The records do not identify which component is at fault.',
}

export const INCIDENT_REPLY = {
  machineReference: 'M4',
  symptom: 'abnormal vibration',
  additionalSymptoms: ['unusual noise'],
  suggestedSeverity: 'high',
  observedFacts: [
    { statement: 'Heavy vibration during the second production run.', source: 'report', reference: null },
    { statement: 'M4 has had vibration incidents before.', source: 'history', reference: 'inc-02' },
  ],
  inferences: [
    { statement: 'The pattern resembles earlier vibration incidents on M4.', basis: 'inc-02 and inc-03 describe similar vibration.', confidence: 'medium' },
  ],
  historicalMatches: [{ incidentId: 'inc-03', similarity: 'Vibration returned after the repair.' }],
  recommendedChecks: ['Inspect the spindle housing noted in earlier maintenance.'],
  summary: 'Vibration and unusual noise on M4, similar to earlier incidents.',
}

export function actionProposal(type, fields = {}) {
  return {
    type,
    machineCode: null,
    orderNumber: null,
    fromMachineCode: null,
    targetMachineCode: null,
    lineCode: null,
    durationHours: null,
    startHours: null,
    loadPerHour: null,
    fraction: null,
    newDeadline: null,
    splits: [],
    ...fields,
  }
}

export function scenarioReply({ outcome = 'scenario', events = [], actions = [], extendsBaseScenario = false, question = null, unsupportedReason = null } = {}) {
  return {
    outcome,
    interpretation: 'Interpretation of the question',
    question,
    unsupportedReason,
    extendsBaseScenario,
    machineEvents: events.map((event) => ({
      startHours: null,
      durationHours: null,
      untilFurtherNotice: false,
      capacityFactor: null,
      ...event,
    })),
    actions,
  }
}

export const PLANS_REPLY = {
  plans: [
    {
      title: 'Service M4 now',
      actions: [actionProposal('preventive_maintenance', { machineCode: 'M4', durationHours: 3 })],
      rationale: 'The last preventive service on M4 took 3 hours and vibration keeps recurring.',
      expectedEffect: 'Should avoid the unplanned failure if the service addresses the vibration.',
      risks: 'LINE-2 loses output while M4 is serviced.',
    },
    {
      title: 'Shift load from M4 to M7',
      actions: [actionProposal('split_workload', { fromMachineCode: 'M4', lineCode: 'LINE-2', splits: [{ targetMachineCode: 'M7', loadPerHour: 25 }] })],
      rationale: 'M7 is a same-type machine with 25 units per hour of spare capacity.',
      expectedEffect: 'Should keep LINE-2 producing more while M4 is down.',
      risks: 'M7 would run at its limit.',
    },
  ],
  notes: 'Both plans rely on records in FACTS.',
}

export const EXPLANATION_REPLY = {
  headline: 'If M4 is down for 16 hours, ORD-0482 misses its deadline.',
  causalChain: [
    'M4 fails, so M5 and M6 lose their input.',
    'LINE-2 loses 13.18 line-hours of production.',
    'ORD-0482 finishes 3.18 hours after its deadline.',
  ],
  keyImpacts: ['ORD-0482 moves from WARNING to BREACHED.'],
  warnings: ['The failure timing is an assumption supplied by the user.'],
  explanation: 'The engine traced the failure from M4 through LINE-2 to the orders queued on it.',
  tradeoffs: [],
}

export const RECOMMENDATION_REPLY = {
  recommendedScenarioId: 'ai-plan-1',
  rationale: 'Servicing M4 now avoids the ORD-0482 breach in the simulated results.',
  actionSequence: ['Schedule the preventive service on M4 now.', 'Resume normal production on LINE-2 afterwards.'],
  tradeoffs: ['LINE-2 loses some output during the service.'],
  caveats: ['Assumes the service prevents the failure.'],
  evidenceStrength: 'medium',
}
