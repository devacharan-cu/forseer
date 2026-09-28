import { AI_DEFAULT_TIMEOUT_MS } from './config.js'
import { AI_ERROR_CODES, AiError, isAiError } from './errors.js'

// The one interface FORSEER uses to talk to a language model:
//
//   provider.generateStructured({ task, system, prompt, schema }) -> parsed JSON value
//
// A transport performs the actual call (the browser uses the Supabase Edge
// Function; tests use a mock). Provider SDKs and API keys live only server-side.
export function createAiProvider({ transport, timeoutMs = AI_DEFAULT_TIMEOUT_MS, name = 'custom' } = {}) {
  if (typeof transport !== 'function') throw new TypeError('createAiProvider needs a transport function')

  async function generateStructured(request) {
    assertRequest(request)
    const controller = new AbortController()
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new AiError(AI_ERROR_CODES.TIMEOUT, `The AI service did not respond within ${timeoutMs} ms`))
      }, timeoutMs)
    })
    try {
      const raw = await Promise.race([
        Promise.resolve().then(() => transport(request, { signal: controller.signal })),
        timeout,
      ])
      return parseOutput(raw)
    } catch (error) {
      if (isAiError(error)) throw error
      if (error?.name === 'AbortError') throw new AiError(AI_ERROR_CODES.TIMEOUT, 'The AI request was aborted', { cause: error })
      throw new AiError(AI_ERROR_CODES.PROVIDER_ERROR, `The AI service failed: ${error?.message ?? String(error)}`, { cause: error })
    } finally {
      clearTimeout(timer)
    }
  }

  return Object.freeze({ name, available: true, generateStructured })
}

// Used when no AI service is configured: every call fails fast with a clear
// code, and every workflow falls back to engine-only behaviour.
export function createUnavailableProvider(reason = 'No AI service is configured') {
  return Object.freeze({
    name: 'unavailable',
    available: false,
    async generateStructured() {
      throw new AiError(AI_ERROR_CODES.UNAVAILABLE, reason)
    },
  })
}

function assertRequest(request) {
  const valid =
    request &&
    typeof request.task === 'string' &&
    typeof request.system === 'string' &&
    typeof request.prompt === 'string' &&
    request.schema !== null &&
    typeof request.schema === 'object'
  if (!valid) throw new AiError(AI_ERROR_CODES.UNSUPPORTED_REQUEST, 'AI requests need task, system, prompt and schema')
}

function parseOutput(raw) {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    throw new AiError(AI_ERROR_CODES.EMPTY_RESPONSE, 'The AI service returned an empty response')
  }
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new AiError(AI_ERROR_CODES.MALFORMED_OUTPUT, 'The AI service returned text that is not valid JSON', { cause: error })
  }
}
