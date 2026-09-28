import { supabase } from '../supabaseClient'

// Every table the simulation engine needs, keyed the way normalizeFactoryState() expects.
const TABLES = {
  machines: 'machines',
  productionLines: 'production_lines',
  machineLineAssignments: 'machine_line_assignments',
  orders: 'orders',
  maintenanceEvents: 'maintenance_events',
  incidents: 'incidents',
  machineDependencies: 'machine_dependencies',
}

export async function getFactorySnapshot() {
  const entries = await Promise.all(
    Object.entries(TABLES).map(async ([key, table]) => {
      const { data, error } = await supabase.from(table).select('*')
      if (error) throw error
      return [key, data]
    }),
  )
  return Object.fromEntries(entries)
}
