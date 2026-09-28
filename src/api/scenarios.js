import { supabase } from '../supabaseClient'

export async function getScenarios() {
  const { data, error } = await supabase
    .from('scenarios')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getScenarioById(id) {
  const { data, error } = await supabase
    .from('scenarios')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createScenario(scenario) {
  const { data, error } = await supabase
    .from('scenarios')
    .insert(scenario)
    .select()
    .single()

  if (error) throw error
  return data
}

// Stores a deterministic result produced by the simulation engine
// (src/engine/) for a given scenario. This function only persists the
// numbers it is given — it never computes them.
export async function saveScenarioImpact(impact) {
  const { data, error } = await supabase
    .from('scenario_impacts')
    .insert(impact)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function saveScenarioAction(action) {
  const { data, error } = await supabase
    .from('scenario_actions')
    .insert(action)
    .select()
    .single()

  if (error) throw error
  return data
}

// Stores AI-generated reasoning about an already-computed scenario
// result. The recommendation text comes from the AI layer (src/ai/);
// this function only persists it.
export async function saveRecommendation(recommendation) {
  const { data, error } = await supabase
    .from('recommendations')
    .insert(recommendation)
    .select()
    .single()

  if (error) throw error
  return data
}
