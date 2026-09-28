import { applyActions } from './actions.js'
import { buildCapacityContext, computeCapacitySnapshot } from './capacity.js'
import { buildCascade } from './cascade.js'
import { resolveConfig } from './config.js'
import { DEADLINE_STATUS_RANK, ENGINE_VERSION } from './constants.js'
import { assertEngineState } from './factoryState.js'
import { groupBy, HOUR_MS, indexById, maxOrNull, naturalCompare, round, sum, TINY } from './helpers.js'
import { evaluateOrderOutcome, isOpenOrder, scheduleOrders } from './orders.js'
import { EngineValidationError, validateScenario } from './validation.js'

// Runs one scenario against a factory state and reports its consequences
// relative to a baseline (the same state with nothing added).
//
//  1. validate + clone          2. apply scenario actions (new state)
//  3. place machine events on a timeline      4. capacity per time segment
//  5. propagate dependencies    6. schedule every line's order queue
//  7. deadline status per order 8. secondary resource risks
//  9. assemble the causal cascade and metrics
//
// Pure function: no clock, randomness, network or mutation of its inputs.
export function simulateScenario(factoryState, scenario, configOverrides) {
  const config = resolveConfig(configOverrides)
  assertEngineState(factoryState)
  const normalizedScenario = validateScenario(scenario, factoryState)
  const scenarioState = applyActions(factoryState, normalizedScenario.actions)
  const actionRecords = scenarioState.appliedActions.slice(factoryState.appliedActions.length)
  const asOfMs = Date.parse(factoryState.asOf)
  const warnings = factoryState.warnings.map((warning) => ({ ...warning }))

  const plannedCount = factoryState.plannedMachineEvents.length
  const eventInputs = [
    ...scenarioState.plannedMachineEvents.map((event, index) => ({
      event,
      origin: index < plannedCount ? 'planned' : 'action',
      index,
    })),
    ...normalizedScenario.machineEvents.map((event, index) => ({ event, origin: 'scenario', index })),
  ]

  const horizonHours = determineHorizon(factoryState, scenarioState, eventInputs, asOfMs, config)
  const intervals = toIntervals(eventInputs, horizonHours, scenarioState, warnings)
  assertNoOverlappingEvents(intervals, scenarioState)

  const segments = buildSegments(horizonHours, intervals)
  const baselineRun = runTimeline(
    factoryState,
    intervals.filter((interval) => interval.origin === 'planned'),
    segments,
    config,
  )
  const scenarioRun = runTimeline(scenarioState, intervals, segments, config)

  return buildResult({
    config,
    factoryState,
    scenarioState,
    scenario: normalizedScenario,
    actionRecords,
    asOfMs,
    horizonHours,
    intervals,
    segments,
    baselineRun,
    scenarioRun,
    warnings,
  })
}

function determineHorizon(baselineState, scenarioState, eventInputs, asOfMs, config) {
  let latestDeadline = -Infinity
  for (const state of [baselineState, scenarioState]) {
    for (const order of state.orders) {
      if (isOpenOrder(order)) latestDeadline = Math.max(latestDeadline, (Date.parse(order.deadline) - asOfMs) / HOUR_MS)
    }
  }
  if (latestDeadline > config.maxHorizonHours) {
    throw new EngineValidationError('Simulation horizon too long', [
      `an open order's deadline is ${round(latestDeadline)} h after asOf, beyond maxHorizonHours (${config.maxHorizonHours})`,
    ])
  }
  let latest = Math.max(24, latestDeadline)
  for (const { event } of eventInputs) {
    if (event.durationHours !== null) latest = Math.max(latest, event.startHours + event.durationHours)
  }
  return Math.min(latest + config.horizonPaddingHours, config.maxHorizonHours)
}

function toIntervals(eventInputs, horizonHours, state, warnings) {
  const codeOf = (id) => state.machines.find((machine) => machine.id === id).code
  const intervals = []
  for (const { event, origin, index } of eventInputs) {
    const where = `${origin} event on ${codeOf(event.machineId)}`
    if (event.startHours >= horizonHours) {
      warnings.push({ code: 'event_beyond_horizon', entityId: event.machineId, message: `${where} starts after the simulated horizon and was ignored` })
      continue
    }
    const requestedEnd = event.durationHours === null ? horizonHours : event.startHours + event.durationHours
    if (event.durationHours === null) {
      warnings.push({
        code: 'event_open_ended',
        entityId: event.machineId,
        message: `${where} has no duration and lasts until the end of the ${round(horizonHours)} h horizon; capacity-loss totals depend on that horizon`,
      })
    } else if (requestedEnd > horizonHours) {
      warnings.push({ code: 'event_clipped', entityId: event.machineId, message: `${where} was clipped at the ${round(horizonHours)} h horizon` })
    }
    intervals.push({
      machineId: event.machineId,
      state: event.state,
      capacityFactor: event.capacityFactor,
      afterState: event.afterState,
      startHours: event.startHours,
      endHours: Math.min(requestedEnd, horizonHours),
      origin,
      index,
      label: event.label ?? null,
      actionType: event.actionType ?? null,
    })
  }
  return intervals
}

function assertNoOverlappingEvents(intervals, state) {
  const issues = []
  for (const [machineId, machineIntervals] of groupBy(intervals, (interval) => interval.machineId)) {
    const sorted = [...machineIntervals].sort((a, b) => a.startHours - b.startHours)
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startHours < sorted[i - 1].endHours - TINY) {
        const code = state.machines.find((machine) => machine.id === machineId).code
        issues.push(
          `${code} has overlapping events (${sorted[i - 1].origin} ${round(sorted[i - 1].startHours)}-${round(sorted[i - 1].endHours)} h and ${sorted[i].origin} ${round(sorted[i].startHours)}-${round(sorted[i].endHours)} h)`,
        )
      }
    }
  }
  if (issues.length > 0) throw new EngineValidationError('Invalid scenario', issues)
}

function buildSegments(horizonHours, intervals) {
  const points = new Set([0, horizonHours])
  for (const interval of intervals) {
    for (const point of [interval.startHours, interval.endHours]) {
      if (point > 0 && point < horizonHours) points.add(point)
    }
  }
  const sorted = [...points].sort((a, b) => a - b)
  const segments = []
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] > TINY) segments.push({ start: sorted[i - 1], end: sorted[i] })
  }
  return segments
}

function machineStateAt(machine, sortedIntervals, time) {
  let current = { state: machine.baselineState, capacityFactor: null }
  for (const interval of sortedIntervals) {
    if (interval.startHours > time + TINY) break
    if (time < interval.endHours - TINY) return { state: interval.state, capacityFactor: interval.capacityFactor }
    // Without an explicit afterState the machine returns to whatever it was before the event.
    if (interval.afterState) current = { state: interval.afterState, capacityFactor: null }
  }
  return current
}

function runTimeline(state, intervals, segments, config) {
  const context = buildCapacityContext(state)
  const intervalsByMachine = groupBy(
    [...intervals].sort((a, b) => a.startHours - b.startHours),
    (interval) => interval.machineId,
  )
  const snapshots = segments.map((segment) => {
    const machineStates = new Map(
      state.machines.map((machine) => [machine.id, machineStateAt(machine, intervalsByMachine.get(machine.id) ?? [], segment.start)]),
    )
    return computeCapacitySnapshot(context, machineStates, config)
  })
  return { context, snapshots, orderResults: scheduleOrders(state, segments, snapshots, config) }
}

function buildResult(input) {
  const { config, factoryState, scenarioState, scenario, actionRecords, horizonHours, intervals, warnings } = input
  const epsilon = config.impactEpsilon
  const labels = {
    machines: new Map(scenarioState.machines.map((machine) => [machine.id, machine.code])),
    lines: new Map(scenarioState.productionLines.map((line) => [line.id, line.code])),
    orders: new Map(scenarioState.orders.map((order) => [order.id, order.orderNumber])),
  }

  const machineAnalyses = analyseMachines(input)
  const affectedMachines = machineAnalyses.filter((analysis) => isMachineAffected(analysis, epsilon))
  const lineAnalyses = analyseLines(input)
  const orderAnalyses = analyseOrders(input)
  const secondaryRisks = findSecondaryRisks(machineAnalyses, scenarioState, labels, config)

  for (const analysis of orderAnalyses) {
    if (!analysis.scenario.canComplete) {
      warnings.push({
        code: 'order_not_completed_in_horizon',
        entityId: analysis.order.id,
        message: `${analysis.order.orderNumber} does not finish within the ${round(horizonHours)} h horizon`,
      })
    }
  }

  const machineImpacts = affectedMachines.map((analysis) => formatMachineImpact(analysis, labels, epsilon))
  const lineImpacts = lineAnalyses.filter((analysis) => isLineAffected(analysis, epsilon)).map(formatLineImpact)
  const orderImpacts = orderAnalyses.map((analysis) => formatOrderImpact(analysis, labels))
  const deadlineImpacts = orderAnalyses.filter((analysis) => analysis.statusChanged).map(formatDeadlineImpact)
  const breakingPoints = findScenarioBreakingPoints(orderAnalyses, machineAnalyses, lineAnalyses)

  const count = (predicate) => orderAnalyses.filter(predicate).length
  const atRisk = (status) => status === 'WARNING' || status === 'CRITICAL'
  const metrics = {
    machinesAffected: machineImpacts.length,
    linesAffected: lineImpacts.length,
    ordersAffected: count((analysis) => analysis.affected),
    ordersAtRisk: count((analysis) => atRisk(analysis.scenario.status)),
    deadlineBreaches: count((analysis) => analysis.scenario.status === 'BREACHED'),
    newDeadlineBreaches: count((analysis) => analysis.scenario.status === 'BREACHED' && analysis.baseline.status !== 'BREACHED'),
    baselineOrdersAtRisk: count((analysis) => atRisk(analysis.baseline.status)),
    baselineDeadlineBreaches: count((analysis) => analysis.baseline.status === 'BREACHED'),
    totalDowntimeHours: round(sum(machineAnalyses.map((analysis) => analysis.downtimeHours)), 2),
    capacityLossLineHours: round(sum(lineAnalyses.map((analysis) => analysis.lostLineHours)), 2),
    secondaryRisks: secondaryRisks.length,
  }

  const cascade = buildCascade({
    triggers: intervals.filter((interval) => interval.origin !== 'planned'),
    actionEffects: actionRecords.map((record) => record.effect),
    machineAnalyses,
    orderAnalyses,
    secondaryRisks,
    labels,
    epsilon,
  })

  return {
    engineVersion: ENGINE_VERSION,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    description: scenario.description,
    asOf: factoryState.asOf,
    horizonHours: round(horizonHours, 2),
    summary: summarise(metrics),
    assumptions: {
      machineEvents: scenario.machineEvents,
      actions: actionRecords.map((record) => ({ ...record.action, resolved: record.effect })),
      operatingHoursPerDay: config.operatingHoursPerDay,
      degradedCapacityFactor: config.degradedCapacityFactor,
      deadlineThresholds: { ...config.deadlineThresholds },
      highUtilizationThreshold: config.highUtilizationThreshold,
    },
    metrics,
    machineImpacts,
    lineImpacts,
    orderImpacts,
    deadlineImpacts,
    resourceImpacts: secondaryRisks,
    cascade,
    breakingPoints,
    warnings,
  }
}

function analyseMachines({ config, scenarioState, segments, baselineRun, scenarioRun, intervals, actionRecords }) {
  const operatingFraction = config.operatingHoursPerDay / 24
  const threshold = config.highUtilizationThreshold
  const machinesWithOrigin = (origin) =>
    new Set(intervals.filter((interval) => interval.origin === origin).map((interval) => interval.machineId))
  const scenarioEventMachines = machinesWithOrigin('scenario')
  const actionEventMachines = machinesWithOrigin('action')
  const transferMachines = new Set()
  const reducedMachines = new Set()
  for (const { effect } of actionRecords) {
    if (effect.kind === 'load_transfer') {
      for (const transfer of effect.transfers) {
        transferMachines.add(transfer.fromMachineId)
        transferMachines.add(transfer.targetMachineId)
      }
    }
    if (effect.kind === 'load_reduction') reducedMachines.add(effect.machineId)
  }

  return scenarioState.machines.map((machine) => {
    const analysis = {
      machine,
      scenarioEvent: scenarioEventMachines.has(machine.id),
      actionEvent: actionEventMachines.has(machine.id),
      loadTransfer: transferMachines.has(machine.id),
      loadReduction: reducedMachines.has(machine.id),
      downtimeHours: 0,
      upstreamLimitedHours: 0,
      minOutputRatio: Infinity,
      baselinePeakUtilization: null,
      scenarioPeakUtilization: null,
      baselinePeakDemand: 0,
      scenarioPeakDemand: 0,
      hoursAtOrAboveThreshold: 0,
      overloadHours: 0,
      firstOverloadAt: null,
      baselineOverloaded: false,
      starvedBy: new Map(),
      // Line-hours of production lost on each line because of this machine (negative = gained).
      lineEffects: new Map(),
      stateTimeline: [],
    }

    segments.forEach((segment, i) => {
      const duration = segment.end - segment.start
      const base = baselineRun.snapshots[i].machines.get(machine.id)
      const scen = scenarioRun.snapshots[i].machines.get(machine.id)

      if (scen.factor === 0 && base.factor > 0) analysis.downtimeHours += duration
      if (scen.outputRatio < base.outputRatio - TINY && scen.limitingUpstreamIds.length > 0) {
        analysis.upstreamLimitedHours += duration
        for (const upstreamId of scen.limitingUpstreamIds) {
          analysis.starvedBy.set(upstreamId, (analysis.starvedBy.get(upstreamId) ?? 0) + duration)
        }
      }
      analysis.minOutputRatio = Math.min(analysis.minOutputRatio, scen.outputRatio)
      analysis.baselinePeakUtilization = maxOrNull(analysis.baselinePeakUtilization, base.utilization)
      analysis.scenarioPeakUtilization = maxOrNull(analysis.scenarioPeakUtilization, scen.utilization)
      analysis.baselinePeakDemand = Math.max(analysis.baselinePeakDemand, base.demand)
      analysis.scenarioPeakDemand = Math.max(analysis.scenarioPeakDemand, scen.demand)
      if (scen.utilization !== null && scen.utilization >= threshold - TINY) analysis.hoursAtOrAboveThreshold += duration
      if (scen.utilization !== null && scen.utilization > 1 + TINY) {
        analysis.overloadHours += duration
        if (analysis.firstOverloadAt === null) analysis.firstOverloadAt = segment.start
      }
      if (base.utilization !== null && base.utilization > 1 + TINY) analysis.baselineOverloaded = true

      addLineOutput(analysis.lineEffects, baselineRun, i, machine.id, duration * operatingFraction)
      addLineOutput(analysis.lineEffects, scenarioRun, i, machine.id, -duration * operatingFraction)
      extendTimeline(analysis.stateTimeline, scen.state, segment)
    })
    return analysis
  })
}

// Line capacity is a sum of delivered loads, so a line's lost production splits
// exactly into per-machine shares; this records one machine's share.
function addLineOutput(lineEffects, run, segmentIndex, machineId, weight) {
  const snapshot = run.snapshots[segmentIndex]
  for (const assignment of run.context.assignmentsByMachine.get(machineId) ?? []) {
    const line = snapshot.lines.get(assignment.productionLineId)
    if (line.nominal <= 0) continue
    const share = (snapshot.delivered.get(assignment.id) * line.lineFactor) / line.nominal
    lineEffects.set(assignment.productionLineId, (lineEffects.get(assignment.productionLineId) ?? 0) + weight * share)
  }
}

function extendTimeline(timeline, state, segment) {
  const last = timeline[timeline.length - 1]
  if (last && last.state === state) last.toHours = segment.end
  else timeline.push({ state, fromHours: segment.start, toHours: segment.end })
}

function isMachineAffected(analysis, epsilon) {
  const utilizationChanged =
    (analysis.baselinePeakUtilization === null) !== (analysis.scenarioPeakUtilization === null) ||
    (analysis.baselinePeakUtilization !== null &&
      Math.abs(analysis.baselinePeakUtilization - analysis.scenarioPeakUtilization) > epsilon)
  return (
    analysis.scenarioEvent ||
    analysis.actionEvent ||
    analysis.loadTransfer ||
    analysis.loadReduction ||
    analysis.downtimeHours > epsilon ||
    analysis.upstreamLimitedHours > epsilon ||
    utilizationChanged ||
    [...analysis.lineEffects.values()].some((value) => Math.abs(value) > epsilon)
  )
}

function analyseLines({ config, scenarioState, segments, baselineRun, scenarioRun }) {
  const operatingFraction = config.operatingHoursPerDay / 24
  return scenarioState.productionLines.map((line) => {
    const analysis = {
      line,
      lostLineHours: 0,
      hoursBelowBaseline: 0,
      minCapacity: Infinity,
      minRatio: Infinity,
      stoppedAt: null,
      baselineCapacityAtStart: baselineRun.snapshots[0].lines.get(line.id).current,
      capacityAtStart: scenarioRun.snapshots[0].lines.get(line.id).current,
      queuedWorkLineHours: sum(
        scenarioState.orders.filter((o) => o.productionLineId === line.id && isOpenOrder(o)).map((o) => o.requiredProductionHours),
      ),
    }
    segments.forEach((segment, i) => {
      const duration = segment.end - segment.start
      const base = baselineRun.snapshots[i].lines.get(line.id)
      const scen = scenarioRun.snapshots[i].lines.get(line.id)
      analysis.lostLineHours += (base.ratio - scen.ratio) * duration * operatingFraction
      if (scen.current < base.current - TINY) analysis.hoursBelowBaseline += duration
      analysis.minCapacity = Math.min(analysis.minCapacity, scen.current)
      analysis.minRatio = Math.min(analysis.minRatio, scen.ratio)
      if (analysis.stoppedAt === null && scen.current <= TINY && base.current > TINY) analysis.stoppedAt = segment.start
    })
    return analysis
  })
}

function isLineAffected(analysis, epsilon) {
  return Math.abs(analysis.lostLineHours) > epsilon || analysis.hoursBelowBaseline > epsilon
}

function analyseOrders({ config, factoryState, scenarioState, baselineRun, scenarioRun, asOfMs }) {
  const epsilon = config.impactEpsilon
  const baselineOrders = indexById(factoryState.orders)
  return scenarioState.orders.filter(isOpenOrder).map((order) => {
    const baselineOrder = baselineOrders.get(order.id)
    const baselineSchedule = baselineRun.orderResults.get(order.id)
    const scenarioSchedule = scenarioRun.orderResults.get(order.id)
    const baseline = evaluateOrderOutcome(baselineOrder, baselineSchedule.completionHours, asOfMs, config)
    const scenario = evaluateOrderOutcome(order, scenarioSchedule.completionHours, asOfMs, config)
    const delayHours =
      baseline.completionHours !== null && scenario.completionHours !== null
        ? scenario.completionHours - baseline.completionHours
        : null
    const completionChanged =
      delayHours === null ? baseline.completionHours !== scenario.completionHours : Math.abs(delayHours) > epsilon
    const statusChanged = baseline.status !== scenario.status
    return {
      order,
      baseline,
      scenario,
      delayHours,
      statusChanged,
      affected: statusChanged || completionChanged || baselineOrder.deadline !== order.deadline,
      queuePosition: scenarioSchedule.queuePosition,
    }
  })
}

// A secondary risk is a machine pushed to or past the utilization threshold
// because the scenario moved extra load onto it.
function findSecondaryRisks(machineAnalyses, scenarioState, labels, config) {
  const epsilon = config.impactEpsilon
  const threshold = config.highUtilizationThreshold
  return machineAnalyses
    .filter(
      (a) =>
        a.scenarioPeakUtilization !== null &&
        a.scenarioPeakUtilization >= threshold - TINY &&
        a.scenarioPeakDemand > a.baselinePeakDemand + epsilon &&
        (a.baselinePeakUtilization === null || a.scenarioPeakUtilization > a.baselinePeakUtilization + epsilon),
    )
    .map((a) => {
      const coveringForMachineIds = [
        ...new Set(
          scenarioState.machineLineAssignments
            .filter((assignment) => assignment.machineId === a.machine.id && assignment.coversMachineId !== null)
            .map((assignment) => assignment.coversMachineId),
        ),
      ].sort((x, y) => naturalCompare(labels.machines.get(x), labels.machines.get(y)))
      return {
        machineId: a.machine.id,
        code: a.machine.code,
        riskType: a.overloadHours > 0 ? 'overload' : 'high_utilization',
        baselinePeakUtilization: round(a.baselinePeakUtilization, 4),
        scenarioPeakUtilization: round(a.scenarioPeakUtilization, 4),
        utilizationThreshold: threshold,
        hoursAtOrAboveThreshold: round(a.hoursAtOrAboveThreshold, 2),
        overloadHours: round(a.overloadHours, 2),
        coveringForMachineIds,
        coveringForCodes: coveringForMachineIds.map((id) => labels.machines.get(id)),
      }
    })
}

function findScenarioBreakingPoints(orderAnalyses, machineAnalyses, lineAnalyses) {
  const points = []
  for (const analysis of orderAnalyses) {
    if (analysis.scenario.status === 'BREACHED' && analysis.baseline.status !== 'BREACHED') {
      points.push({
        entityType: 'order',
        entityId: analysis.order.id,
        label: analysis.order.orderNumber,
        condition: 'deadline_breach',
        atHours: round(Math.max(0, analysis.scenario.deadlineHours), 2),
      })
    }
  }
  for (const analysis of machineAnalyses) {
    if (analysis.overloadHours > 0 && !analysis.baselineOverloaded) {
      points.push({
        entityType: 'machine',
        entityId: analysis.machine.id,
        label: analysis.machine.code,
        condition: 'machine_overload',
        atHours: round(analysis.firstOverloadAt, 2),
      })
    }
  }
  for (const analysis of lineAnalyses) {
    if (analysis.stoppedAt !== null) {
      points.push({
        entityType: 'production_line',
        entityId: analysis.line.id,
        label: analysis.line.code,
        condition: 'line_stopped',
        atHours: round(analysis.stoppedAt, 2),
      })
    }
  }
  return points.sort((a, b) => a.atHours - b.atHours || naturalCompare(a.label, b.label))
}

function formatMachineImpact(analysis, labels, epsilon) {
  const { machine } = analysis
  const causes = []
  if (analysis.scenarioEvent) causes.push('scenario_event')
  if (analysis.actionEvent) causes.push('action_event')
  if (analysis.loadTransfer) causes.push('load_transfer')
  if (analysis.loadReduction) causes.push('load_reduction')
  if (analysis.upstreamLimitedHours > epsilon) causes.push('upstream_dependency')

  return {
    machineId: machine.id,
    code: machine.code,
    name: machine.name,
    baselineState: machine.baselineState,
    causes,
    stateTimeline: analysis.stateTimeline.map((entry) => ({
      state: entry.state,
      fromHours: round(entry.fromHours, 2),
      toHours: round(entry.toHours, 2),
    })),
    downtimeHours: round(analysis.downtimeHours, 2),
    upstreamLimitedHours: round(analysis.upstreamLimitedHours, 2),
    limitedByMachineCodes: [...analysis.starvedBy.keys()].map((id) => labels.machines.get(id)).sort(naturalCompare),
    minOutputRatio: round(analysis.minOutputRatio, 4),
    baselinePeakUtilization: round(analysis.baselinePeakUtilization, 4),
    scenarioPeakUtilization: round(analysis.scenarioPeakUtilization, 4),
    lineCapacityChange: [...analysis.lineEffects]
      .filter(([, lostLineHours]) => Math.abs(lostLineHours) > epsilon)
      .map(([productionLineId, lostLineHours]) => ({
        productionLineId,
        lineCode: labels.lines.get(productionLineId),
        lostLineHours: round(lostLineHours, 2),
      }))
      .sort((a, b) => naturalCompare(a.lineCode, b.lineCode)),
  }
}

function formatLineImpact(analysis) {
  const { line } = analysis
  return {
    productionLineId: line.id,
    code: line.code,
    name: line.name,
    nominalCapacityPerHour: round(line.nominalCapacityPerHour, 2),
    baselineCapacityAtStartPerHour: round(analysis.baselineCapacityAtStart, 2),
    capacityAtStartPerHour: round(analysis.capacityAtStart, 2),
    minCapacityPerHour: round(analysis.minCapacity, 2),
    minCapacityRatio: round(analysis.minRatio, 4),
    lostProductionLineHours: round(analysis.lostLineHours, 2),
    hoursBelowBaseline: round(analysis.hoursBelowBaseline, 2),
    queuedWorkLineHours: round(analysis.queuedWorkLineHours, 2),
  }
}

function formatOutcome(outcome) {
  return {
    deadline: outcome.deadline,
    deadlineHours: round(outcome.deadlineHours, 2),
    completionHours: round(outcome.completionHours, 2),
    completionAt: outcome.completionAt,
    slackHours: round(outcome.slackHours, 2),
    status: outcome.status,
    canComplete: outcome.canComplete,
  }
}

function formatOrderImpact(analysis, labels) {
  const { order } = analysis
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    productionLineId: order.productionLineId,
    lineCode: labels.lines.get(order.productionLineId),
    priority: order.priority,
    requiredProductionHours: order.requiredProductionHours,
    queuePosition: analysis.queuePosition,
    baseline: formatOutcome(analysis.baseline),
    scenario: formatOutcome(analysis.scenario),
    delayHours: round(analysis.delayHours, 2),
    statusChanged: analysis.statusChanged,
    affected: analysis.affected,
  }
}

function formatDeadlineImpact(analysis) {
  const from = analysis.baseline.status
  const to = analysis.scenario.status
  return {
    orderId: analysis.order.id,
    orderNumber: analysis.order.orderNumber,
    from,
    to,
    direction: DEADLINE_STATUS_RANK[to] > DEADLINE_STATUS_RANK[from] ? 'worsened' : 'improved',
    deadline: analysis.order.deadline,
    baselineSlackHours: round(analysis.baseline.slackHours, 2),
    scenarioSlackHours: round(analysis.scenario.slackHours, 2),
  }
}

function summarise(metrics) {
  return [
    `${metrics.machinesAffected} machine(s) affected`,
    `${metrics.linesAffected} line(s) with changed capacity (${metrics.capacityLossLineHours} line-hours lost)`,
    `${metrics.ordersAffected} order(s) with a changed outcome`,
    `${metrics.newDeadlineBreaches} new deadline breach(es)`,
    `${metrics.secondaryRisks} secondary resource risk(s)`,
  ].join('; ')
}
