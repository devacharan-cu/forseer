import {
  assessMachineRisk,
  calculateCurrentCapacity,
  EngineValidationError,
  findRecurringPatterns,
  simulateScenario,
} from '../engine/index.js'

// Fact packs: compact, deterministic summaries of engine output and records.
// They are the only factory information a model ever sees, and the reference
// every number in its reply is checked against.

const RECENT_RECORDS = 6
const MAX_CASCADE_LINKS = 40

const toFigure = (value) => (value === null || value === undefined ? null : Math.round(value * 100) / 100)

export function requireMachine(factoryState, machineId) {
  const machine = factoryState.machines.find((m) => m.id === machineId)
  if (!machine) throw new EngineValidationError(`Unknown machine "${machineId}"`)
  return machine
}

export function labelMaps(factoryState) {
  return {
    machines: new Map(factoryState.machines.map((m) => [m.id, m.code])),
    lines: new Map(factoryState.productionLines.map((l) => [l.id, l.code])),
    orders: new Map(factoryState.orders.map((o) => [o.id, o.orderNumber])),
  }
}

export function areCompatible(factoryState, a, b) {
  if (a.machineType === b.machineType) return 'same_type'
  const backup = factoryState.machineDependencies.some(
    (d) =>
      d.dependencyType === 'backup' &&
      ((d.machineId === a.id && d.dependsOnMachineId === b.id) || (d.machineId === b.id && d.dependsOnMachineId === a.id)),
  )
  return backup ? 'backup' : null
}

export function ownLoadByLine(factoryState, machineId) {
  const labels = labelMaps(factoryState)
  return factoryState.machineLineAssignments
    .filter((a) => a.machineId === machineId && a.coversMachineId === null)
    .map((a) => ({ lineCode: labels.lines.get(a.productionLineId), loadPerHour: toFigure(a.contributionPerHour) }))
}

export function buildMachineFacts(factoryState, machineId) {
  const machine = requireMachine(factoryState, machineId)
  const risk = assessMachineRisk(factoryState, machineId)
  const capacity = calculateCurrentCapacity(factoryState)
  const capacityOf = (id) => capacity.machines.find((entry) => entry.machineId === id)
  const current = capacityOf(machineId)
  const lineCodes = ownLoadByLine(factoryState, machineId).map((entry) => entry.lineCode)

  return {
    asOf: factoryState.asOf,
    machine: {
      code: machine.code,
      name: machine.name,
      machineType: machine.machineType,
      status: machine.status,
      healthState: machine.healthState,
      engineState: machine.baselineState,
      capacityPerHour: machine.capacityPerHour,
      maintenanceIntervalDays: machine.maintenanceIntervalDays,
      lastMaintenanceAt: machine.lastMaintenanceAt,
    },
    operationalRisk: {
      level: risk.level,
      points: risk.points,
      signals: risk.signals,
      scoreType: risk.scoreType,
      isFailureProbability: false,
    },
    recurringPatterns: findRecurringPatterns(factoryState, machineId).map((p) => ({
      pattern: p.matchedPattern,
      occurrences: p.occurrences,
      recurrenceDetected: p.recurrenceDetected,
      firstOccurrence: p.firstOccurrence,
      recentOccurrence: p.recentOccurrence,
      occurrencesAfterLastRepair: p.occurrencesAfterLastRepair,
      incidentIds: p.incidentIds,
    })),
    recentMaintenance: recentRecords(factoryState.maintenanceEvents, machineId, 'occurredAt', factoryState.asOf).map((e) => ({
      id: e.id,
      eventType: e.eventType,
      description: e.description,
      occurredAt: e.occurredAt,
      durationHours: e.durationHours,
      outcome: e.outcome,
    })),
    recentIncidents: recentRecords(factoryState.incidents, machineId, 'detectedAt', factoryState.asOf).map((i) => ({
      id: i.id,
      description: i.description,
      severity: i.severity,
      status: i.status,
      detectedAt: i.detectedAt,
      resolvedAt: i.resolvedAt,
    })),
    currentWorkload: {
      usableCapacityPerHour: current.usableCapacityPerHour,
      assignedLoadPerHour: current.assignedLoadPerHour,
      utilization: current.utilization,
      loadByLine: ownLoadByLine(factoryState, machineId),
    },
    alternativeMachines: factoryState.machines
      .filter((other) => other.id !== machineId && areCompatible(factoryState, machine, other))
      .map((other) => {
        const entry = capacityOf(other.id)
        return {
          code: other.code,
          machineType: other.machineType,
          relation: areCompatible(factoryState, machine, other),
          engineState: entry.state,
          usableCapacityPerHour: entry.usableCapacityPerHour,
          assignedLoadPerHour: entry.assignedLoadPerHour,
          // Straight from the engine's capacity output: usable minus already assigned.
          spareCapacityPerHour: toFigure(Math.max(0, entry.usableCapacityPerHour - entry.assignedLoadPerHour)),
          lines: ownLoadByLine(factoryState, other.id).map((l) => l.lineCode),
        }
      }),
    orderOutlook: buildOrderOutlook(factoryState, lineCodes),
  }
}

// Current projections for the orders on the given lines, from a no-change engine run.
export function buildOrderOutlook(factoryState, lineCodes) {
  const result = simulateScenario(factoryState, { id: 'current-plan' })
  return result.orderImpacts
    .filter((impact) => lineCodes.includes(impact.lineCode))
    .map((impact) => ({
      orderNumber: impact.orderNumber,
      lineCode: impact.lineCode,
      priority: impact.priority,
      deadline: impact.baseline.deadline,
      projectedCompletionAt: impact.baseline.completionAt,
      slackHours: impact.baseline.slackHours,
      deadlineStatus: impact.baseline.status,
    }))
}

export function maintenanceDurations(factoryState, machineId, eventTypes) {
  const asOfMs = Date.parse(factoryState.asOf)
  return factoryState.maintenanceEvents
    .filter((e) => e.machineId === machineId && eventTypes.includes(e.eventType) && e.durationHours !== null && Date.parse(e.occurredAt) <= asOfMs)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .map((e) => ({ eventType: e.eventType, durationHours: e.durationHours, occurredAt: e.occurredAt, id: e.id }))
}

export function buildCandidateFacts(factoryState, machineId, { mode, scenarioResult = null, maxPlans, repairEstimateHours = null }) {
  return {
    ...buildMachineFacts(factoryState, machineId),
    mode,
    maxPlans,
    maintenanceHistoryDurations: {
      preventive: maintenanceDurations(factoryState, machineId, ['preventive']),
      repair: maintenanceDurations(factoryState, machineId, ['repair', 'emergency']),
    },
    userProvided: { repairEstimateHours },
    scenarioToImprove: scenarioResult ? buildResultFacts(scenarioResult, factoryState) : null,
  }
}

export function buildIncidentFacts(factoryState, machineId = null) {
  const scope = (records) => (machineId ? records.filter((r) => r.machineId === machineId) : records)
  const labels = labelMaps(factoryState)
  return {
    asOf: factoryState.asOf,
    machines: factoryState.machines.map((m) => ({ code: m.code, name: m.name, machineType: m.machineType, engineState: m.baselineState })),
    focusMachine: machineId ? labels.machines.get(machineId) : null,
    incidentHistory: scope(factoryState.incidents).slice(-20).map((i) => ({
      id: i.id,
      machine: labels.machines.get(i.machineId),
      description: i.description,
      severity: i.severity,
      status: i.status,
      detectedAt: i.detectedAt,
    })),
    maintenanceHistory: scope(factoryState.maintenanceEvents).slice(-20).map((e) => ({
      id: e.id,
      machine: labels.machines.get(e.machineId),
      eventType: e.eventType,
      description: e.description,
      occurredAt: e.occurredAt,
    })),
  }
}

export function buildScenarioParseFacts(factoryState, baseScenario = null) {
  const labels = labelMaps(factoryState)
  const outlook = simulateScenario(factoryState, { id: 'current-plan' })
  return {
    asOf: factoryState.asOf,
    machines: factoryState.machines.map((m) => ({
      code: m.code,
      name: m.name,
      machineType: m.machineType,
      engineState: m.baselineState,
      lines: ownLoadByLine(factoryState, m.id).map((l) => l.lineCode),
    })),
    productionLines: factoryState.productionLines.map((l) => ({ code: l.code, name: l.name })),
    openOrders: outlook.orderImpacts.map((o) => ({ orderNumber: o.orderNumber, lineCode: o.lineCode, priority: o.priority, deadline: o.baseline.deadline })),
    baseScenario: baseScenario ? describeScenario(baseScenario, labels) : null,
  }
}

export function describeScenario(scenario, labels) {
  return {
    id: scenario.id,
    name: scenario.name ?? scenario.id,
    machineEvents: (scenario.machineEvents ?? []).map((e) => ({
      machine: labels.machines.get(e.machineId),
      state: e.state,
      startHours: e.startHours ?? 0,
      durationHours: e.durationHours,
    })),
    actions: (scenario.actions ?? []).map((a) => describeAction(a, labels)),
  }
}

export function describeAction(action, labels) {
  const described = { type: action.type }
  const map = {
    machineId: ['machine', labels.machines],
    fromMachineId: ['fromMachine', labels.machines],
    targetMachineId: ['targetMachine', labels.machines],
    orderId: ['order', labels.orders],
    productionLineId: ['line', labels.lines],
  }
  for (const [key, value] of Object.entries(action)) {
    if (key === 'type' || key === 'resolved') continue
    if (map[key]) described[map[key][0]] = map[key][1].get(value) ?? value
    else if (key === 'splits') described.splits = value.map((s) => ({ targetMachine: labels.machines.get(s.targetMachineId), loadPerHour: s.loadPerHour }))
    else described[key] = value
  }
  return described
}

// A compact view of one engine result: every figure here is the engine's.
export function buildResultFacts(result, factoryState) {
  const labels = labelMaps(factoryState)
  return {
    scenarioId: result.scenarioId,
    scenarioName: result.scenarioName,
    description: result.description,
    summary: result.summary,
    metrics: result.metrics,
    assumptions: {
      machineEvents: result.assumptions.machineEvents.map((e) => ({
        machine: labels.machines.get(e.machineId),
        state: e.state,
        startHours: e.startHours,
        durationHours: e.durationHours,
        afterState: e.afterState,
      })),
      actions: result.assumptions.actions.map((a) => describeAction(a, labels)),
      deadlineThresholds: result.assumptions.deadlineThresholds,
      operatingHoursPerDay: result.assumptions.operatingHoursPerDay,
    },
    machineImpacts: result.machineImpacts.map((m) => ({
      machine: m.code,
      causes: m.causes,
      downtimeHours: m.downtimeHours,
      upstreamLimitedHours: m.upstreamLimitedHours,
      limitedBy: m.limitedByMachineCodes,
      baselinePeakUtilization: m.baselinePeakUtilization,
      scenarioPeakUtilization: m.scenarioPeakUtilization,
    })),
    lineImpacts: result.lineImpacts.map((l) => ({
      line: l.code,
      nominalCapacityPerHour: l.nominalCapacityPerHour,
      minCapacityPerHour: l.minCapacityPerHour,
      lostProductionLineHours: l.lostProductionLineHours,
    })),
    deadlineImpacts: result.deadlineImpacts.map((d) => ({
      order: d.orderNumber,
      from: d.from,
      to: d.to,
      baselineSlackHours: d.baselineSlackHours,
      scenarioSlackHours: d.scenarioSlackHours,
    })),
    affectedOrders: result.orderImpacts
      .filter((o) => o.affected)
      .map((o) => ({
        order: o.orderNumber,
        line: o.lineCode,
        priority: o.priority,
        delayHours: o.delayHours,
        baselineStatus: o.baseline.status,
        scenarioStatus: o.scenario.status,
        scenarioSlackHours: o.scenario.slackHours,
      })),
    secondaryRisks: result.resourceImpacts.map((r) => ({
      machine: r.code,
      riskType: r.riskType,
      baselinePeakUtilization: r.baselinePeakUtilization,
      scenarioPeakUtilization: r.scenarioPeakUtilization,
      coveringFor: r.coveringForCodes,
    })),
    cascade: result.cascade.slice(0, MAX_CASCADE_LINKS).map((c) => ({
      step: c.step,
      from: c.sourceLabel,
      to: c.targetLabel,
      impact: c.impactType,
      magnitude: c.magnitude,
      unit: c.unit,
    })),
    breakingPoints: result.breakingPoints.map((b) => ({ entity: b.label, condition: b.condition, atHours: b.atHours })),
    warnings: result.warnings.map((w) => w.message),
  }
}

export function buildComparisonFacts(comparison) {
  return {
    referenceScenarioId: comparison.referenceScenarioId,
    differences: comparison.differences,
    metrics: comparison.metrics.map((m) => ({ metric: m.metric, values: m.values })),
    orders: comparison.orders,
    note: comparison.note,
  }
}

function recentRecords(records, machineId, dateKey, asOf) {
  const asOfMs = Date.parse(asOf)
  return records
    .filter((r) => r.machineId === machineId && Date.parse(r[dateKey]) <= asOfMs)
    .sort((a, b) => Date.parse(b[dateKey]) - Date.parse(a[dateKey]))
    .slice(0, RECENT_RECORDS)
}
