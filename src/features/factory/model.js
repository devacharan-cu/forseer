// Read-only views over the normalized factory state. No figures are invented
// here: everything is either a record from the data or an engine output.

const DAY_MS = 86_400_000
const SERVICE_EVENT_TYPES = ['preventive', 'repair', 'emergency']
const OPEN_INCIDENT_STATUSES = ['open', 'investigating']
const CONSTRAINING = ['sequential', 'shared_resource']

export const RISK_ORDER = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL']
export const DEADLINE_ORDER = ['SAFE', 'WARNING', 'CRITICAL', 'BREACHED']

export function machineById(state, id) {
  return state.machines.find((machine) => machine.id === id) ?? null
}

export function lineById(state, id) {
  return state.productionLines.find((line) => line.id === id) ?? null
}

export function orderById(state, id) {
  return state.orders.find((order) => order.id === id) ?? null
}

// Lines a machine does its own (non-covering) work on.
export function linesForMachine(state, machineId) {
  const lineIds = state.machineLineAssignments
    .filter((a) => a.machineId === machineId && a.coversMachineId === null)
    .map((a) => a.productionLineId)
  return state.productionLines.filter((line) => lineIds.includes(line.id))
}

export function machinesOnLine(state, lineId) {
  const ids = state.machineLineAssignments
    .filter((a) => a.productionLineId === lineId && a.coversMachineId === null)
    .map((a) => a.machineId)
  return state.machines.filter((machine) => ids.includes(machine.id))
}

export function assignmentFor(state, machineId, lineId) {
  return state.machineLineAssignments.find(
    (a) => a.machineId === machineId && a.productionLineId === lineId && a.coversMachineId === null,
  )
}

export function upstreamOf(state, machineId) {
  return state.machineDependencies
    .filter((d) => d.machineId === machineId && CONSTRAINING.includes(d.dependencyType))
    .map((d) => ({ machine: machineById(state, d.dependsOnMachineId), dependency: d }))
}

export function downstreamOf(state, machineId) {
  return state.machineDependencies
    .filter((d) => d.dependsOnMachineId === machineId && CONSTRAINING.includes(d.dependencyType))
    .map((d) => ({ machine: machineById(state, d.machineId), dependency: d }))
}

export function backupsOf(state, machineId) {
  return state.machineDependencies
    .filter((d) => d.dependencyType === 'backup' && (d.machineId === machineId || d.dependsOnMachineId === machineId))
    .map((d) => ({
      machine: machineById(state, d.machineId === machineId ? d.dependsOnMachineId : d.machineId),
      dependency: d,
    }))
}

// Every machine that stops getting input if this one stops (sequential chain).
export function transitiveDownstream(state, machineId) {
  const seen = new Set()
  const queue = [machineId]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const { machine } of downstreamOf(state, current)) {
      if (machine && !seen.has(machine.id)) {
        seen.add(machine.id)
        queue.push(machine.id)
      }
    }
  }
  return state.machines.filter((machine) => seen.has(machine.id))
}

// Machines in the order work flows through them (sequential dependencies); code order breaks ties.
export function flowOrder(state, machines) {
  const ids = new Set(machines.map((m) => m.id))
  const byCode = [...machines].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
  const upstreamCount = new Map(byCode.map((m) => [m.id, 0]))
  const next = new Map(byCode.map((m) => [m.id, []]))
  for (const d of state.machineDependencies) {
    if (!CONSTRAINING.includes(d.dependencyType) || !ids.has(d.machineId) || !ids.has(d.dependsOnMachineId)) continue
    upstreamCount.set(d.machineId, upstreamCount.get(d.machineId) + 1)
    next.get(d.dependsOnMachineId).push(d.machineId)
  }
  const ready = byCode.filter((m) => upstreamCount.get(m.id) === 0).map((m) => m.id)
  const order = []
  while (ready.length > 0) {
    const id = ready.shift()
    order.push(id)
    for (const child of next.get(id)) {
      upstreamCount.set(child, upstreamCount.get(child) - 1)
      if (upstreamCount.get(child) === 0) ready.push(child)
    }
  }
  for (const m of byCode) if (!order.includes(m.id)) order.push(m.id)
  return order.map((id) => machines.find((m) => m.id === id))
}

// Each machine's home line: the first line it does its own work on.
export function primaryLineId(state, machineId) {
  return (
    state.machineLineAssignments.find((a) => a.machineId === machineId && a.coversMachineId === null)?.productionLineId ?? null
  )
}

export function openOrders(state) {
  return state.orders.filter((order) => ['pending', 'in_progress', 'at_risk', 'late'].includes(order.status))
}

export function ordersOnLines(state, lineIds) {
  return openOrders(state).filter((order) => lineIds.includes(order.productionLineId))
}

// What depends on this machine right now: the machines downstream of it, the
// lines it feeds, and the open orders on those lines with their engine outlook.
export function exposureOf(state, view, machineId) {
  const downstream = transitiveDownstream(state, machineId)
  const lines = linesForMachine(state, machineId)
  const lineIds = lines.map((line) => line.id)
  const orders = ordersOnLines(state, lineIds)
    .map((order) => ({ order, outlook: view.orderOutlookById.get(order.id) ?? null }))
    .sort((a, b) => (a.outlook?.baseline.slackHours ?? Infinity) - (b.outlook?.baseline.slackHours ?? Infinity))
  return { downstream, lines, orders }
}

export function incidentsFor(state, machineId) {
  return state.incidents
    .filter((incident) => incident.machineId === machineId)
    .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
}

export function openIncidents(state) {
  return state.incidents.filter((incident) => OPEN_INCIDENT_STATUSES.includes(incident.status))
}

export function maintenanceFor(state, machineId) {
  return state.maintenanceEvents
    .filter((event) => event.machineId === machineId)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
}

// Service interval runs from the last event that serviced the machine; inspections do not reset it.
export function serviceStatus(state, machine) {
  const asOfMs = Date.parse(state.asOf)
  const lastService = maintenanceFor(state, machine.id).find(
    (event) => SERVICE_EVENT_TYPES.includes(event.eventType) && Date.parse(event.occurredAt) <= asOfMs,
  )
  const lastServiceAt = lastService?.occurredAt ?? machine.lastMaintenanceAt
  if (!lastServiceAt || !machine.maintenanceIntervalDays) {
    return { lastServiceAt, lastService, nextDueAt: null, daysUntilDue: null, overdue: false }
  }
  const nextDueMs = Date.parse(lastServiceAt) + machine.maintenanceIntervalDays * DAY_MS
  const daysUntilDue = Math.round((nextDueMs - asOfMs) / DAY_MS)
  return { lastServiceAt, lastService, nextDueAt: new Date(nextDueMs).toISOString(), daysUntilDue, overdue: daysUntilDue < 0 }
}

export function riskTone(level) {
  return { CRITICAL: 'danger', HIGH: 'warning', MODERATE: 'warning', LOW: 'success' }[level] ?? 'neutral'
}

export function deadlineTone(status) {
  return { BREACHED: 'danger', CRITICAL: 'danger', WARNING: 'warning', SAFE: 'success' }[status] ?? 'neutral'
}

export function stateTone(engineState) {
  return (
    {
      healthy: 'success',
      monitoring: 'info',
      at_risk: 'warning',
      degraded: 'warning',
      failed: 'danger',
      maintenance: 'neutral',
      retired: 'neutral',
    }[engineState] ?? 'neutral'
  )
}

export const STATE_LABEL = {
  healthy: 'Healthy',
  monitoring: 'Monitoring',
  at_risk: 'At risk',
  degraded: 'Degraded',
  failed: 'Failed',
  maintenance: 'Maintenance',
  retired: 'Retired',
}

// Which stack-light segment is lit for a machine, from its recorded state and engine risk.
export function andonFor(engineState, riskLevel) {
  if (engineState === 'failed' || riskLevel === 'CRITICAL') return 'red'
  if (['degraded', 'maintenance', 'at_risk'].includes(engineState) || riskLevel === 'HIGH' || riskLevel === 'MODERATE') return 'amber'
  if (engineState === 'retired') return null
  return 'green'
}

export function hoursUntil(iso, asOf) {
  return (Date.parse(iso) - Date.parse(asOf)) / 3_600_000
}

export function formatRelativeHours(hours) {
  if (hours === null || hours === undefined) return '—'
  const abs = Math.abs(hours)
  const text = abs >= 48 ? `${Math.round(abs / 24)} d` : `${Math.round(abs)} h`
  return hours < 0 ? `${text} ago` : `in ${text}`
}

export function formatDate(iso, { withTime = false } = {}) {
  if (!iso) return '—'
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export function formatDaysAgo(iso, asOf) {
  if (!iso) return '—'
  const days = Math.round((Date.parse(asOf) - Date.parse(iso)) / DAY_MS)
  if (days <= 0) return 'today'
  return days === 1 ? '1 day ago' : `${days} days ago`
}
