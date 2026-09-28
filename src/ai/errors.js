export const AI_ERROR_CODES = Object.freeze({
  UNAVAILABLE: 'ai_unavailable',
  TIMEOUT: 'ai_timeout',
  PROVIDER_ERROR: 'ai_provider_error',
  RATE_LIMITED: 'ai_rate_limited',
  REFUSED: 'ai_refused',
  EMPTY_RESPONSE: 'ai_empty_response',
  MALFORMED_OUTPUT: 'ai_malformed_output',
  INVALID_OUTPUT: 'ai_invalid_output',
  UNSUPPORTED_REQUEST: 'ai_unsupported_request',
})

const KNOWN_CODES = new Set(Object.values(AI_ERROR_CODES))

// Every AI failure surfaces as an AiError with a stable code, so callers can
// fall back to engine-only behaviour without parsing messages.
export class AiError extends Error {
  constructor(code, message, { issues = [], cause } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = 'AiError'
    this.code = KNOWN_CODES.has(code) ? code : AI_ERROR_CODES.PROVIDER_ERROR
    this.issues = issues
  }
}

export function isAiError(error) {
  return error instanceof AiError
}

export function normalizeAiErrorCode(code) {
  return KNOWN_CODES.has(code) ? code : AI_ERROR_CODES.PROVIDER_ERROR
}

export function describeAiError(error) {
  return { code: error.code, message: error.message, issues: [...(error.issues ?? [])] }
}
