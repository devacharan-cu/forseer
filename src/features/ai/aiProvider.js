import { createBrowserAiProvider } from '../../ai/client.js'

// One browser provider for the session; it only ever talks to the forseer-ai
// Edge Function, which holds the model key server-side.
let provider = null
export function getAiProvider() {
  provider ??= createBrowserAiProvider()
  return provider
}

const FRIENDLY = {
  ai_unavailable: 'The AI service is not reachable — the forseer-ai Edge Function is not deployed or has no API key configured.',
  ai_timeout: 'The AI service took too long to respond.',
  ai_rate_limited: 'The AI service is rate limiting requests. Try again shortly.',
  ai_refused: 'The model declined this request.',
  ai_invalid_output: 'The AI reply failed FORSEER’s checks (for example, it contained figures the engine did not produce), so it was discarded.',
  ai_malformed_output: 'The AI reply was not valid structured output, so it was discarded.',
  ai_empty_response: 'The AI service returned nothing.',
  ai_provider_error: 'The AI service returned an error.',
}

export function aiErrorMessage(error) {
  return FRIENDLY[error?.code] ?? error?.message ?? 'The AI request failed.'
}
