import { AI_FUNCTION_NAME } from '../config.js'
import { AI_ERROR_CODES, AiError, normalizeAiErrorCode } from '../errors.js'

// Browser transport: sends the structured request to the forseer-ai Supabase
// Edge Function, which holds the provider API key and calls the model.
// `getClient` returns a Supabase client (sync or async) so a missing Supabase
// configuration degrades to "AI unavailable" instead of breaking the app.
export function createEdgeFunctionTransport(getClient, { functionName = AI_FUNCTION_NAME } = {}) {
  return async (request, { signal } = {}) => {
    let client
    try {
      client = await getClient()
    } catch (error) {
      throw new AiError(AI_ERROR_CODES.UNAVAILABLE, 'Supabase is not configured, so the AI service cannot be reached', { cause: error })
    }

    const { data, error } = await client.functions.invoke(functionName, { body: request, signal })
    if (error) throw await toAiError(error)
    if (!data || typeof data !== 'object') {
      throw new AiError(AI_ERROR_CODES.EMPTY_RESPONSE, 'The AI service returned no data')
    }
    if (data.error) throw new AiError(normalizeAiErrorCode(data.error.code), data.error.message ?? 'The AI service failed')
    return data.output
  }
}

async function toAiError(error) {
  if (error?.name === 'AbortError') return new AiError(AI_ERROR_CODES.TIMEOUT, 'The AI request was aborted', { cause: error })
  if (error?.name === 'FunctionsHttpError') {
    const body = await readJson(error.context)
    const code = body?.error?.code ?? (error.context?.status === 503 ? AI_ERROR_CODES.UNAVAILABLE : AI_ERROR_CODES.PROVIDER_ERROR)
    return new AiError(normalizeAiErrorCode(code), body?.error?.message ?? 'The AI service returned an error', { cause: error })
  }
  if (error?.name === 'FunctionsFetchError') {
    return new AiError(AI_ERROR_CODES.UNAVAILABLE, 'The AI service could not be reached (is the forseer-ai function deployed?)', { cause: error })
  }
  return new AiError(AI_ERROR_CODES.PROVIDER_ERROR, error?.message ?? 'The AI service failed', { cause: error })
}

async function readJson(response) {
  try {
    return typeof response?.json === 'function' ? await response.json() : null
  } catch {
    return null
  }
}
