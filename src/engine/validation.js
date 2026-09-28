import { ACTION_TYPES, MACHINE_STATES } from './constants.js'
import { isPlainObject } from './helpers.js'

export class EngineValidationError extends Error {
  constructor(message, issues = []) {
    super(issues.length > 0 ? `${message}: ${issues.join('; ')}` : message)
    this.name = 'EngineValidationError'
    this.issues = issues
  }
}

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function checkAllowedKeys(object, allowedKeys, path, issues) {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.includes(key)) issues.push(`${path}.${key} is not a recognised field`)
  }
}

export function throwIfIssues(message, issues) {
  if (issues.length > 0) throw new EngineValidationError(message, issues)
}

const SCENARIO_KEYS = ['id', 'name', 'description', 'machineEvents', 'actions']
const MACHINE_EVENT_KEYS = [
  'machineId',
  'state',
  'startHours',
  'durationHours',
  'capacityFactor',
  'afterState',
  'label',
]

export function validateMachineEvent(event, path, machineIds, issues) {
  if (!isPlainObject(event)) {
    issues.push(`${path} must be an object`)
    return
  }
  checkAllowedKeys(event, MACHINE_EVENT_KEYS, path, issues)

  if (!machineIds.has(event.machineId)) {
    issues.push(`${path}.machineId "${event.machineId}" does not match any machine`)
  }
  if (!MACHINE_STATES.includes(event.state)) {
    issues.push(`${path}.state must be one of: ${MACHINE_STATES.join(', ')}`)
  }
  if (event.startHours !== undefined && !(isFiniteNumber(event.startHours) && event.startHours >= 0)) {
    issues.push(`${path}.startHours must be a number >= 0`)
  }
  if (!('durationHours' in event)) {
    issues.push(`${path}.durationHours is required (a positive number, or null for "until the end of the horizon")`)
  } else if (event.durationHours !== null && !(isFiniteNumber(event.durationHours) && event.durationHours > 0)) {
    issues.push(`${path}.durationHours must be a positive number or null`)
  }
  if (event.capacityFactor !== undefined) {
    if (event.state !== 'degraded') {
      issues.push(`${path}.capacityFactor is only valid for the "degraded" state`)
    } else if (!(isFiniteNumber(event.capacityFactor) && event.capacityFactor > 0 && event.capacityFactor < 1)) {
      issues.push(`${path}.capacityFactor must be a number between 0 and 1 (exclusive)`)
    }
  }
  if (event.afterState !== undefined && !MACHINE_STATES.includes(event.afterState)) {
    issues.push(`${path}.afterState must be one of: ${MACHINE_STATES.join(', ')}`)
  }
  if (event.label !== undefined && typeof event.label !== 'string') {
    issues.push(`${path}.label must be a string`)
  }
}

export function validateScenario(scenario, factoryState) {
  if (!isPlainObject(scenario)) throw new EngineValidationError('Scenario must be an object')

  const issues = []
  checkAllowedKeys(scenario, SCENARIO_KEYS, 'scenario', issues)

  if (typeof scenario.id !== 'string' || scenario.id.trim() === '') {
    issues.push('scenario.id must be a non-empty string')
  }
  for (const key of ['name', 'description']) {
    if (scenario[key] !== undefined && typeof scenario[key] !== 'string') {
      issues.push(`scenario.${key} must be a string`)
    }
  }

  const machineEvents = scenario.machineEvents ?? []
  const actions = scenario.actions ?? []
  if (!Array.isArray(machineEvents)) issues.push('scenario.machineEvents must be an array')
  if (!Array.isArray(actions)) issues.push('scenario.actions must be an array')

  const machineIds = new Set(factoryState.machines.map((machine) => machine.id))
  if (Array.isArray(machineEvents)) {
    machineEvents.forEach((event, index) =>
      validateMachineEvent(event, `scenario.machineEvents[${index}]`, machineIds, issues),
    )
  }
  if (Array.isArray(actions)) {
    actions.forEach((action, index) => {
      if (!isPlainObject(action)) {
        issues.push(`scenario.actions[${index}] must be an object`)
      } else if (!ACTION_TYPES.includes(action.type)) {
        issues.push(`scenario.actions[${index}].type must be one of: ${ACTION_TYPES.join(', ')}`)
      }
    })
  }

  throwIfIssues('Invalid scenario', issues)

  return {
    id: scenario.id,
    name: scenario.name ?? scenario.id,
    description: scenario.description ?? null,
    machineEvents: machineEvents.map((event) => ({
      machineId: event.machineId,
      state: event.state,
      startHours: event.startHours ?? 0,
      durationHours: event.durationHours,
      capacityFactor: event.capacityFactor ?? null,
      afterState: event.afterState ?? null,
      label: event.label ?? null,
    })),
    actions: actions.map((action) => structuredClone(action)),
  }
}
