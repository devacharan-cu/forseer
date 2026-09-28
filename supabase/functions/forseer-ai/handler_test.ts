import { createHandler } from './handler.ts'
import { ProviderError } from './errors.ts'

const validBody = {
  task: 'scenario_parse',
  system: 'FORSEER rules',
  prompt: 'FACTS ...',
  schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
}

const post = (body: unknown) =>
  new Request('http://localhost/forseer-ai', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })

const env = (values: Record<string, string>) => (name: string) => values[name]

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

Deno.test('answers CORS preflight', async () => {
  const response = await createHandler({ getEnv: env({}) })(new Request('http://localhost', { method: 'OPTIONS' }))
  assertEquals(response.status, 200)
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*')
})

Deno.test('reports ai_unavailable when no API key is configured', async () => {
  const response = await createHandler({ getEnv: env({}) })(post(validBody))
  assertEquals(response.status, 503)
  assertEquals((await response.json()).error.code, 'ai_unavailable')
})

Deno.test('rejects unknown tasks, malformed bodies and extra fields', async () => {
  const handler = createHandler({ getEnv: env({ ANTHROPIC_API_KEY: 'test-key' }) })
  for (const body of [{ ...validBody, task: 'write_poem' }, 'not json', { ...validBody, model: 'something-else' }, { ...validBody, prompt: '' }]) {
    const response = await handler(post(body))
    assertEquals(response.status, 400)
    assertEquals((await response.json()).error.code, 'ai_unsupported_request')
  }
})

Deno.test('returns provider output from the configured provider', async () => {
  let received: unknown = null
  const handler = createHandler({
    getEnv: env({ ANTHROPIC_API_KEY: 'test-key' }),
    providers: {
      anthropic: (config, request) => {
        received = { model: config.model, task: request.task }
        return Promise.resolve({ output: { ok: true }, model: config.model })
      },
    },
  })
  const response = await handler(post(validBody))
  assertEquals(response.status, 200)
  assertEquals(await response.json(), { output: { ok: true }, model: 'claude-opus-5' })
  assertEquals(received, { model: 'claude-opus-5', task: 'scenario_parse' })
})

Deno.test('maps provider errors to stable codes and never leaks the key', async () => {
  const handler = createHandler({
    getEnv: env({ ANTHROPIC_API_KEY: 'secret-test-key' }),
    providers: { anthropic: () => Promise.reject(new ProviderError('ai_rate_limited', 'slow down')) },
  })
  const response = await handler(post(validBody))
  const text = await response.text()
  assertEquals(response.status, 429)
  assertEquals(JSON.parse(text).error.code, 'ai_rate_limited')
  assertEquals(text.includes('secret-test-key'), false)
})

Deno.test('hides unexpected internal errors', async () => {
  const original = console.error
  console.error = () => {}
  try {
    const handler = createHandler({
      getEnv: env({ ANTHROPIC_API_KEY: 'secret-test-key' }),
      providers: { anthropic: () => Promise.reject(new Error('boom with secret-test-key')) },
    })
    const response = await handler(post(validBody))
    const text = await response.text()
    assertEquals(response.status, 502)
    assertEquals(text.includes('secret-test-key'), false)
  } finally {
    console.error = original
  }
})
