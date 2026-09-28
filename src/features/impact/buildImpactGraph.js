import { flowOrder, machinesOnLine, openOrders, primaryLineId, transitiveDownstream } from '../factory/model.js'

const COLUMN_X = { machine: 0, line: 330, order: 660, outcome: 1010 }
const MACHINE_STEP = 72
const ORDER_STEP = 68
const GROUP_GAP = 34
const OUTCOME_ORDER = ['BREACHED', 'CRITICAL', 'WARNING', 'SAFE']
const CONSTRAINING = ['sequential', 'shared_resource']

// Builds the causal graph  machine -> production line -> order -> deadline outcome
// from the factory data, the engine's current outlook and (optionally) one scenario
// result. Every value on a node is either a record or an engine output.
export function buildImpactGraph({ state, view, result = null, focusMachineId = null, focusOrderId = null, expandAll = false }) {
  const nodes = []
  const edges = []
  const lines = [...state.productionLines]

  const machineImpact = new Map((result?.machineImpacts ?? []).map((m) => [m.machineId, m]))
  const lineImpact = new Map((result?.lineImpacts ?? []).map((l) => [l.productionLineId, l]))
  const orderImpact = new Map((result?.orderImpacts ?? view.outlook.orderImpacts).map((o) => [o.orderId, o]))
  const secondary = new Map((result?.resourceImpacts ?? []).map((r) => [r.machineId, r]))

  // Machines, grouped by home line in flow order.
  let y = 0
  const placedMachines = new Set()
  const lineCenters = new Map()
  for (const line of lines) {
    const machines = flowOrder(state, machinesOnLine(state, line.id).filter((m) => primaryLineId(state, m.id) === line.id))
    const top = y
    for (const machine of machines) {
      const risk = view.riskById.get(machine.id)
      const impact = machineImpact.get(machine.id) ?? null
      nodes.push({
        id: `machine:${machine.id}`,
        type: 'machine',
        position: { x: COLUMN_X.machine, y },
        data: {
          entityId: machine.id,
          code: machine.code,
          name: machine.name,
          engineState: machine.baselineState,
          riskLevel: risk?.level ?? 'LOW',
          riskPoints: risk?.points ?? 0,
          impact,
          secondaryRisk: secondary.get(machine.id) ?? null,
        },
      })
      placedMachines.add(machine.id)
      y += MACHINE_STEP
    }
    lineCenters.set(line.id, machines.length ? (top + y - MACHINE_STEP) / 2 : y)
    y += GROUP_GAP
  }
  for (const machine of state.machines.filter((m) => !placedMachines.has(m.id))) {
    nodes.push({
      id: `machine:${machine.id}`,
      type: 'machine',
      position: { x: COLUMN_X.machine, y },
      data: { entityId: machine.id, code: machine.code, name: machine.name, engineState: machine.baselineState, riskLevel: view.riskById.get(machine.id)?.level ?? 'LOW', riskPoints: 0, impact: machineImpact.get(machine.id) ?? null },
    })
    y += MACHINE_STEP
  }
  const machinesBottom = y

  // Lines, centred on their machines.
  for (const line of lines) {
    const capacity = view.capacityByLineId.get(line.id)
    const onLine = openOrders(state).filter((o) => o.productionLineId === line.id)
    nodes.push({
      id: `line:${line.id}`,
      type: 'line',
      position: { x: COLUMN_X.line, y: lineCenters.get(line.id) - 12 },
      data: {
        entityId: line.id,
        code: line.code,
        name: line.name,
        nominal: capacity?.nominalCapacityPerHour ?? line.nominalCapacityPerHour,
        current: capacity?.currentCapacityPerHour ?? null,
        openOrders: onLine.length,
        queuedWork: onLine.reduce((total, o) => total + o.requiredProductionHours, 0),
        impact: lineImpact.get(line.id) ?? null,
      },
    })
  }

  // Orders, grouped by line in queue order, kept clear of each other. Orders that
  // matter right now are shown individually; each line's remaining on-track,
  // unaffected orders collapse into one group node so the graph stays readable.
  const focusLineIds = focusLines(state, focusMachineId, focusOrderId)
  let orderCursor = 0
  const outcomeMembers = new Map(OUTCOME_ORDER.map((s) => [s, []]))
  const groupedOrderIds = new Map()
  for (const line of lines) {
    const all = openOrders(state)
      .filter((o) => o.productionLineId === line.id)
      .map((o) => ({ order: o, impact: orderImpact.get(o.id) }))
      .sort((a, b) => (a.impact?.queuePosition ?? 99) - (b.impact?.queuePosition ?? 99))
    const expanded = expandAll || focusLineIds.has(line.id)
    const shown = all.filter(({ impact }) => expanded || isNoteworthy(impact, Boolean(result)))
    const collapsed = all.filter((entry) => !shown.includes(entry))
    const rows = shown.length + (collapsed.length ? 1 : 0)
    const height = Math.max(0, (rows - 1) * ORDER_STEP)
    let oy = Math.max(orderCursor, lineCenters.get(line.id) - height / 2)
    for (const { order, impact } of shown) {
      const status = impact?.scenario.status ?? 'SAFE'
      nodes.push({
        id: `order:${order.id}`,
        type: 'order',
        position: { x: COLUMN_X.order, y: oy },
        data: {
          entityId: order.id,
          orderNumber: order.orderNumber,
          priority: order.priority,
          quantity: order.quantity,
          deadline: order.deadline,
          status,
          baselineStatus: result ? impact?.baseline.status : null,
          slackHours: impact?.scenario.slackHours ?? null,
          delayHours: result ? impact?.delayHours ?? null : null,
          statusChanged: Boolean(result && impact?.statusChanged),
        },
      })
      outcomeMembers.get(status)?.push(order)
      oy += ORDER_STEP
    }
    if (collapsed.length) {
      const statuses = [...new Set(collapsed.map(({ impact }) => impact?.scenario.status ?? 'SAFE'))]
      nodes.push({
        id: `orders:${line.id}`,
        type: 'orderGroup',
        position: { x: COLUMN_X.order, y: oy },
        data: {
          count: collapsed.length,
          units: collapsed.reduce((total, { order }) => total + order.quantity, 0),
          orderNumbers: collapsed.map(({ order }) => order.orderNumber),
          status: statuses.length === 1 ? statuses[0] : 'SAFE',
          lineCode: line.code,
        },
      })
      for (const { order, impact } of collapsed) {
        outcomeMembers.get(impact?.scenario.status ?? 'SAFE')?.push(order)
        groupedOrderIds.set(order.id, `orders:${line.id}`)
      }
      oy += ORDER_STEP
    }
    orderCursor = oy + GROUP_GAP
  }

  // Deadline outcomes: one node per engine deadline status.
  const bottom = Math.max(machinesBottom, orderCursor)
  const outcomeStep = Math.max(120, (bottom - 110) / (OUTCOME_ORDER.length - 1))
  OUTCOME_ORDER.forEach((status, index) => {
    const members = outcomeMembers.get(status)
    nodes.push({
      id: `outcome:${status}`,
      type: 'outcome',
      position: { x: COLUMN_X.outcome, y: index * outcomeStep },
      data: {
        status,
        count: members.length,
        orderNumbers: members.map((o) => o.orderNumber),
        units: members.reduce((total, o) => total + o.quantity, 0),
        criticalOrders: members.filter((o) => o.priority === 'critical').length,
      },
    })
  })

  // Edges ---------------------------------------------------------------
  const cascadeKeys = new Set()
  for (const link of result?.cascade ?? []) {
    if (link.step === 1 && link.impactType === 'upstream_starvation') cascadeKeys.add(`mm:${link.sourceId}:${link.targetId}`)
    if (link.step === 2) cascadeKeys.add(`ml:${link.sourceId}:${link.targetId}`)
    if (link.step === 3) cascadeKeys.add(`lo:${link.sourceId}:${link.targetId}`)
    if (link.step === 4) cascadeKeys.add(`od:${link.sourceId}`)
  }

  for (const d of state.machineDependencies) {
    if (CONSTRAINING.includes(d.dependencyType)) {
      const key = `mm:${d.dependsOnMachineId}:${d.machineId}`
      edges.push({
        id: key,
        source: `machine:${d.dependsOnMachineId}`,
        sourceHandle: 'bottom',
        target: `machine:${d.machineId}`,
        targetHandle: 'top',
        data: { kind: 'feeds', impact: cascadeKeys.has(key) },
      })
    } else if (d.dependencyType === 'backup') {
      edges.push({
        id: `backup:${d.id}`,
        source: `machine:${d.machineId}`,
        sourceHandle: 'left-out',
        target: `machine:${d.dependsOnMachineId}`,
        targetHandle: 'left-in',
        data: { kind: 'backup', impact: false },
      })
    }
  }

  for (const a of state.machineLineAssignments) edges.push(assignmentEdge(a, cascadeKeys))
  if (result) {
    // Load transfers the scenario applied, exactly as the engine resolved them.
    const transfers = result.assumptions.actions.flatMap((a) => (a.resolved?.kind === 'load_transfer' ? a.resolved.transfers : []))
    for (const t of transfers) {
      edges.push({
        id: `transfer:${t.fromMachineId}:${t.targetMachineId}`,
        source: `machine:${t.fromMachineId}`,
        sourceHandle: 'left-out',
        target: `machine:${t.targetMachineId}`,
        targetHandle: 'left-in',
        data: { kind: 'transfer', impact: true, label: `${t.loadPerHour}/h moved` },
      })
    }
  }

  const groupEdges = new Set()
  for (const order of openOrders(state)) {
    const status = orderImpact.get(order.id)?.scenario.status ?? 'SAFE'
    const group = groupedOrderIds.get(order.id)
    if (group) {
      const serves = `serves:${group}`
      const outcome = `outcome-edge:${group}:${status}`
      if (!groupEdges.has(serves)) edges.push({ id: serves, source: `line:${order.productionLineId}`, target: group, data: { kind: 'serves', impact: false } })
      if (!groupEdges.has(outcome)) edges.push({ id: outcome, source: group, target: `outcome:${status}`, data: { kind: 'outcome', status, impact: false } })
      groupEdges.add(serves).add(outcome)
      continue
    }
    const lo = `lo:${order.productionLineId}:${order.id}`
    edges.push({ id: lo, source: `line:${order.productionLineId}`, target: `order:${order.id}`, data: { kind: 'serves', impact: cascadeKeys.has(lo) } })
    edges.push({
      id: `od:${order.id}`,
      source: `order:${order.id}`,
      target: `outcome:${status}`,
      data: { kind: 'outcome', status, impact: cascadeKeys.has(`od:${order.id}`) },
    })
  }

  applyFocus(state, nodes, edges, { result, focusMachineId, focusOrderId })
  return { nodes, edges }
}

function isNoteworthy(impact, scenarioMode) {
  if (!impact) return false
  if (impact.scenario.status !== 'SAFE') return true
  return scenarioMode && (impact.statusChanged || Math.abs(impact.delayHours ?? 0) > 0)
}

// Lines whose orders should be listed in full because they sit on the focused path.
function focusLines(state, focusMachineId, focusOrderId) {
  const ids = new Set()
  if (focusMachineId) {
    for (const id of [focusMachineId, ...transitiveDownstream(state, focusMachineId).map((m) => m.id)]) {
      for (const a of state.machineLineAssignments.filter((x) => x.machineId === id)) ids.add(a.productionLineId)
    }
  }
  if (focusOrderId) {
    const order = state.orders.find((o) => o.id === focusOrderId)
    if (order) ids.add(order.productionLineId)
  }
  return ids
}

function assignmentEdge(a, cascadeKeys) {
  const key = `ml:${a.machineId}:${a.productionLineId}`
  return {
    id: `${key}:${a.id}`,
    source: `machine:${a.machineId}`,
    target: `line:${a.productionLineId}`,
    data: { kind: 'assigned', impact: cascadeKeys.has(key), label: `${a.contributionPerHour}/h` },
  }
}

// Marks the causal path of the focused machine/order (or the scenario's affected
// set) as highlighted, and everything else as dimmed.
function applyFocus(state, nodes, edges, { result, focusMachineId, focusOrderId }) {
  let related = null
  if (focusMachineId) {
    related = new Set([`machine:${focusMachineId}`])
    const machines = [focusMachineId, ...transitiveDownstream(state, focusMachineId).map((m) => m.id)]
    for (const id of machines) {
      related.add(`machine:${id}`)
      for (const a of state.machineLineAssignments.filter((x) => x.machineId === id)) related.add(`line:${a.productionLineId}`)
    }
    // Machines that can back this one up are part of its story too.
    for (const d of state.machineDependencies.filter((x) => x.dependencyType === 'backup')) {
      if (d.machineId === focusMachineId) related.add(`machine:${d.dependsOnMachineId}`)
      if (d.dependsOnMachineId === focusMachineId) related.add(`machine:${d.machineId}`)
    }
  } else if (focusOrderId) {
    const order = state.orders.find((o) => o.id === focusOrderId)
    if (order) {
      related = new Set([`order:${order.id}`, `line:${order.productionLineId}`])
      for (const m of machinesOnLine(state, order.productionLineId)) related.add(`machine:${m.id}`)
    }
  } else if (result) {
    related = new Set()
    for (const n of nodes) {
      const d = n.data
      if ((n.type === 'machine' && d.impact) || (n.type === 'line' && d.impact) || (n.type === 'order' && (d.statusChanged || (d.delayHours ?? 0) !== 0))) related.add(n.id)
    }
  }
  if (!related) return

  // Orders on highlighted lines, and the outcomes those orders land in, belong to the path.
  if (focusMachineId) {
    for (const e of edges) if (e.data.kind === 'serves' && related.has(e.source)) related.add(e.target)
  }
  for (const e of edges) if (e.data.kind === 'outcome' && related.has(e.source)) related.add(e.target)

  for (const n of nodes) n.data.dimmed = !related.has(n.id)
  for (const e of edges) e.data.highlighted = related.has(e.source) && related.has(e.target)
}

export const GRAPH_OUTCOMES = OUTCOME_ORDER
