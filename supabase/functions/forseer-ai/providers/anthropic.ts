import Anthropic from '@anthropic-ai/sdk'
import type { AiServerConfig } from '../config.ts'
import { ProviderError } from '../errors.ts'

export interface StructuredRequest {
  task: string
  system: string
  prompt: string
  schema: Record<string, unknown>
}

export interface StructuredResult {
  output: unknown
  model: string
}

// Claude adapter. Structured outputs (output_config.format) constrain the reply
// to the JSON schema the browser sent; the browser validates it again anyway.
export async function generateWithAnthropic(config: AiServerConfig, request: StructuredRequest): Promise<StructuredResult> {
  const client = new Anthropic({ apiKey: config.apiKey ?? undefined, timeout: config.timeoutMs, maxRetries: 1 })

  let response
  try {
    response = await client.beta.messages.create({
      model: config.model,
      max_tokens: config.maxOutputTokens,
      // If the primary model declines, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: request.system,
      messages: [{ role: 'user', content: request.prompt }],
      output_config: {
        effort: config.effortByTask[request.task] ?? 'medium',
        format: { type: 'json_schema', schema: request.schema },
      },
    })
  } catch (error) {
    throw toProviderError(error)
  }

  if (response.stop_reason === 'refusal') {
    throw new ProviderError('ai_refused', 'The model declined this request')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ProviderError('ai_malformed_output', 'The model reply was cut off before it finished')
  }
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { text: string }).text)
    .join('')
  if (text.trim() === '') throw new ProviderError('ai_empty_response', 'The model returned no text')
  try {
    return { output: JSON.parse(text), model: response.model }
  } catch {
    throw new ProviderError('ai_malformed_output', 'The model reply was not valid JSON')
  }
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError('ai_unavailable', 'The AI provider rejected the server credentials')
  }
  if (error instanceof Anthropic.RateLimitError) return new ProviderError('ai_rate_limited', 'The AI provider is rate limiting requests')
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError('ai_timeout', 'The AI provider timed out')
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError('ai_unavailable', 'The AI provider could not be reached')
  if (error instanceof Anthropic.APIError) return new ProviderError('ai_provider_error', `The AI provider returned an error (${error.status ?? 'unknown status'})`)
  return new ProviderError('ai_provider_error', 'The AI provider call failed')
}
