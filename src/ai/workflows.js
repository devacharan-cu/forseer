import {
  assessMachineRisk,
  calculateCurrentCapacity,
  compareScenarios,
  EngineValidationError,
  findRecurringPatterns,
  simulateScenario,
} from '../engine/index.js'
import { analyzeIncident } from './analyzeIncident.js'
import { analyzeMachineRisk } from './analyzeRisk.js'
import { buildOrderOutlook, ownLoadByLine, requireMachine } from './context.js'
import { describeAiError, isAiError } from './errors.js'
import { explainScenario } from './explainScenario.js'
import { generateCandidateActions, ruleBasedCandidatePlans } from './generateActions.js'
import { parseScenario } from './parseScenario.js'
import { recommendOption } from './recommend.js'

// Every workflow follows the same contract:
//   engine facts -> AI proposes -> engine evaluates -> AI explains
// AI steps are optional: if one fails, it is recorded in `ai.errors` and the
// workflow continues with engine-only results (and rule-based candidates).

async function attempt(step, errors, run) {
  try {
    return await run()
  } catch (error) {
    if (!isAiError(error)) throw error
    errors.push({ step, ...describeAiError(error) })
    return null
  }
}

function aiSummary(provider, errors) {
  return { available: Boolean(provider?.available) && errors.length === 0, errors }
}

// BEFORE mode: a machine shows elevated risk. Compare "do nothing" (the
// user-supplied hypothetical failure) with candidate preventive plans.
export async function runBeforeModeAnalysis({ provider, factoryState, machineId, hypotheticalFailure, maxPlans = 4 }) {
  const machine = requireMachine(factoryState, machineId)
  if (!hypotheticalFailure || typeof hypotheticalFailure !== 'object') {
    throw new EngineValidationError('BEFORE mode needs hypotheticalFailure { startHours, durationHours }', [
      'FORSEER does not predict when a machine fails; the failure being prevented is a stated assumption',
    ])
  }
  if (['failed', 'retired'].includes(machine.baselineState)) {
    throw new EngineValidationError(`${machine.code} is already ${machine.baselineState}; use AFTER mode (runAfterModeRecovery)`)
  }

  const errors = []
  const operationalRisk = assessMachineRisk(factoryState, machineId)
  const recurringPatterns = findRecurringPatterns(factoryState, machineId)
  const riskAnalysis = await attempt('analyzeMachineRisk', errors, () => analyzeMachineRisk({ provider, factoryState, machineId }))

  const failureEvent = {
    machineId,
    state: 'failed',
    startHours: hypotheticalFailure.startHours ?? 0,
    durationHours: hypotheticalFailure.durationHours,
    afterState: 'healthy',
    label: `${machine.code} hypothetical failure`,
  }
  const doNothing = {
    id: 'do-nothing',
    name: 'Do nothing',
    description: `Assumption (supplied by the user): ${machine.code} fails ${failureEvent.startHours} h from now and is down for ${failureEvent.durationHours} h.`,
    machineEvents: [failureEvent],
    actions: [],
  }
  const baseline = simulateScenario(factoryState, doNothing)

  const proposals = await attempt('generateCandidateActions', errors, () =>
    generateCandidateActions({ provider, factoryState, machineId, mode: 'before', scenarioResult: baseline, maxPlans }),
  )
  const planning = choosePlans(proposals, () => ruleBasedCandidatePlans({ factoryState, machineId, mode: 'before', maxPlans }))

  // Maintenance on the at-risk machine is evaluated as preventing the failure;
  // every other plan is evaluated with the failure still happening.
  const evaluation = evaluatePlans({
    factoryState,
    baselineScenario: doNothing,
    baseline,
    plans: planning.candidates,
    scenarioFor: (plan) => {
      const prevents = plan.actions.some((a) => a.type === 'preventive_maintenance' && a.machineId === machineId)
      return {
        machineEvents: prevents ? [] : [failureEvent],
        assumption: prevents
          ? `Assumes the maintenance prevents the ${machine.code} failure assumed in "Do nothing".`
          : `Assumes the ${machine.code} failure from "Do nothing" still happens.`,
      }
    },
  })

  return finish({ provider, factoryState, errors, evaluation, planning, mode: 'before', machine, extra: { operationalRisk, recurringPatterns, riskAnalysis } })
}

// AFTER mode: the machine has already failed (its recorded status says so).
// Compare doing nothing with recovery plans and produce an action sequence.
export async function runAfterModeRecovery({ provider, factoryState, machineId, incidentReport = null, repairEstimateHours = null, maxPlans = 4 }) {
  const machine = requireMachine(factoryState, machineId)
  if (!['failed', 'degraded'].includes(machine.baselineState)) {
    throw new EngineValidationError(`${machine.code} is ${machine.baselineState}, not failed or degraded; use BEFORE mode (runBeforeModeAnalysis)`)
  }

  const errors = []
  const incident = incidentReport
    ? await attempt('analyzeIncident', errors, () => analyzeIncident({ provider, factoryState, report: incidentReport, machineId }))
    : null
  const noAction = {
    id: 'no-recovery-action',
    name: 'No recovery action',
    description: `${machine.code} stays ${machine.baselineState}, as recorded.`,
    machineEvents: [],
    actions: [],
  }
  const baseline = simulateScenario(factoryState, noAction)

  const proposals = await attempt('generateCandidateActions', errors, () =>
    generateCandidateActions({ provider, factoryState, machineId, mode: 'after', scenarioResult: baseline, maxPlans, repairEstimateHours }),
  )
  const planning = choosePlans(proposals, () => ruleBasedCandidatePlans({ factoryState, machineId, mode: 'after', repairEstimateHours, maxPlans }))
  const evaluation = evaluatePlans({
    factoryState,
    baselineScenario: noAction,
    baseline,
    plans: planning.candidates,
    scenarioFor: () => ({ machineEvents: [], assumption: null }),
  })

  return finish({ provider, factoryState, errors, evaluation, planning, mode: 'after', machine, extra: { incident } })
}

// DURING mode: something is happening now. Structure the report and show the
// engine's current picture for that machine and its lines.
export async function runDuringModeAssessment({ provider, factoryState, report, machineId = null }) {
  const errors = []
  if (machineId) requireMachine(factoryState, machineId)
  const incident = await attempt('analyzeIncident', errors, () => analyzeIncident({ provider, factoryState, report, machineId }))
  const resolvedId = machineId ?? incident?.machine?.id ?? null

  let engineContext = null
  if (resolvedId) {
    const lineCodes = ownLoadByLine(factoryState, resolvedId).map((l) => l.lineCode)
    engineContext = {
      operationalRisk: assessMachineRisk(factoryState, resolvedId),
      recurringPatterns: findRecurringPatterns(factoryState, resolvedId),
      lineCapacity: calculateCurrentCapacity(factoryState).productionLines.filter((l) => lineCodes.includes(l.code)),
      orderOutlook: buildOrderOutlook(factoryState, lineCodes),
    }
  }
  return {
    mode: 'during',
    machineId: resolvedId,
    incident,
    engineContext,
    needsMachine: resolvedId === null,
    ai: aiSummary(provider, errors),
  }
}

// What-if: natural language -> scenario (AI) -> result (engine) -> explanation (AI).
export async function runWhatIf({ provider, factoryState, question, baseScenario = null }) {
  const errors = []
  const scenarioId = baseScenario?.id === 'what-if' ? 'what-if-next' : 'what-if'
  const parsed = await attempt('parseScenario', errors, () => parseScenario({ provider, factoryState, text: question, baseScenario, scenarioId }))
  if (!parsed) {
    return {
      type: 'ai_unavailable',
      message: 'The question could not be interpreted automatically. Build the scenario explicitly; the simulation engine works without AI.',
      ai: aiSummary(provider, errors),
    }
  }
  if (parsed.type !== 'scenario') return { ...parsed, ai: aiSummary(provider, errors) }

  const result = simulateScenario(factoryState, parsed.scenario)
  const baseResult = baseScenario ? simulateScenario(factoryState, baseScenario) : null
  const comparison = baseResult ? compareScenarios([baseResult, result]) : null
  const explanation = await attempt('explainScenario', errors, () =>
    explainScenario({ provider, factoryState, results: baseResult ? [baseResult, result] : [result], comparison }),
  )
  return {
    type: 'result',
    scenario: parsed.scenario,
    interpretation: parsed.interpretation,
    assumptions: parsed.assumptions,
    result,
    baseResult,
    comparison,
    explanation,
    ai: aiSummary(provider, errors),
  }
}

// The same engine path with no AI at all, for explicit scenarios built in the UI.
export function runStructuredWhatIf({ factoryState, scenario, baseScenario = null }) {
  const result = simulateScenario(factoryState, scenario)
  const baseResult = baseScenario ? simulateScenario(factoryState, baseScenario) : null
  return { type: 'result', scenario, result, baseResult, comparison: baseResult ? compareScenarios([baseResult, result]) : null }
}

function choosePlans(proposals, fallback) {
  if (proposals && proposals.candidates.length > 0) return { ...proposals, candidateSource: 'ai' }
  const rules = fallback()
  return { ...rules, rejected: [...(proposals?.rejected ?? []), ...rules.rejected], notes: proposals?.notes ?? null, candidateSource: 'rule_based' }
}

function evaluatePlans({ factoryState, baselineScenario, baseline, plans, scenarioFor }) {
  const options = []
  const rejected = []
  for (const plan of plans) {
    const { machineEvents, assumption } = scenarioFor(plan)
    const assumptions = [...plan.assumptions, ...(assumption ? [assumption] : [])]
    const scenario = {
      id: plan.id,
      name: plan.title,
      description: assumptions.join(' '),
      machineEvents,
      actions: plan.actions,
    }
    try {
      options.push({ plan, scenario, assumptions, result: simulateScenario(factoryState, scenario) })
    } catch (error) {
      if (!(error instanceof EngineValidationError)) throw error
      rejected.push({ proposal: plan, reason: 'engine_rejected', issues: error.issues.length > 0 ? error.issues : [error.message] })
    }
  }
  const comparison = options.length > 0 ? compareScenarios([baseline, ...options.map((o) => o.result)]) : null
  return { baselineScenario, baseline, options, rejected, comparison }
}

async function finish({ provider, factoryState, errors, evaluation, planning, mode, machine, extra }) {
  const { baseline, options, comparison } = evaluation
  const explanation =
    comparison === null
      ? null
      : await attempt('explainScenario', errors, () =>
          explainScenario({ provider, factoryState, results: [baseline, ...options.map((o) => o.result)], comparison }),
        )
  const recommendation =
    comparison === null
      ? null
      : await attempt('recommendOption', errors, () => recommendOption({ provider, factoryState, baseline, options, comparison }))

  return {
    mode,
    machine: { id: machine.id, code: machine.code },
    ...extra,
    baseline,
    options: options.map(({ plan, scenario, assumptions, result }) => ({ plan, scenario, assumptions, result })),
    rejectedPlans: [...planning.rejected, ...evaluation.rejected],
    candidateSource: planning.candidateSource,
    comparison,
    explanation,
    recommendation,
    ai: aiSummary(provider, errors),
  }
}
