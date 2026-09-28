import { resolveConfig } from './config.js'
import { DEADLINE_STATUS_RANK } from './constants.js'
import { assertEngineState } from './factoryState.js'
import { isPlainObject, round, TINY } from './helpers.js'
import { isOpenOrder } from './orders.js'
import { simulateScenario } from './simulation.js'
import { checkAllowedKeys, EngineValidationError, isFiniteNumber, throwIfIssues, validateScenario } from './validation.js'

const SUPPORTED_PARAMETERS = ['durationHours']
const CONDITION_TYPES = ['order_status_at_least', 'any_new_deadline_breach']
const MAX_COARSE_STEPS = 1000
const MAX_REFINEMENT_STEPS = 100000

// Answers "how large can <parameter> get before <condition> happens?"
//
// Coarse scan from min to max in `step` increments finds the first unsafe value,
// then a binary search on a grid of `precision` between the last safe and first
// unsafe coarse values narrows it down. The result is only as precise as that
// grid, and assumes the condition does not flip back to safe inside that interval.
export function findBreakingPoint(factoryState, scenarioTemplate, parameter, configOverrides) {
  const config = resolveConfig(configOverrides)
  assertEngineState(factoryState)
  const template = validateScenario(scenarioTemplate, factoryState)
  const spec = validateParameter(parameter, template, factoryState)
  const decimals = Math.max(decimalsOf(spec.min), decimalsOf(spec.step), decimalsOf(spec.precision))
  const event = template.machineEvents[spec.eventIndex]
  const machine = factoryState.machines.find((m) => m.id === event.machineId)
  const affectedEntity =
    spec.condition.type === 'order_status_at_least'
      ? factoryState.orders.find((order) => order.id === spec.condition.orderId).orderNumber
      : 'any_open_order'

  const cache = new Map()
  const evaluate = (value) => {
    const key = round(value, decimals)
    if (!cache.has(key)) {
      const result = simulateScenario(factoryState, withParameter(scenarioTemplate, spec, key), config)
      cache.set(key, checkCondition(result, spec.condition))
    }
    return cache.get(key)
  }

  const base = {
    parameter: spec.name,
    eventIndex: spec.eventIndex,
    machineId: machine.id,
    machineCode: machine.code,
    condition: { ...spec.condition },
    affectedEntity,
    searchedRange: { min: spec.min, max: spec.max },
    precision: spec.precision,
    method: 'coarse_scan_then_binary_search',
  }

  const atMinimum = evaluate(spec.min)
  if (atMinimum.unsafe) {
    return {
      ...base,
      found: false,
      reason: 'unsafe_at_minimum',
      breakingPoint: null,
      lastSafeValue: null,
      observedAtMinimum: atMinimum.observed,
      evaluations: cache.size,
    }
  }

  const coarseValues = []
  for (let k = 0; k <= MAX_COARSE_STEPS; k += 1) {
    const value = round(spec.min + k * spec.step, decimals)
    if (value > spec.max + TINY) break
    coarseValues.push(value)
  }
  if (coarseValues[coarseValues.length - 1] < spec.max - TINY) coarseValues.push(spec.max)

  let previousSafeValue = spec.min
  let firstUnsafeValue = null
  for (const value of coarseValues.slice(1)) {
    if (evaluate(value).unsafe) {
      firstUnsafeValue = value
      break
    }
    previousSafeValue = value
  }

  if (firstUnsafeValue === null) {
    return {
      ...base,
      found: false,
      reason: 'no_breaking_point_in_range',
      breakingPoint: null,
      lastSafeValue: spec.max,
      evaluations: cache.size,
    }
  }

  const gridValue = (k) => Math.min(round(previousSafeValue + k * spec.precision, decimals), firstUnsafeValue)
  let low = 0
  let high = Math.ceil((firstUnsafeValue - previousSafeValue) / spec.precision - TINY)
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (evaluate(gridValue(middle)).unsafe) high = middle
    else low = middle
  }

  return {
    ...base,
    found: true,
    reason: null,
    breakingPoint: gridValue(high),
    lastSafeValue: gridValue(low),
    coarse: { step: spec.step, previousSafeValue, firstUnsafeValue },
    observedAtBreakingPoint: evaluate(gridValue(high)).observed,
    observedAtLastSafeValue: evaluate(gridValue(low)).observed,
    evaluations: cache.size,
  }
}

function withParameter(scenarioTemplate, spec, value) {
  const scenario = structuredClone(scenarioTemplate)
  // Zero downtime means the event does not happen at all.
  if (value <= 0) scenario.machineEvents.splice(spec.eventIndex, 1)
  else scenario.machineEvents[spec.eventIndex].durationHours = value
  return scenario
}

function checkCondition(result, condition) {
  if (condition.type === 'any_new_deadline_breach') {
    return { unsafe: result.metrics.newDeadlineBreaches > 0, observed: { newDeadlineBreaches: result.metrics.newDeadlineBreaches } }
  }
  const impact = result.orderImpacts.find((order) => order.orderId === condition.orderId)
  return {
    unsafe: DEADLINE_STATUS_RANK[impact.scenario.status] >= DEADLINE_STATUS_RANK[condition.status],
    observed: { status: impact.scenario.status, slackHours: impact.scenario.slackHours },
  }
}

function validateParameter(parameter, template, factoryState) {
  if (!isPlainObject(parameter)) throw new EngineValidationError('Breaking-point parameter must be an object')
  const issues = []
  checkAllowedKeys(parameter, ['name', 'eventIndex', 'min', 'max', 'step', 'precision', 'condition'], 'parameter', issues)

  if (!SUPPORTED_PARAMETERS.includes(parameter.name)) {
    issues.push(`parameter.name must be one of: ${SUPPORTED_PARAMETERS.join(', ')}`)
  }
  const eventIndex = parameter.eventIndex ?? 0
  if (!(Number.isInteger(eventIndex) && eventIndex >= 0 && eventIndex < template.machineEvents.length)) {
    issues.push('parameter.eventIndex must point at one of the scenario template machineEvents')
  }
  const { min, max, step, precision } = parameter
  if (!(isFiniteNumber(min) && min >= 0)) issues.push('parameter.min must be a number >= 0')
  if (!(isFiniteNumber(max) && isFiniteNumber(min) && max > min)) issues.push('parameter.max must be a number greater than min')
  if (!(isFiniteNumber(step) && step > 0)) issues.push('parameter.step must be a positive number')
  if (!(isFiniteNumber(precision) && precision > 0)) issues.push('parameter.precision must be a positive number')
  if (isFiniteNumber(step) && isFiniteNumber(precision) && precision > step) {
    issues.push('parameter.precision must not be larger than parameter.step')
  }
  if ([min, max, step].every(isFiniteNumber) && step > 0 && (max - min) / step > MAX_COARSE_STEPS) {
    issues.push(`parameter range is too large for its step (more than ${MAX_COARSE_STEPS} coarse steps)`)
  }
  if ([step, precision].every(isFiniteNumber) && precision > 0 && step / precision > MAX_REFINEMENT_STEPS) {
    issues.push('parameter.precision is too fine for parameter.step')
  }

  const condition = parameter.condition
  if (!isPlainObject(condition) || !CONDITION_TYPES.includes(condition.type)) {
    issues.push(`parameter.condition.type must be one of: ${CONDITION_TYPES.join(', ')}`)
  } else if (condition.type === 'order_status_at_least') {
    checkAllowedKeys(condition, ['type', 'orderId', 'status'], 'parameter.condition', issues)
    const order = factoryState.orders.find((o) => o.id === condition.orderId)
    if (!order) issues.push(`parameter.condition.orderId "${condition.orderId}" does not match any order`)
    else if (!isOpenOrder(order)) issues.push(`parameter.condition.orderId: ${order.orderNumber} is not an open order`)
    if (!['WARNING', 'CRITICAL', 'BREACHED'].includes(condition.status)) {
      issues.push('parameter.condition.status must be WARNING, CRITICAL or BREACHED')
    }
  } else {
    checkAllowedKeys(condition, ['type'], 'parameter.condition', issues)
  }

  throwIfIssues('Invalid breaking-point parameter', issues)
  return { name: parameter.name, eventIndex, min, max, step, precision, condition }
}

function decimalsOf(value) {
  const text = String(value)
  if (text.includes('e')) return 6
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : Math.min(text.length - dot - 1, 6)
}
