import { EngineValidationError, simulateScenario } from '../engine/index.js'
import { resolveActionProposals } from './actionProposals.js'
import { buildScenarioParseFacts } from './context.js'
import { collectAllowedNumbers, isGroundedNumber, numbersImpliedByUserText } from './grounding.js'
import { SCENARIO_PROMPT } from './prompts/scenario.js'
import { buildReferenceIndex, isMachineMentioned, lookupMachine } from './references.js'
import { requestStructured } from './structured.js'

const STATE_WORDS = { failed: 'down', maintenance: 'in maintenance', degraded: 'degraded', retired: 'retired' }

// Translates a what-if question into an engine scenario. Returns one of:
//   { type: 'scenario', scenario, interpretation, assumptions }
//   { type: 'clarification_required', question, missing, unknownReferences, suggestedScenario? }
//   { type: 'unsupported', reason }
//   { type: 'invalid_scenario', issues }   (the engine rejected it)
// Anything the model would have had to guess becomes a clarification.
export async function parseScenario({ provider, factoryState, text, baseScenario = null, scenarioId = 'what-if' }) {
  if (typeof text !== 'string' || text.trim() === '') {
    return clarification('What would you like to simulate?', [{ field: 'question', question: 'What would you like to simulate?' }])
  }

  const facts = buildScenarioParseFacts(factoryState, baseScenario)
  const parsed = await requestStructured(provider, SCENARIO_PROMPT, { facts, userInput: text })
  const interpretation = parsed.interpretation

  if (parsed.outcome === 'unsupported') {
    return { type: 'unsupported', reason: parsed.unsupportedReason ?? 'FORSEER cannot simulate this request.', interpretation }
  }
  if (parsed.outcome === 'clarification_required') {
    const question = parsed.question ?? 'Could you say more precisely what you want to simulate?'
    return clarification(question, [{ field: 'question', question }], [], interpretation)
  }

  const extending = parsed.extendsBaseScenario && baseScenario !== null
  const ctx = {
    state: factoryState,
    index: buildReferenceIndex(factoryState),
    mode: 'parse',
    text,
    allowedNumbers: collectAllowedNumbers(numbersImpliedByUserText(text), extending ? scenarioFigures(baseScenario) : []),
    baseMachineIds: new Set(extending ? baseScenario.machineEvents.map((e) => e.machineId) : []),
  }

  const events = resolveEvents(parsed.machineEvents, ctx)
  const actions = resolveActionProposals(parsed.actions, ctx)
  const missing = [...events.missing, ...actions.missing]
  const unknownReferences = [...new Set([...events.unknownReferences, ...actions.unknownReferences])]
  const assumptions = [...events.assumptions, ...actions.assumptions]

  const machineEvents = [...(extending ? baseScenario.machineEvents : []), ...events.events]
  const scenarioActions = [...(extending ? baseScenario.actions ?? [] : []), ...actions.actions]
  const scenario = {
    id: scenarioId,
    name: interpretation.slice(0, 120) || scenarioId,
    description: `Parsed from: "${text.trim()}".${assumptions.length > 0 ? ` Assumptions: ${assumptions.join('; ')}.` : ''}`,
    machineEvents,
    actions: scenarioActions,
  }

  if (unknownReferences.length > 0) {
    const question = `I couldn't find ${unknownReferences.join(', ')} in this factory. Which machine or order did you mean?`
    return clarification(question, [{ field: 'reference', question }], unknownReferences, interpretation)
  }
  if (actions.issues.length > 0) return { type: 'invalid_scenario', issues: actions.issues, interpretation }
  if (missing.length > 0) {
    return clarification(
      missing.map((m) => m.question).filter((q, i, all) => all.indexOf(q) === i).join(' '),
      missing,
      [],
      interpretation,
      missing.length === events.pendingDuration.length ? suggestSameWindow(scenario, events, extending ? baseScenario : null, factoryState) : null,
    )
  }
  if (events.events.length === 0 && actions.actions.length === 0) {
    const question = 'What should change in the scenario (which machine, what happens, for how long)?'
    return clarification(question, [{ field: 'scenario', question }], [], interpretation)
  }

  try {
    simulateScenario(factoryState, scenario)
  } catch (error) {
    if (!(error instanceof EngineValidationError)) throw error
    return { type: 'invalid_scenario', issues: error.issues.length > 0 ? error.issues : [error.message], interpretation }
  }
  return { type: 'scenario', scenario, interpretation, assumptions }
}

function resolveEvents(proposed, ctx) {
  const outcome = { events: [], missing: [], unknownReferences: [], assumptions: [], pendingDuration: [] }
  proposed.forEach((event, i) => {
    const path = `machineEvents[${i}]`
    const machine = lookupMachine(ctx.index, event.machineCode)
    if (!machine) {
      outcome.unknownReferences.push(event.machineCode)
      return
    }
    if (!isMachineMentioned(ctx.text, machine) && !ctx.baseMachineIds.has(machine.id)) {
      outcome.missing.push({ field: `${path}.machineCode`, question: `The question does not name ${machine.code}. Which machine do you mean?` })
      return
    }
    const stateWord = STATE_WORDS[event.state] ?? event.state
    let complete = true

    let durationHours = null
    if (event.untilFurtherNotice) {
      outcome.assumptions.push(`${machine.code} stays ${stateWord} until the end of the simulated horizon`)
    } else if (event.durationHours === null || !isGroundedNumber(event.durationHours, ctx.allowedNumbers)) {
      outcome.missing.push({ field: `${path}.durationHours`, question: `For how long is ${machine.code} ${stateWord}?` })
      outcome.pendingDuration.push({ machineId: machine.id, state: event.state })
      complete = false
    } else {
      durationHours = event.durationHours
    }

    let startHours = 0
    if (event.startHours === null) outcome.assumptions.push(`${machine.code} is ${stateWord} starting now`)
    else if (isGroundedNumber(event.startHours, ctx.allowedNumbers)) startHours = event.startHours
    else {
      outcome.missing.push({ field: `${path}.startHours`, question: `When does it start for ${machine.code}, in hours from now?` })
      complete = false
    }

    const engineEvent = { machineId: machine.id, state: event.state, startHours, durationHours, label: `${machine.code} ${stateWord}` }
    if (event.state === 'degraded') {
      if (event.capacityFactor === null) outcome.assumptions.push(`${machine.code} runs at FORSEER's default degraded capacity`)
      else if (isGroundedNumber(event.capacityFactor, ctx.allowedNumbers)) engineEvent.capacityFactor = event.capacityFactor
      else {
        outcome.missing.push({ field: `${path}.capacityFactor`, question: `At what share of its capacity does ${machine.code} run while degraded?` })
        complete = false
      }
    }
    if (complete) outcome.events.push(engineEvent)
  })
  return outcome
}

// For "what if M7 is also unavailable?": offer (never assume) the base event's window.
function suggestSameWindow(scenario, events, baseScenario, factoryState) {
  if (!baseScenario || events.pendingDuration.length === 0) return null
  const windows = baseScenario.machineEvents.filter((e) => e.durationHours !== null)
  if (windows.length !== 1) return null
  const [window] = windows
  const suggestion = {
    ...scenario,
    machineEvents: [
      ...scenario.machineEvents,
      ...events.pendingDuration.map(({ machineId, state }) => ({
        machineId,
        state,
        startHours: window.startHours ?? 0,
        durationHours: window.durationHours,
        label: 'same window as the base scenario',
      })),
    ],
  }
  try {
    simulateScenario(factoryState, suggestion)
    return suggestion
  } catch (error) {
    if (error instanceof EngineValidationError) return null
    throw error
  }
}

function scenarioFigures(scenario) {
  const figures = []
  for (const event of scenario.machineEvents ?? []) figures.push(event.startHours ?? 0, event.durationHours, event.capacityFactor)
  for (const action of scenario.actions ?? []) {
    for (const key of ['durationHours', 'startHours', 'loadPerHour', 'fraction']) figures.push(action[key])
  }
  return figures.filter((value) => typeof value === 'number')
}

function clarification(question, missing, unknownReferences = [], interpretation = '', suggestedScenario = null) {
  return { type: 'clarification_required', question, missing, unknownReferences, interpretation, suggestedScenario }
}
