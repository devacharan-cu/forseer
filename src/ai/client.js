import { createAiProvider } from './provider.js'
import { createEdgeFunctionTransport } from './transports/edgeFunction.js'

// The provider the React app uses. The Supabase client is imported lazily so a
// missing Supabase configuration surfaces as "AI unavailable", not a crash.
export function createBrowserAiProvider(options = {}) {
  return createAiProvider({
    name: 'supabase-edge-function',
    transport: createEdgeFunctionTransport(async () => (await import('../supabaseClient.js')).supabase),
    ...options,
  })
}
