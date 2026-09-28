import { supabase } from '../supabaseClient'

export async function getMachines() {
  const { data, error } = await supabase
    .from('machines')
    .select('*')
    .order('code', { ascending: true })

  if (error) throw error
  return data
}

export async function getMachineById(id) {
  const { data, error } = await supabase
    .from('machines')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createMachine(machine) {
  const { data, error } = await supabase
    .from('machines')
    .insert(machine)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateMachine(id, updates) {
  const { data, error } = await supabase
    .from('machines')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}
