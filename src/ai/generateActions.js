import { ACTION_TYPES } from '../engine/index.js'
import { resolveActionProposals } from './actionProposals.js'
import { buildCandidateFacts } from './context.js'
import { checkTextClaims, collectAllowedNumbers } from './grounding.js'
import { CANDIDATE_PROMPT, PLAN_SCHEMA } from './prompts/actions.js'
import { buildReferenceIndex } from './references.js'
import { validateJson } from './schema.js'
import { datesIn, requestStructured } from './structured.js'

const DEFAULT_MAX_PLANS = 4

// Asks the model for candidate plans, then keeps only those the engine accepts
// and whose figures come from the facts. Plans are proposals: nothing is chosen
// or applied here. The deterministic engine evaluates them next.
export async function generateCandidateActions({
  provider,
  factoryState,
  machineId,
  mode = 'before',
  scenarioResult = null,
  maxPlans = DEFAULT_MAX_PLANS,
  repairEstimateHours = null,
}) {
  const facts = buildCandidateFacts(factoryState, machineId, { mode, scenarioResult, maxPlans, repairEstimateHours })
  const output = await requestStructured(provider, CANDIDATE_PROMPT, { facts })
  return { ...validatePlans(output.plans.slice(0, maxPlans), { factoryState, facts, source: 'ai' }), notes: output.notes }
}

// Engine-only fallback used when the AI is unavailable or proposes nothing usable:
// service the machine for as long as its last service took, and move load to
// compatible machines that have spare capacity.
export function ruleBasedCandidatePlans({ factoryState, machineId, mode = 'before', repairEstimateHours = null, maxPlans = DEFAULT_MAX_PLANS }) {
  const facts = buildCandidateFacts(factoryState, machineId, { mode, scenarioResult: null, maxPlans, repairEstimateHours })
  const code = facts.machine.code
  const plans = []

  if (mode === 'before') {
    const [lastService] = facts.maintenanceHistoryDurations.preventive
    if (lastService) {
      plans.push(plan(`Preventive maintenance on ${code}`, [proposal('preventive_maintenance', { machineCode: code, durationHours: lastService.durationHours })],
        `Service ${code} for as long as its last preventive service took.`))
    }
  } else {
    const repairHours = repairEstimateHours ?? facts.maintenanceHistoryDurations.repair[0]?.durationHours ?? null
    if (repairHours !== null) {
      plans.push(plan(`Repair ${code}`, [proposal('repair', { machineCode: code, durationHours: repairHours })],
        repairEstimateHours !== null ? `Repair ${code} using the repair estimate provided.` : `Repair ${code}, assuming it takes as long as its last repair.`))
    }
  }

  for (const { lineCode, loadPerHour } of facts.currentWorkload.loadByLine) {
    for (const alternative of facts.alternativeMachines) {
      if (alternative.spareCapacityPerHour <= 0 || alternative.engineState === 'failed' || alternative.engineState === 'retired') continue
      const load = Math.min(alternative.spareCapacityPerHour, loadPerHour)
      plans.push(plan(`Move ${load}/h of ${code}'s ${lineCode} load to ${alternative.code}`,
        [proposal('split_workload', { fromMachineCode: code, lineCode, splits: [{ targetMachineCode: alternative.code, loadPerHour: load }] })],
        `${alternative.code} is a ${alternative.relation === 'backup' ? 'backup' : 'same-type'} machine with spare capacity.`))
    }
  }

  return validatePlans(plans.slice(0, maxPlans), { factoryState, facts, source: 'rule_based' })
}

export function validatePlans(plans, { factoryState, facts, source }) {
  const allowedNumbers = collectAllowedNumbers(facts)
  const ctx = {
    state: factoryState,
    index: buildReferenceIndex(factoryState),
    mode: 'candidate',
    allowedNumbers,
    allowedDates: datesIn(facts),
    baseMachineIds: new Set(),
  }
  const candidates = []
  const rejected = []

  plans.forEach((raw, index) => {
    const structureIssues = validateJson(raw, PLAN_SCHEMA, `plans[${index}]`)
    if (structureIssues.length > 0) {
      const unsupported = Array.isArray(raw?.actions) && raw.actions.some((action) => !ACTION_TYPES.includes(action?.type))
      rejected.push({ proposal: raw, reason: unsupported ? 'unsupported_action' : 'invalid_structure', issues: structureIssues })
      return
    }
    const textIssues = checkTextClaims(
      { title: raw.title, rationale: raw.rationale, expectedEffect: raw.expectedEffect, risks: raw.risks },
      allowedNumbers,
      `plans[${index}]`,
    )
    const resolved = resolveActionProposals(raw.actions, ctx)
    const problems = [
      ...textIssues,
      ...resolved.ungrounded,
      ...resolved.issues,
      ...resolved.missing.map((m) => `${m.field} is missing or not grounded in the facts`),
      ...resolved.unknownReferences.map((ref) => `"${ref}" is not a machine, line or order in this factory`),
    ]
    if (resolved.actions.length === 0 && problems.length === 0) problems.push('the plan contains no actions')
    if (problems.length > 0) {
      rejected.push({ proposal: raw, reason: resolved.issues.length > 0 ? 'engine_rejected' : 'not_grounded', issues: problems })
      return
    }
    candidates.push({
      id: `${source === 'ai' ? 'ai' : 'rule'}-plan-${candidates.length + 1}`,
      title: raw.title,
      rationale: raw.rationale,
      expectedEffect: raw.expectedEffect,
      risks: raw.risks,
      actions: resolved.actions,
      assumptions: resolved.assumptions,
      source,
    })
  })
  return { candidates, rejected }
}

function proposal(type, fields) {
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

function plan(title, actions, rationale) {
  return { title, actions, rationale, expectedEffect: 'Evaluated by the FORSEER engine.', risks: 'See the simulated results.' }
}
