// A machine at risk still runs at full capacity: risk describes how likely
// trouble is, not how much it produces. Only explicit state changes reduce output.
const FULL_CAPACITY_STATES = new Set(['healthy', 'monitoring', 'at_risk'])

// Maps the database vocabulary (status + health_state) to one engine state.
export function deriveBaselineState(status, healthState) {
  switch (status) {
    case 'down':
      return 'failed'
    case 'maintenance':
      return 'maintenance'
    case 'retired':
      return 'retired'
    case 'degraded':
      return 'degraded'
    default:
      if (healthState === 'watch') return 'monitoring'
      if (healthState === 'at_risk' || healthState === 'critical') return 'at_risk'
      return 'healthy'
  }
}

export function capacityFactorFor(state, capacityFactor, config) {
  if (FULL_CAPACITY_STATES.has(state)) return 1
  if (state === 'degraded') return capacityFactor ?? config.degradedCapacityFactor
  return 0
}
