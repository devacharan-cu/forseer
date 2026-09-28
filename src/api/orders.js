import { supabase } from '../supabaseClient'

export async function getOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('deadline', { ascending: true })

  if (error) throw error
  return data
}

export async function getOrderById(id) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createOrder(order) {
  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateOrder(id, updates) {
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}
