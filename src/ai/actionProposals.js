import { ACTION_TYPES, applyActions, EngineValidationError } from '../engine/index.js'
import { areCompatible, labelMaps } from './context.js'
import { isGroundedNumber } from './grounding.js'
import { isMachineMentioned, isOrderMentioned, lookupLine, lookupMachine, lookupOrder } from './references.js'

// Turns model-proposed actions (written with codes) into engine actions (ids).
//
// A proposal is accepted only if every reference resolves, every figure is
// grounded (in the user's words when parsing, in the facts when proposing),
// and the engine itself accepts the action. Nothing here changes the factory
// state: the engine check runs on a clone inside applyActions.
//
// mode "parse": gaps become clarification questions; references must be mentioned by the user.
// mode "candidate": gaps and ungrounded figures reject the proposal.
export function resolveActionProposals(proposals, ctx) {
  // issues: rejected by the engine or unsupported; ungrounded: figures not found in the facts.
  const outcome = { actions: [], assumptions: [], missing: [], unknownReferences: [], ungrounded: [], issues: [] }
  proposals.forEach((proposal, index) => resolveOne(proposal, `actions[${index}]`, ctx, outcome))

  const clean = [outcome.missing, outcome.unknownReferences, outcome.ungrounded, outcome.issues].every((list) => list.length === 0)
  if (outcome.actions.length > 0 && clean) {
    try {
      applyActions(ctx.state, outcome.actions)
    } catch (error) {
      if (!(error instanceof EngineValidationError)) throw error
      outcome.issues.push(...(error.issues.length > 0 ? error.issues : [error.message]))
    }
  }
  return outcome
}

function resolveOne(proposal, path, ctx, outcome) {
  const { state, index, mode } = ctx
  if (!ACTION_TYPES.includes(proposal.type)) {
    outcome.issues.push(`${path}.type "${proposal.type}" is not an action FORSEER supports`)
    return
  }
  const labels = labelMaps(state)
  let complete = true

  const ask = (field, question) => {
    complete = false
    outcome.missing.push({ field: `${path}.${field}`, question })
  }
  const ungrounded = (message) => {
    complete = false
    outcome.ungrounded.push(`${path}: ${message}`)
  }

  const machine = (field, reference, role) => {
    if (reference === null || reference === undefined) {
      ask(field, `Which machine should ${role}?`)
      return null
    }
    const found = lookupMachine(index, reference)
    if (!found) {
      complete = false
      outcome.unknownReferences.push(reference)
      return null
    }
    if (mode === 'parse' && !isMachineMentioned(ctx.text, found) && !ctx.baseMachineIds.has(found.id)) {
      ask(field, `The question does not name ${found.code}. Which machine should ${role}?`)
      return null
    }
    return found
  }

  const order = (reference) => {
    if (reference === null || reference === undefined) {
      ask('orderNumber', 'Which order do you mean?')
      return null
    }
    const found = lookupOrder(index, reference)
    if (!found) {
      complete = false
      outcome.unknownReferences.push(reference)
      return null
    }
    if (mode === 'parse' && !isOrderMentioned(ctx.text, found)) {
      ask('orderNumber', `The question does not name ${found.orderNumber}. Which order do you mean?`)
      return null
    }
    return found
  }

  // Figures must come from the user's words (parse) or the engine facts (candidate).
  const figure = (field, value, { required, question }) => {
    if (value === null || value === undefined) {
      if (required) ask(field, question)
      return null
    }
    if (!isGroundedNumber(value, ctx.allowedNumbers)) {
      if (mode === 'parse') ask(field, question)
      else ungrounded(`${field} ${value} does not appear in the facts FORSEER provided`)
      return null
    }
    return value
  }

  const start = (value, subject) => {
    const hours = figure('startHours', value, { required: false, question: `When should ${subject} start, in hours from now?` })
    if (value === null || value === undefined) outcome.assumptions.push(`${subject} starts now`)
    return hours ?? 0
  }

  let action = null
  switch (proposal.type) {
    case 'preventive_maintenance':
    case 'repair': {
      const target = machine('machineCode', proposal.machineCode, proposal.type === 'repair' ? 'be repaired' : 'be serviced')
      const durationHours = figure('durationHours', proposal.durationHours, {
        required: true,
        question: `How many hours will the ${proposal.type === 'repair' ? 'repair' : 'maintenance'}${target ? ` on ${target.code}` : ''} take?`,
      })
      const startHours = target ? start(proposal.startHours, `${proposal.type.replace('_', ' ')} on ${target.code}`) : 0
      if (target && durationHours !== null) action = { type: proposal.type, machineId: target.id, durationHours, startHours }
      break
    }
    case 'reroute_order': {
      const targetOrder = order(proposal.orderNumber)
      const targetMachine = machine('targetMachineCode', proposal.targetMachineCode, 'take over the work')
      const loadPerHour = figure('loadPerHour', proposal.loadPerHour, { required: false, question: 'How many units per hour should move?' })
      const named = proposal.fromMachineCode ? lookupMachine(index, proposal.fromMachineCode) : null
      const userNamedSource =
        named && (mode !== 'parse' || isMachineMentioned(ctx.text, named) || ctx.baseMachineIds.has(named.id))
      let from = null
      if (proposal.fromMachineCode && !named) {
        complete = false
        outcome.unknownReferences.push(proposal.fromMachineCode)
      } else if (userNamedSource) {
        from = named
      } else if (targetOrder && targetMachine) {
        from = inferSourceMachine(state, targetOrder, targetMachine, labels, outcome, ask)
      }
      if (targetOrder && targetMachine && from) {
        action = { type: 'reroute_order', orderId: targetOrder.id, fromMachineId: from.id, targetMachineId: targetMachine.id }
        if (loadPerHour !== null) action.loadPerHour = loadPerHour
        else if (complete) outcome.assumptions.push(`all of ${from.code}'s work on ${labels.lines.get(targetOrder.productionLineId)} moves to ${targetMachine.code}`)
      }
      break
    }
    case 'split_workload': {
      const from = machine('fromMachineCode', proposal.fromMachineCode, 'hand over part of its load')
      const line = lookupLine(index, proposal.lineCode)
      if (!line) {
        if (proposal.lineCode) {
          complete = false
          outcome.unknownReferences.push(proposal.lineCode)
        } else ask('lineCode', 'Which production line is the load on?')
      }
      if (!Array.isArray(proposal.splits) || proposal.splits.length === 0) ask('splits', 'Which machines should take the load, and how much?')
      const splits = (proposal.splits ?? []).map((split, i) => {
        const target = machine(`splits[${i}].targetMachineCode`, split.targetMachineCode, 'take part of the load')
        const load = figure(`splits[${i}].loadPerHour`, split.loadPerHour, { required: true, question: 'How many units per hour should move?' })
        return target && load !== null ? { targetMachineId: target.id, loadPerHour: load } : null
      })
      if (from && line && splits.length > 0 && splits.every(Boolean)) {
        action = { type: 'split_workload', fromMachineId: from.id, productionLineId: line.id, splits }
      }
      break
    }
    case 'reduce_machine_load': {
      const target = machine('machineCode', proposal.machineCode, 'run lighter')
      const fraction = figure('fraction', proposal.fraction, { required: true, question: 'By how much should the load be reduced?' })
      if (target && fraction !== null) action = { type: 'reduce_machine_load', machineId: target.id, fraction }
      break
    }
    case 'reschedule_order': {
      const targetOrder = order(proposal.orderNumber)
      const deadline = groundedDeadline(proposal.newDeadline, ctx)
      if (deadline === null) ask('newDeadline', 'What should the new deadline be?')
      if (targetOrder && deadline) action = { type: 'reschedule_order', orderId: targetOrder.id, newDeadline: deadline }
      break
    }
  }

  if (complete && action) outcome.actions.push(action)
}

// "Move ORD-0482 to M7" does not say whose work moves. If exactly one machine on
// the order's line can hand work to the target, that is the only reading; otherwise ask.
function inferSourceMachine(state, targetOrder, targetMachine, labels, outcome, ask) {
  const lineCode = labels.lines.get(targetOrder.productionLineId)
  const candidates = state.machineLineAssignments
    .filter((a) => a.productionLineId === targetOrder.productionLineId && a.coversMachineId === null && a.machineId !== targetMachine.id)
    .map((a) => state.machines.find((m) => m.id === a.machineId))
    .filter((m) => areCompatible(state, m, targetMachine))
  if (candidates.length === 1) {
    outcome.assumptions.push(`${candidates[0].code} is the only machine on ${lineCode} whose work ${targetMachine.code} can take over`)
    return candidates[0]
  }
  ask('fromMachineCode', `Which machine's work on ${lineCode} should move to ${targetMachine.code}?`)
  return null
}

function groundedDeadline(value, ctx) {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return null
  const iso = new Date(ms).toISOString()
  if (ctx.mode === 'parse') {
    // The user must have written the day of the month.
    return isGroundedNumber(new Date(ms).getUTCDate(), ctx.allowedNumbers) ? iso : null
  }
  return ctx.allowedDates.has(iso.slice(0, 10)) ? iso : null
}
