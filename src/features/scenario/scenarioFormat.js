// Labels for engine result fields. Values are always read from the result as-is.

export const METRIC_DEFS = [
  { key: 'totalDowntimeHours', label: 'Downtime', unit: 'h', hint: 'machine-hours at zero capacity' },
  { key: 'capacityLossLineHours', label: 'Production lost', unit: 'line-h', hint: 'nominal line-hours across lines' },
  { key: 'ordersAtRisk', label: 'Orders at risk', baseline: 'baselineOrdersAtRisk', hint: 'WARNING or CRITICAL' },
  { key: 'deadlineBreaches', label: 'Deadline breaches', baseline: 'baselineDeadlineBreaches', hint: 'BREACHED in this future' },
  { key: 'newDeadlineBreaches', label: 'New breaches', hint: 'breached here, not in the baseline' },
  { key: 'secondaryRisks', label: 'Secondary risks', hint: 'machines pushed to high utilization' },
  { key: 'machinesAffected', label: 'Machines affected' },
  { key: 'linesAffected', label: 'Lines affected' },
  { key: 'ordersAffected', label: 'Orders affected' },
]

export const METRIC_LABEL = Object.fromEntries(METRIC_DEFS.map((d) => [d.key, d.label]))

export const STEP_LABEL = ['Trigger', 'Machines', 'Production lines', 'Orders', 'Deadlines']

export const IMPACT_LABEL = {
  state_change: 'state change',
  load_reduction: 'load reduced',
  deadline_change: 'deadline moved',
  upstream_starvation: 'starved of input',
  load_transfer: 'takes over load',
  secondary_high_utilization: 'high utilization',
  secondary_overload: 'overloaded',
  capacity_reduction: 'capacity lost',
  capacity_increase: 'capacity gained',
  completion_delay: 'finishes later',
  completion_advance: 'finishes earlier',
  cannot_complete: 'cannot complete',
  deadline_status_change: 'deadline status',
}

export const CONDITION_LABEL = {
  deadline_breach: 'breaches its deadline',
  machine_overload: 'becomes overloaded',
  line_stopped: 'stops',
}

export const STATE_COLORS = {
  healthy: 'success',
  monitoring: 'success',
  at_risk: 'warning',
  degraded: 'warning',
  failed: 'danger',
  maintenance: 'info',
  retired: 'neutral',
}

export function formatMagnitude(entry) {
  const m = entry.magnitude
  switch (entry.unit) {
    case 'hours':
      return entry.impactType === 'state_change' && entry.detail
        ? `${entry.detail.state} ${entry.detail.startHours}–${entry.detail.endHours} h`
        : `${m} h`
    case 'capacity_units_per_hour':
      return `${m}/h`
    case 'line_hours':
      return `${Math.abs(m)} line-h`
    case 'utilization_ratio':
      return `${Math.round(m * 100)}%`
    case 'fraction_of_load':
      return `${Math.round(m * 100)}%`
    case 'slack_hours':
      return `${entry.detail?.from} → ${entry.detail?.to} (${m} h slack)`
    default:
      return String(m)
  }
}

export function formatHours(value) {
  return value === null || value === undefined ? '—' : `${value} h`
}
