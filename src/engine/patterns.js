import { resolveConfig } from './config.js'
import { REPAIR_EVENT_TYPES } from './constants.js'
import { assertEngineState } from './factoryState.js'
import { DAY_MS } from './helpers.js'
import { EngineValidationError } from './validation.js'

// Descriptive history, not prediction: counts incidents on one machine whose
// description mentions a configured keyword within the lookback window, and
// how many of them happened after the machine's most recent repair.
export function findRecurringPatterns(factoryState, machineId, configOverrides) {
  const config = resolveConfig(configOverrides)
  assertEngineState(factoryState)
  if (!factoryState.machines.some((machine) => machine.id === machineId)) {
    throw new EngineValidationError(`Unknown machine "${machineId}"`)
  }

  const { keywords, lookbackDays, minOccurrences } = config.patterns
  const asOfMs = Date.parse(factoryState.asOf)
  const windowStartMs = asOfMs - lookbackDays * DAY_MS

  const incidents = factoryState.incidents.filter((incident) => {
    const detectedMs = Date.parse(incident.detectedAt)
    return incident.machineId === machineId && detectedMs >= windowStartMs && detectedMs <= asOfMs
  })
  const lastRepair = factoryState.maintenanceEvents
    .filter(
      (event) =>
        event.machineId === machineId &&
        REPAIR_EVENT_TYPES.includes(event.eventType) &&
        Date.parse(event.occurredAt) <= asOfMs,
    )
    .at(-1)
  const lastRepairMs = lastRepair ? Date.parse(lastRepair.occurredAt) : null

  const patterns = []
  for (const keyword of keywords) {
    const matches = incidents.filter((incident) => incident.description.toLowerCase().includes(keyword))
    if (matches.length === 0) continue
    patterns.push({
      matchedPattern: keyword,
      occurrences: matches.length,
      recurrenceDetected: matches.length >= minOccurrences,
      firstOccurrence: matches[0].detectedAt,
      recentOccurrence: matches[matches.length - 1].detectedAt,
      incidentIds: matches.map((incident) => incident.id),
      lastRepairAt: lastRepair?.occurredAt ?? null,
      occurrencesAfterLastRepair:
        lastRepairMs === null ? null : matches.filter((incident) => Date.parse(incident.detectedAt) > lastRepairMs).length,
      lookbackDays,
      minOccurrencesForRecurrence: minOccurrences,
    })
  }

  // Stable sort keeps keyword order for ties.
  return patterns.sort((a, b) => b.occurrences - a.occurrences)
}
