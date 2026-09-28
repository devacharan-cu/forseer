import { ACTION_TYPES } from '../../engine/index.js'
import { AI_TASKS } from '../config.js'
import { S } from '../schema.js'
import { systemPrompt } from './shared.js'

export const RISK_PROMPT = Object.freeze({
  task: AI_TASKS.MACHINE_RISK,
  system: systemPrompt(`Task: explain why FORSEER classifies one machine at its operational risk level.
- Base contributingFactors on the engine's signals; use each signal's exact name.
- historicalEvidence cites the id of an incident or maintenance record from FACTS.
- Phrase it as "FORSEER classifies this machine as <level> operational risk because ...". Never as a chance of failure.
- suggestedPreventiveActions are ideas only; FORSEER simulates them separately.`),
  instructions: 'Explain this machine\'s operational risk using the JSON schema.',
  schema: S.object({
    summary: S.string(),
    contributingFactors: S.array(S.object({ signal: S.string(), explanation: S.string() })),
    historicalEvidence: S.array(S.object({ reference: S.string(), observation: S.string() })),
    concerns: S.array(S.string()),
    suggestedPreventiveActions: S.array(S.object({ actionType: S.oneOf(ACTION_TYPES), description: S.string() })),
    uncertainty: S.string(),
  }),
})
