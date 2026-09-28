import { supabase } from '../supabaseClient'

export async function getMaintenanceEvents() {
  const { data, error } = await supabase
    .from('maintenance_events')
    .select('*')
    .order('occurred_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getMaintenanceEventsByMachine(machineId) {
  const { data, error } = await supabase
    .from('maintenance_events')
    .select('*')
    .eq('machine_id', machineId)
    .order('occurred_at', { ascending: false })

  if (error) throw error
  return data
}

export async function createMaintenanceEvent(event) {
  const { data, error } = await supabase
    .from('maintenance_events')
    .insert(event)
    .select()
    .single()

  if (error) throw error
  return data
}
