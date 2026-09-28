import { AI_TASKS } from '../config.js'
import { S } from '../schema.js'
import { systemPrompt } from './shared.js'

export const EXPLANATION_PROMPT = Object.freeze({
  task: AI_TASKS.SCENARIO_EXPLANATION,
  system: systemPrompt(`Task: explain simulation results that FORSEER's engine has already computed, for a factory manager.
- Follow the engine's cascade: trigger, then machine, then line, then order, then deadline.
- Quote figures exactly as they appear in FACTS, together with the scenario they belong to. Do not recompute, sum or convert them.
- When several scenarios are given, state the trade-offs between them without ranking them.
- warnings repeats engine warnings or assumptions the reader must keep in mind.`),
  instructions: 'Explain the scenario results in FACTS using the JSON schema.',
  schema: S.object({
    headline: S.string(),
    causalChain: S.array(S.string()),
    keyImpacts: S.array(S.string()),
    warnings: S.array(S.string()),
    explanation: S.string(),
    tradeoffs: S.array(S.string()),
  }),
})
