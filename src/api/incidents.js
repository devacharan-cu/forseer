import { supabase } from '../supabaseClient'

export async function getIncidents() {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .order('detected_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getIncidentsByMachine(machineId) {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('machine_id', machineId)
    .order('detected_at', { ascending: false })

  if (error) throw error
  return data
}

export async function createIncident(incident) {
  const { data, error } = await supabase
    .from('incidents')
    .insert(incident)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateIncident(id, updates) {
  const { data, error } = await supabase
    .from('incidents')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}
