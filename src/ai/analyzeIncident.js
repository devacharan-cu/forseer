import { assessMachineRisk, findRecurringPatterns } from '../engine/index.js'
import { buildIncidentFacts, requireMachine } from './context.js'
import { AI_ERROR_CODES, AiError } from './errors.js'
import { checkTextClaims, collectAllowedNumbers, numbersImpliedByUserText } from './grounding.js'
import { INCIDENT_PROMPT } from './prompts/incident.js'
import { buildReferenceIndex, lookupMachine } from './references.js'
import { rejectIfInvalid, requestStructured } from './structured.js'

// Structures a free-text incident report. Observed facts and AI inferences are
// kept apart; history matches must cite real records. The result includes an
// incident draft for the app to save only after a person confirms it.
export async function analyzeIncident({ provider, factoryState, report, machineId = null }) {
  if (typeof report !== 'string' || report.trim() === '') {
    throw new AiError(AI_ERROR_CODES.UNSUPPORTED_REQUEST, 'An incident report needs some text')
  }
  if (machineId) requireMachine(factoryState, machineId)

  const facts = buildIncidentFacts(factoryState, machineId)
  const analysis = await requestStructured(provider, INCIDENT_PROMPT, { facts, userInput: report })

  const issues = checkTextClaims(analysis, collectAllowedNumbers(facts, numbersImpliedByUserText(report)))
  const incidentIds = new Set(facts.incidentHistory.map((i) => i.id))
  const recordIds = new Set([...incidentIds, ...facts.maintenanceHistory.map((m) => m.id)])
  analysis.historicalMatches.forEach((match, i) => {
    if (!incidentIds.has(match.incidentId)) issues.push(`historicalMatches[${i}].incidentId "${match.incidentId}" is not in the incident history`)
  })
  analysis.observedFacts.forEach((fact, i) => {
    if (fact.source === 'history' && !recordIds.has(fact.reference)) {
      issues.push(`observedFacts[${i}] cites "${fact.reference}", which is not a record in the facts`)
    }
  })

  // Which machine is this about? The caller's choice wins; otherwise the model's
  // reference must resolve, or be something the operator actually wrote.
  let machine = machineId ? requireMachine(factoryState, machineId) : null
  let unresolvedReference = null
  if (analysis.machineReference) {
    const referenced = lookupMachine(buildReferenceIndex(factoryState), analysis.machineReference)
    if (machine && referenced && referenced.id !== machine.id) {
      issues.push(`machineReference ${referenced.code} conflicts with the selected machine ${machine.code}`)
    } else if (!machine && referenced) {
      machine = referenced
    } else if (!referenced) {
      if (report.toLowerCase().includes(analysis.machineReference.toLowerCase())) unresolvedReference = analysis.machineReference
      else issues.push(`machineReference "${analysis.machineReference}" is neither a known machine nor in the report`)
    }
  }
  rejectIfInvalid('incident analysis', issues)

  return {
    machine: machine ? { id: machine.id, code: machine.code } : null,
    unresolvedReference,
    clarification: unresolvedReference
      ? `There is no machine "${unresolvedReference}" in this factory. Which machine is the report about?`
      : machine
        ? null
        : 'The report does not say which machine is affected. Which machine is it?',
    analysis,
    engineContext: machine
      ? {
          operationalRisk: assessMachineRisk(factoryState, machine.id),
          recurringPatterns: findRecurringPatterns(factoryState, machine.id),
        }
      : null,
    incidentDraft: machine
      ? {
          machine_id: machine.id,
          description: report.trim(),
          severity: analysis.suggestedSeverity,
          status: 'open',
          ai_summary: analysis.summary,
          ai_analysis: analysis,
        }
      : null,
    requiresConfirmation: true,
    sources: { analysis: 'ai', engineContext: 'deterministic_engine' },
  }
}
