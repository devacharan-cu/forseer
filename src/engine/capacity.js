import { topologicalOrder } from './cascade.js'
import { resolveConfig } from './config.js'
import { CONSTRAINING_DEPENDENCY_TYPES } from './constants.js'
import { assertEngineState } from './factoryState.js'
import { groupBy, indexById, round, TINY } from './helpers.js'
import { capacityFactorFor } from './machineStates.js'
import { EngineValidationError } from './validation.js'

// Precomputes lookups and a deterministic evaluation order for a factory state.
// A machine is evaluated after everything that constrains it: its upstream
// machines, and any machine covering work for one of those upstream machines.
export function buildCapacityContext(factoryState) {
  const machinesById = indexById(factoryState.machines)
  const assignmentsByMachine = groupBy(factoryState.machineLineAssignments, (a) => a.machineId)
  const assignmentsByLine = groupBy(factoryState.machineLineAssignments, (a) => a.productionLineId)
  const coversByCoveredMachine = groupBy(
    factoryState.machineLineAssignments.filter((a) => a.coversMachineId !== null),
    (a) => a.coversMachineId,
  )

  const upstreamsByMachine = new Map()
  const dependentsByMachine = new Map()
  const edges = []
  for (const dependency of factoryState.machineDependencies) {
    if (!CONSTRAINING_DEPENDENCY_TYPES.includes(dependency.dependencyType)) continue
    const upstream = dependency.dependsOnMachineId
    const dependent = dependency.machineId
    if (!upstreamsByMachine.has(dependent)) upstreamsByMachine.set(dependent, [])
    upstreamsByMachine.get(dependent).push(upstream)
    if (!dependentsByMachine.has(upstream)) dependentsByMachine.set(upstream, [])
    dependentsByMachine.get(upstream).push(dependent)
    edges.push([upstream, dependent])
  }
  for (const [coveredId, covers] of coversByCoveredMachine) {
    for (const cover of covers) {
      for (const dependent of dependentsByMachine.get(coveredId) ?? []) edges.push([cover.machineId, dependent])
    }
  }

  const { order, cyclic } = topologicalOrder(factoryState.machines.map((machine) => machine.id), edges)
  if (cyclic.length > 0) {
    const codes = cyclic.map((id) => machinesById.get(id).code)
    throw new EngineValidationError('Circular machine dependency', [
      `machines ${codes.join(', ')} depend on each other through dependencies or load transfers`,
    ])
  }

  return {
    machinesById,
    productionLines: factoryState.productionLines,
    assignmentsByMachine,
    assignmentsByLine,
    coversByCoveredMachine,
    upstreamsByMachine,
    order,
  }
}

export function baselineMachineStates(factoryState) {
  return new Map(factoryState.machines.map((machine) => [machine.id, { state: machine.baselineState, capacityFactor: null }]))
}

// Capacity of every machine and line for one fixed set of machine states.
//
// Per machine:  usable = capacity x stateFactor;  demand = sum of its assigned loads.
//   ownRatio      = min(1, usable / demand)           (overload is shared proportionally)
//   upstreamLimit = min stage ratio of its constraining upstream machines
//   outputRatio   = min(ownRatio, upstreamLimit);  each assignment delivers load x outputRatio
// A machine's stage ratio (what its dependents can rely on) is the output of its
// stage — its own work plus any work other machines cover for it — divided by the
// stage's original nominal load. Line capacity is the sum of delivered loads.
export function computeCapacitySnapshot(context, machineStates, config) {
  const machines = new Map()
  const delivered = new Map()
  const stageRatios = new Map()

  const stageRatioOf = (machineId) => {
    if (stageRatios.has(machineId)) return stageRatios.get(machineId)
    const machine = context.machinesById.get(machineId)
    let stageOutput = 0
    for (const assignment of context.assignmentsByMachine.get(machineId) ?? []) {
      if (assignment.coversMachineId === null) stageOutput += delivered.get(assignment.id)
    }
    for (const cover of context.coversByCoveredMachine.get(machineId) ?? []) {
      stageOutput += delivered.get(cover.id)
    }
    const ratio =
      machine.stageNominalPerHour > 0
        ? Math.min(1, stageOutput / machine.stageNominalPerHour)
        : machines.get(machineId).outputRatio > 0
          ? 1
          : 0
    stageRatios.set(machineId, ratio)
    return ratio
  }

  for (const machineId of context.order) {
    const machine = context.machinesById.get(machineId)
    const { state, capacityFactor } = machineStates.get(machineId)
    const factor = capacityFactorFor(state, capacityFactor, config)
    const effectiveCapacity = machine.capacityPerHour * factor
    const assignments = context.assignmentsByMachine.get(machineId) ?? []
    let demand = 0
    for (const assignment of assignments) demand += assignment.contributionPerHour

    const ownRatio = demand > 0 ? Math.min(1, effectiveCapacity / demand) : factor > 0 ? 1 : 0

    const upstreamRatios = (context.upstreamsByMachine.get(machineId) ?? []).map((id) => [id, stageRatioOf(id)])
    const upstreamLimit = upstreamRatios.reduce((lowest, [, ratio]) => Math.min(lowest, ratio), 1)
    const outputRatio = Math.min(ownRatio, upstreamLimit)
    const limitingUpstreamIds =
      upstreamLimit < ownRatio - TINY
        ? upstreamRatios.filter(([, ratio]) => ratio <= upstreamLimit + TINY).map(([id]) => id)
        : []

    for (const assignment of assignments) delivered.set(assignment.id, assignment.contributionPerHour * outputRatio)

    machines.set(machineId, {
      state,
      factor,
      effectiveCapacity,
      demand,
      ownRatio,
      upstreamLimit,
      outputRatio,
      limitingUpstreamIds,
      // null when the machine has no usable capacity (utilization is undefined, not infinite).
      utilization: effectiveCapacity > 0 ? demand / effectiveCapacity : null,
    })
  }

  for (const machineId of context.order) machines.get(machineId).stageRatio = stageRatioOf(machineId)

  const lines = new Map()
  for (const line of context.productionLines) {
    const lineFactor = line.status === 'stopped' ? 0 : 1
    let current = 0
    for (const assignment of context.assignmentsByLine.get(line.id) ?? []) current += delivered.get(assignment.id)
    current *= lineFactor
    const nominal = line.nominalCapacityPerHour
    lines.set(line.id, { nominal, current, ratio: nominal > 0 ? current / nominal : 0, lineFactor })
  }

  return { machines, delivered, lines }
}

// Capacity picture "right now" (every machine in its recorded state, no scenario).
export function calculateCurrentCapacity(factoryState, configOverrides) {
  const config = resolveConfig(configOverrides)
  assertEngineState(factoryState)
  const context = buildCapacityContext(factoryState)
  const snapshot = computeCapacitySnapshot(context, baselineMachineStates(factoryState), config)
  const codeOf = (id) => context.machinesById.get(id).code

  return {
    asOf: factoryState.asOf,
    machines: factoryState.machines.map((machine) => {
      const s = snapshot.machines.get(machine.id)
      return {
        machineId: machine.id,
        code: machine.code,
        state: s.state,
        capacityPerHour: machine.capacityPerHour,
        usableCapacityPerHour: round(s.effectiveCapacity, 2),
        assignedLoadPerHour: round(s.demand, 2),
        outputRatio: round(s.outputRatio, 4),
        utilization: round(s.utilization, 4),
        limitedByMachineCodes: s.limitingUpstreamIds.map(codeOf),
      }
    }),
    productionLines: factoryState.productionLines.map((line) => {
      const s = snapshot.lines.get(line.id)
      return {
        productionLineId: line.id,
        code: line.code,
        nominalCapacityPerHour: round(s.nominal, 2),
        currentCapacityPerHour: round(s.current, 2),
        capacityLossPerHour: round(s.nominal - s.current, 2),
        capacityRatio: round(s.ratio, 4),
      }
    }),
  }
}
