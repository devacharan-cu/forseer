import { buildNova01Snapshot } from '../data/nova01.js'
import {
  assessFactoryRisk,
  calculateCurrentCapacity,
  normalizeFactoryState,
  simulateScenario,
} from '../engine/index.js'

// Where the factory data comes from. Live Supabase data when the project is
// configured and reachable; otherwise the NOVA-01 seed snapshot, which a test
// keeps identical to supabase/seed.sql (timestamps placed relative to now,
// exactly as the seed places them relative to now()).
export async function loadFactorySnapshot({ supabaseConfigured, fetchLive, now = new Date() }) {
  const asOf = now.toISOString()
  const seed = (warning) => ({ source: 'seed', asOf, rows: buildNova01Snapshot(asOf), warning })

  if (!supabaseConfigured) return seed(null)
  try {
    const rows = await fetchLive()
    if (!rows.machines?.length) {
      return seed('Supabase is connected but has no machines yet. Showing the NOVA-01 seed snapshot.')
    }
    return { source: 'supabase', asOf, rows, warning: null }
  } catch (error) {
    return seed(`Supabase could not be reached (${error.message}). Showing the NOVA-01 seed snapshot.`)
  }
}

// Everything the screens show about the current state, computed once by the engine.
export function deriveFactoryView(rows, asOf) {
  const state = normalizeFactoryState(rows, { asOf })
  const capacity = calculateCurrentCapacity(state)
  const risks = assessFactoryRisk(state)
  const outlook = simulateScenario(state, { id: 'current-plan', name: 'Current plan' })
  return {
    state,
    capacity,
    risks,
    riskById: new Map(risks.map((risk) => [risk.machineId, risk])),
    capacityByMachineId: new Map(capacity.machines.map((entry) => [entry.machineId, entry])),
    capacityByLineId: new Map(capacity.productionLines.map((entry) => [entry.productionLineId, entry])),
    outlook,
    orderOutlookById: new Map(outlook.orderImpacts.map((impact) => [impact.orderId, impact])),
  }
}
