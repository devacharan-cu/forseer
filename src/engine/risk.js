import { baselineMachineStates, buildCapacityContext, computeCapacitySnapshot } from './capacity.js'
import { resolveConfig } from './config.js'
import { RISK_LEVELS, SERVICE_EVENT_TYPES } from './constants.js'
import { assertEngineState } from './factoryState.js'
import { DAY_MS, naturalCompare, round, TINY } from './helpers.js'
import { findRecurringPatterns } from './patterns.js'
import { EngineValidationError } from './validation.js'

const DISCLAIMER =
  'Internal FORSEER operational risk indicator: a sum of explicit points from recorded state and history. It is not a failure probability and has not been statistically validated.'

// BEFORE-mode risk read for every machine, highest first.
export function assessFactoryRisk(factoryState, configOverrides) {
  const config = resolveConfig(configOverrides)
  assertEngineState(factoryState)
  const snapshot = currentSnapshot(factoryState, config)
  return factoryState.machines
    .map((machine) => assess(factoryState, machine, snapshot, config))
    .sort(
      (a, b) =>
        RISK_LEVELS.indexOf(b.level) - RISK_LEVELS.indexOf(a.level) ||
        b.points - a.points ||
        naturalCompare(a.code, b.code),
    )
}

export function assessMachineRisk(factoryState, machineId, configOverrides) {
  const config = resolveConfig(configOverrides)
  assertEngineState(factoryState)
  const machine = factoryState.machines.find((m) => m.id === machineId)
  if (!machine) throw new EngineValidationError(`Unknown machine "${machineId}"`)
  return assess(factoryState, machine, currentSnapshot(factoryState, config), config)
}

function currentSnapshot(factoryState, config) {
  return computeCapacitySnapshot(buildCapacityContext(factoryState), baselineMachineStates(factoryState), config)
}

function assess(factoryState, machine, snapshot, config) {
  const points = config.risk
  const asOfMs = Date.parse(factoryState.asOf)
  const signals = []
  const add = (signal, value, detail) => signals.push({ signal, points: value, detail })
  let forcedLevel = null

  if (machine.baselineState === 'failed') {
    add('currently_failed', points.failedStatusPoints, { status: machine.status })
    forcedLevel = 'CRITICAL'
  } else if (machine.baselineState === 'degraded') {
    add('degraded_status', points.degradedStatusPoints, { status: machine.status })
  }

  const healthPoints = points.healthStatePoints[machine.healthState] ?? 0
  if (healthPoints > 0) add('health_state', healthPoints, { healthState: machine.healthState })

  add(...serviceSignal(factoryState, machine, asOfMs, points))

  const openIncidents = factoryState.incidents.filter((incident) => incident.machineId === machine.id && isOpenAt(incident, asOfMs))
  if (openIncidents.length > 0) {
    const worst = openIncidents.reduce((a, b) =>
      (points.openIncidentSeverityPoints[b.severity] ?? 0) > (points.openIncidentSeverityPoints[a.severity] ?? 0) ? b : a,
    )
    add('unresolved_incident', points.openIncidentSeverityPoints[worst.severity] ?? 0, {
      count: openIncidents.length,
      highestSeverity: worst.severity,
      incidentIds: openIncidents.map((incident) => incident.id),
    })
  }

  const recurring = findRecurringPatterns(factoryState, machine.id, config).filter((pattern) => pattern.recurrenceDetected)
  if (recurring.length > 0) {
    add('recurring_incident_pattern', points.recurringPatternPoints, {
      patterns: recurring.map((pattern) => ({ pattern: pattern.matchedPattern, occurrences: pattern.occurrences })),
    })
    const afterRepair = recurring.filter((pattern) => pattern.occurrencesAfterLastRepair > 0)
    if (afterRepair.length > 0) {
      add('recurrence_after_repair', points.recurrenceAfterRepairPoints, {
        lastRepairAt: afterRepair[0].lastRepairAt,
        patterns: afterRepair.map((pattern) => ({ pattern: pattern.matchedPattern, occurrencesAfterRepair: pattern.occurrencesAfterLastRepair })),
      })
    }
  }

  const utilization = snapshot.machines.get(machine.id).utilization
  if (utilization !== null && utilization > 1 + TINY) add('overloaded', points.overloadPoints, { utilization: round(utilization, 4) })

  const scoredSignals = signals.filter((signal) => signal.points > 0)
  const total = scoredSignals.reduce((sumOfPoints, signal) => sumOfPoints + signal.points, 0)
  const { MODERATE, HIGH, CRITICAL } = points.levelThresholds
  let level = total >= CRITICAL ? 'CRITICAL' : total >= HIGH ? 'HIGH' : total >= MODERATE ? 'MODERATE' : 'LOW'
  if (forcedLevel) level = forcedLevel

  return {
    machineId: machine.id,
    code: machine.code,
    name: machine.name,
    asOf: factoryState.asOf,
    level,
    points: total,
    signals: scoredSignals,
    scoreType: 'forseer_operational_risk_points',
    isFailureProbability: false,
    disclaimer: DISCLAIMER,
  }
}

// Service interval is measured from the last event that actually serviced the
// machine (preventive, repair, emergency); inspections do not reset it.
function serviceSignal(factoryState, machine, asOfMs, points) {
  const lastService = factoryState.maintenanceEvents
    .filter(
      (event) => event.machineId === machine.id && SERVICE_EVENT_TYPES.includes(event.eventType) && Date.parse(event.occurredAt) <= asOfMs,
    )
    .at(-1)
  const lastServiceAt = lastService?.occurredAt ?? machine.lastMaintenanceAt
  const basis = lastService ? 'maintenance_events' : 'machines.last_maintenance_at'

  if (lastServiceAt === null) return ['no_maintenance_record', points.noMaintenanceRecordPoints, {}]
  if (machine.maintenanceIntervalDays <= 0) return ['service_interval_not_set', 0, {}]

  const daysSinceService = (asOfMs - Date.parse(lastServiceAt)) / DAY_MS
  const detail = {
    lastServiceAt,
    basis,
    daysSinceService: round(daysSinceService, 1),
    maintenanceIntervalDays: machine.maintenanceIntervalDays,
  }
  if (daysSinceService > machine.maintenanceIntervalDays * points.severelyOverdueMultiplier) {
    return ['maintenance_severely_overdue', points.maintenanceSeverelyOverduePoints, detail]
  }
  if (daysSinceService > machine.maintenanceIntervalDays) return ['maintenance_overdue', points.maintenanceOverduePoints, detail]
  return ['maintenance_within_interval', 0, detail]
}

// Open "as of" the snapshot time, so replaying history treats incidents resolved later as still open.
function isOpenAt(incident, asOfMs) {
  if (Date.parse(incident.detectedAt) > asOfMs) return false
  if (incident.resolvedAt !== null && Date.parse(incident.resolvedAt) > asOfMs) return true
  return incident.status === 'open' || incident.status === 'investigating'
}
