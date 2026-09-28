import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The engine must stay pure: no network, database, AI, clock, randomness,
// environment access or third-party imports, and no knowledge of the demo data.
const engineDir = new URL('../../src/engine/', import.meta.url)
const sources = readdirSync(engineDir)
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file, text: readFileSync(new URL(file, engineDir), 'utf8') }))

const FORBIDDEN = {
  'network call': /\bfetch\s*\(|XMLHttpRequest|WebSocket/,
  'database access': /@supabase|supabaseClient|createClient|\.from\(\s*['"]/,
  'AI SDK or LLM call': /openai|anthropic|gemini|generativeai|\bllm\b/i,
  'system clock': /Date\.now|new Date\(\s*\)|performance\.now/,
  randomness: /Math\.random|crypto\./,
  'environment access': /import\.meta\.env|process\.env/,
  'third-party import': /from\s+['"](?!\.\/)/,
  'hard-coded demo entity': /NOVA|ORD-0482|'M4'|"M4"/,
}

describe('engine purity', () => {
  it('has engine source files to check', () => {
    assert.ok(sources.length >= 10)
  })

  for (const [rule, pattern] of Object.entries(FORBIDDEN)) {
    it(`contains no ${rule}`, () => {
      const offenders = sources.filter(({ text }) => pattern.test(text)).map(({ file }) => file)
      assert.deepEqual(offenders, [])
    })
  }
})
