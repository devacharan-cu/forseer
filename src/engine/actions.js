import { buildCapacityContext } from './capacity.js'
import { ACTION_TYPES } from './constants.js'
import { assertEngineState, cloneFactoryState } from './factoryState.js'
import { HOUR_MS, isPlainObject, parseTimestamp, TINY } from './helpers.js'
import { isOpenOrder } from './orders.js'
import { checkAllowedKeys, EngineValidationError, isFiniteNumber, throwIfIssues } from './validation.js'

const REPAIRABLE_STATES = ['failed', 'degraded']
const CANNOT_ABSORB_LOAD_STATES = ['failed', 'retired']

// Returns a NEW factory state with the action applied; the input is never modified.
export function applyAction(factoryState, action) {
  assertEngineState(factoryState)
  const next = cloneFactoryState(factoryState)
  applyActionTo(next, action, 'action')
  return next
}

export function applyActions(factoryState, actions) {
  assertEngineState(factoryState)
  if (!Array.isArray(actions)) throw new EngineValidationError('actions must be an array')
  const next = cloneFactoryState(factoryState)
  actions.forEach((action, index) => applyActionTo(next, action, `actions[${index}]`))
  return next
}

// Mutates `state`, which is always a private clone owned by applyAction(s).
function applyActionTo(state, action, path) {
  if (!isPlainObject(action)) throw new EngineValidationError(`${path} must be an object`)
  const handler = HANDLERS[action.type]
  if (!handler) throw new EngineValidationError(`${path}.type must be one of: ${ACTION_TYPES.join(', ')}`)
  const effect = handler(state, action, path)
  state.appliedActions.push({ action: structuredClone(action), effect })
}

const HANDLERS = {
  preventive_maintenance: scheduleServiceWindow,
  repair: scheduleServiceWindow,
  reroute_order: rerouteOrder,
  split_workload: splitWorkload,
  reduce_machine_load: reduceMachineLoad,
  reschedule_order: rescheduleOrder,
}

// Both actions take the machine offline for the window and return it healthy afterwards.
// Whether that prevents a future failure is a scenario assumption, not something the engine infers.
function scheduleServiceWindow(state, action, path) {
  const issues = []
  checkAllowedKeys(action, ['type', 'machineId', 'durationHours', 'startHours', 'label'], path, issues)
  const machine = findMachine(state, action.machineId, `${path}.machineId`, issues)
  if (!(isFiniteNumber(action.durationHours) && action.durationHours > 0)) {
    issues.push(`${path}.durationHours must be a positive number`)
  }
  const startHours = action.startHours ?? 0
  if (!(isFiniteNumber(startHours) && startHours >= 0)) issues.push(`${path}.startHours must be a number >= 0`)
  checkOptionalLabel(action, path, issues)
  if (action.type === 'repair' && machine && !REPAIRABLE_STATES.includes(machine.baselineState)) {
    issues.push(
      `${path}: repair applies to a machine that is currently failed or degraded (${machine.code} is ${machine.baselineState}); use preventive_maintenance instead`,
    )
  }
  throwIfIssues(`Invalid ${action.type} action`, issues)

  state.plannedMachineEvents.push({
    machineId: machine.id,
    state: 'maintenance',
    startHours,
    durationHours: action.durationHours,
    capacityFactor: null,
    afterState: 'healthy',
    label: action.label ?? `${action.type}:${machine.code}`,
    actionType: action.type,
  })
  return { kind: 'service_window', machineId: machine.id, startHours, durationHours: action.durationHours }
}

// Moves the stage work `fromMachineId` performs on the order's line onto the target
// machine. Orders are line-level, so every order on that line shares the benefit in queue order.
function rerouteOrder(state, action, path) {
  const issues = []
  checkAllowedKeys(action, ['type', 'orderId', 'fromMachineId', 'targetMachineId', 'loadPerHour', 'label'], path, issues)
  const order = findOpenOrder(state, action.orderId, `${path}.orderId`, issues)
  const from = findMachine(state, action.fromMachineId, `${path}.fromMachineId`, issues)
  findMachine(state, action.targetMachineId, `${path}.targetMachineId`, issues)
  if (action.loadPerHour !== undefined && !(isFiniteNumber(action.loadPerHour) && action.loadPerHour > 0)) {
    issues.push(`${path}.loadPerHour must be a positive number`)
  }
  checkOptionalLabel(action, path, issues)
  throwIfIssues('Invalid reroute_order action', issues)

  const fromAssignment = findOwnAssignment(state, from.id, order.productionLineId)
  if (!fromAssignment) {
    throw new EngineValidationError('Invalid reroute_order action', [
      `${path}: ${from.code} does not work on the production line of ${order.orderNumber}`,
    ])
  }
  const loadPerHour = action.loadPerHour ?? fromAssignment.contributionPerHour
  const transfer = transferLoad(
    state,
    { fromMachineId: from.id, targetMachineId: action.targetMachineId, productionLineId: order.productionLineId, loadPerHour },
    path,
  )
  return { kind: 'load_transfer', orderId: order.id, transfers: [transfer] }
}

function splitWorkload(state, action, path) {
  const issues = []
  checkAllowedKeys(action, ['type', 'fromMachineId', 'productionLineId', 'splits', 'label'], path, issues)
  const from = findMachine(state, action.fromMachineId, `${path}.fromMachineId`, issues)
  if (!state.productionLines.some((line) => line.id === action.productionLineId)) {
    issues.push(`${path}.productionLineId "${action.productionLineId}" does not match any production line`)
  }
  checkOptionalLabel(action, path, issues)
  if (!Array.isArray(action.splits) || action.splits.length === 0) {
    issues.push(`${path}.splits must be a non-empty array`)
  } else {
    const targets = new Set()
    action.splits.forEach((split, index) => {
      const splitPath = `${path}.splits[${index}]`
      if (!isPlainObject(split)) {
        issues.push(`${splitPath} must be an object`)
        return
      }
      checkAllowedKeys(split, ['targetMachineId', 'loadPerHour'], splitPath, issues)
      findMachine(state, split.targetMachineId, `${splitPath}.targetMachineId`, issues)
      if (!(isFiniteNumber(split.loadPerHour) && split.loadPerHour > 0)) {
        issues.push(`${splitPath}.loadPerHour must be a positive number`)
      }
      if (targets.has(split.targetMachineId)) issues.push(`${splitPath} repeats target machine`)
      targets.add(split.targetMachineId)
    })
  }
  throwIfIssues('Invalid split_workload action', issues)

  const fromAssignment = findOwnAssignment(state, from.id, action.productionLineId)
  const totalLoad = action.splits.reduce((total, split) => total + split.loadPerHour, 0)
  if (fromAssignment && totalLoad > fromAssignment.contributionPerHour + TINY) {
    throw new EngineValidationError('Invalid split_workload action', [
      `${path}: splits total ${totalLoad}/h but ${from.code} only carries ${fromAssignment.contributionPerHour}/h on that line`,
    ])
  }
  const transfers = action.splits.map((split, index) =>
    transferLoad(
      state,
      {
        fromMachineId: from.id,
        targetMachineId: split.targetMachineId,
        productionLineId: action.productionLineId,
        loadPerHour: split.loadPerHour,
      },
      `${path}.splits[${index}]`,
    ),
  )
  return { kind: 'load_transfer', orderId: null, transfers }
}

// Runs the machine lighter without moving the work anywhere, so its stage (and
// anything downstream of it) produces less. Pair with split_workload to keep output.
function reduceMachineLoad(state, action, path) {
  const issues = []
  checkAllowedKeys(action, ['type', 'machineId', 'fraction', 'label'], path, issues)
  const machine = findMachine(state, action.machineId, `${path}.machineId`, issues)
  if (!(isFiniteNumber(action.fraction) && action.fraction > 0 && action.fraction <= 1)) {
    issues.push(`${path}.fraction must be a number greater than 0 and at most 1`)
  }
  checkOptionalLabel(action, path, issues)
  const ownAssignments = machine
    ? state.machineLineAssignments.filter((a) => a.machineId === machine.id && a.coversMachineId === null)
    : []
  if (machine && ownAssignments.length === 0) issues.push(`${path}: ${machine.code} has no assigned load to reduce`)
  throwIfIssues('Invalid reduce_machine_load action', issues)

  for (const assignment of ownAssignments) assignment.contributionPerHour *= 1 - action.fraction
  return { kind: 'load_reduction', machineId: machine.id, fraction: action.fraction }
}

function rescheduleOrder(state, action, path) {
  const issues = []
  checkAllowedKeys(action, ['type', 'orderId', 'newDeadline', 'label'], path, issues)
  const order = findOpenOrder(state, action.orderId, `${path}.orderId`, issues)
  const newDeadlineMs = parseTimestamp(action.newDeadline)
  if (newDeadlineMs === null) issues.push(`${path}.newDeadline must be a valid timestamp`)
  checkOptionalLabel(action, path, issues)
  throwIfIssues('Invalid reschedule_order action', issues)

  const previousDeadline = order.deadline
  order.deadline = new Date(newDeadlineMs).toISOString()
  return {
    kind: 'deadline_change',
    orderId: order.id,
    previousDeadline,
    newDeadline: order.deadline,
    shiftHours: (newDeadlineMs - Date.parse(previousDeadline)) / HOUR_MS,
  }
}

function transferLoad(state, { fromMachineId, targetMachineId, productionLineId, loadPerHour }, path) {
  const issues = []
  const from = state.machines.find((machine) => machine.id === fromMachineId)
  const target = state.machines.find((machine) => machine.id === targetMachineId)
  const fromAssignment = findOwnAssignment(state, fromMachineId, productionLineId)

  if (fromMachineId === targetMachineId) issues.push(`${path}: a machine cannot take over its own load`)
  if (!fromAssignment) {
    issues.push(`${path}: ${from.code} has no assigned load on that production line`)
  } else if (loadPerHour > fromAssignment.contributionPerHour + TINY) {
    issues.push(`${path}: cannot move ${loadPerHour}/h from ${from.code}; it only carries ${fromAssignment.contributionPerHour}/h on that line`)
  }
  if (!canCover(state, from, target)) {
    issues.push(
      `${path}: ${target.code} (${target.machineType}) cannot take over work from ${from.code} (${from.machineType}); machines must share a machine type or have a backup dependency`,
    )
  }
  if (CANNOT_ABSORB_LOAD_STATES.includes(target.baselineState)) {
    issues.push(`${path}: ${target.code} is ${target.baselineState} and cannot absorb load`)
  }
  throwIfIssues('Invalid load transfer', issues)

  fromAssignment.contributionPerHour = Math.max(0, fromAssignment.contributionPerHour - loadPerHour)
  const existingCover = state.machineLineAssignments.find(
    (a) => a.machineId === targetMachineId && a.productionLineId === productionLineId && a.coversMachineId === fromMachineId,
  )
  if (existingCover) {
    existingCover.contributionPerHour += loadPerHour
  } else {
    state.machineLineAssignments.push({
      id: `transfer:${fromMachineId}->${targetMachineId}@${productionLineId}`,
      machineId: targetMachineId,
      productionLineId,
      contributionPerHour: loadPerHour,
      isPrimary: false,
      coversMachineId: fromMachineId,
    })
  }
  // Rejects transfers that would make the dependency graph circular.
  buildCapacityContext(state)
  return { fromMachineId, targetMachineId, productionLineId, loadPerHour }
}

function canCover(state, from, target) {
  if (from.machineType === target.machineType) return true
  return state.machineDependencies.some(
    (d) =>
      d.dependencyType === 'backup' &&
      ((d.machineId === from.id && d.dependsOnMachineId === target.id) ||
        (d.machineId === target.id && d.dependsOnMachineId === from.id)),
  )
}

function findOwnAssignment(state, machineId, productionLineId) {
  return state.machineLineAssignments.find(
    (a) => a.machineId === machineId && a.productionLineId === productionLineId && a.coversMachineId === null,
  )
}

function findMachine(state, machineId, path, issues) {
  const machine = state.machines.find((m) => m.id === machineId)
  if (!machine) issues.push(`${path} "${machineId}" does not match any machine`)
  return machine ?? null
}

function findOpenOrder(state, orderId, path, issues) {
  const order = state.orders.find((o) => o.id === orderId)
  if (!order) {
    issues.push(`${path} "${orderId}" does not match any order`)
    return null
  }
  if (!isOpenOrder(order)) {
    issues.push(`${path}: ${order.orderNumber} is ${order.status} and cannot be changed`)
    return null
  }
  return order
}

function checkOptionalLabel(action, path, issues) {
  if (action.label !== undefined && typeof action.label !== 'string') issues.push(`${path}.label must be a string`)
}
