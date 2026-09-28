// Error codes shared with the browser (src/ai/errors.js) and the HTTP status each maps to.
export const ERROR_STATUS = {
  ai_unavailable: 503,
  ai_timeout: 504,
  ai_provider_error: 502,
  ai_rate_limited: 429,
  ai_refused: 422,
  ai_empty_response: 502,
  ai_malformed_output: 502,
  ai_unsupported_request: 400,
} as const

export type AiErrorCode = keyof typeof ERROR_STATUS

export class ProviderError extends Error {
  code: AiErrorCode
  constructor(code: AiErrorCode, message: string) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
  }
}
