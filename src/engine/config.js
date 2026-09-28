import { deepFreeze, isPlainObject } from './helpers.js'
import { EngineValidationError, isFiniteNumber, throwIfIssues } from './validation.js'

// Every threshold the engine uses lives here, so no behaviour is hidden in code.
export const DEFAULT_ENGINE_CONFIG = deepFreeze({
  // Production hours per calendar day. 24 = continuous operation.
  operatingHoursPerDay: 24,
  // Capacity multiplier for a degraded machine when no explicit factor is given.
  degradedCapacityFactor: 0.5,
  // Slack = deadline - projected completion, in hours.
  deadlineThresholds: {
    criticalSlackHours: 4,
    warningSlackHours: 12,
  },
  // Machine utilization (assigned load / usable capacity) that counts as a secondary risk.
  highUtilizationThreshold: 0.9,
  // Extra hours simulated after the latest open-order deadline so late completions are measurable.
  horizonPaddingHours: 168,
  maxHorizonHours: 8760,
  // Differences smaller than this are treated as "no impact".
  impactEpsilon: 1e-6,
  patterns: {
    keywords: [
      'vibration',
      'temperature',
      'overheat',
      'alignment',
      'noise',
      'pressure',
      'jam',
      'calibration',
      'leak',
      'electrical',
    ],
    lookbackDays: 180,
    minOccurrences: 3,
  },
  risk: {
    healthStatePoints: { healthy: 0, watch: 1, at_risk: 3, critical: 5 },
    degradedStatusPoints: 2,
    failedStatusPoints: 5,
    noMaintenanceRecordPoints: 1,
    maintenanceOverduePoints: 2,
    maintenanceSeverelyOverduePoints: 3,
    severelyOverdueMultiplier: 1.5,
    openIncidentSeverityPoints: { low: 1, medium: 2, high: 3, critical: 5 },
    recurringPatternPoints: 2,
    recurrenceAfterRepairPoints: 1,
    overloadPoints: 2,
    // Minimum points for each level above LOW.
    levelThresholds: { MODERATE: 3, HIGH: 6, CRITICAL: 10 },
  },
})

export function resolveConfig(overrides) {
  if (overrides === undefined || overrides === null || overrides === DEFAULT_ENGINE_CONFIG) {
    return DEFAULT_ENGINE_CONFIG
  }
  if (!isPlainObject(overrides)) throw new EngineValidationError('Engine config overrides must be an object')

  const issues = []
  const merged = mergeOverrides(DEFAULT_ENGINE_CONFIG, overrides, 'config', issues)
  validateConfig(merged, issues)
  throwIfIssues('Invalid engine config', issues)
  return deepFreeze(merged)
}

function mergeOverrides(base, overrides, path, issues) {
  const result = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in base)) {
      issues.push(`${path}.${key} is not a recognised config option`)
    } else if (isPlainObject(base[key])) {
      if (isPlainObject(value)) result[key] = mergeOverrides(base[key], value, `${path}.${key}`, issues)
      else issues.push(`${path}.${key} must be an object`)
    } else {
      result[key] = value
    }
  }
  return result
}

function validateConfig(config, issues) {
  const positive = (value) => isFiniteNumber(value) && value > 0
  if (!(positive(config.operatingHoursPerDay) && config.operatingHoursPerDay <= 24)) {
    issues.push('config.operatingHoursPerDay must be > 0 and <= 24')
  }
  if (!(positive(config.degradedCapacityFactor) && config.degradedCapacityFactor < 1)) {
    issues.push('config.degradedCapacityFactor must be between 0 and 1 (exclusive)')
  }
  const { criticalSlackHours, warningSlackHours } = config.deadlineThresholds
  if (!(isFiniteNumber(criticalSlackHours) && criticalSlackHours >= 0 && isFiniteNumber(warningSlackHours) && warningSlackHours >= criticalSlackHours)) {
    issues.push('config.deadlineThresholds must satisfy 0 <= criticalSlackHours <= warningSlackHours')
  }
  if (!positive(config.highUtilizationThreshold)) issues.push('config.highUtilizationThreshold must be > 0')
  if (!(isFiniteNumber(config.horizonPaddingHours) && config.horizonPaddingHours >= 0)) {
    issues.push('config.horizonPaddingHours must be >= 0')
  }
  if (!positive(config.maxHorizonHours)) issues.push('config.maxHorizonHours must be > 0')
  if (!positive(config.impactEpsilon)) issues.push('config.impactEpsilon must be > 0')
  if (!(Array.isArray(config.patterns.keywords) && config.patterns.keywords.every((k) => typeof k === 'string' && k !== ''))) {
    issues.push('config.patterns.keywords must be an array of non-empty strings')
  }
  if (!positive(config.patterns.lookbackDays)) issues.push('config.patterns.lookbackDays must be > 0')
  if (!(Number.isInteger(config.patterns.minOccurrences) && config.patterns.minOccurrences >= 1)) {
    issues.push('config.patterns.minOccurrences must be an integer >= 1')
  }
  const { MODERATE, HIGH, CRITICAL } = config.risk.levelThresholds
  if (!(isFiniteNumber(MODERATE) && isFiniteNumber(HIGH) && isFiniteNumber(CRITICAL) && MODERATE <= HIGH && HIGH <= CRITICAL)) {
    issues.push('config.risk.levelThresholds must satisfy MODERATE <= HIGH <= CRITICAL')
  }
}
