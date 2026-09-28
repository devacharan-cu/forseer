// FORSEER AI relay: the only code that holds a model API key.
// Deploy: npx supabase functions deploy forseer-ai --no-verify-jwt
// Secret: npx supabase secrets set ANTHROPIC_API_KEY=...
import { createHandler } from './handler.ts'

Deno.serve(createHandler())
