import { AI_TASKS } from '../config.js'
import { S } from '../schema.js'
import { ACTION_GUIDE, ACTION_PROPOSAL_SCHEMA, systemPrompt } from './shared.js'

export const PLAN_SCHEMA = S.object({
  title: S.string(),
  actions: S.array(ACTION_PROPOSAL_SCHEMA),
  rationale: S.string(),
  expectedEffect: S.string(),
  risks: S.string(),
})

export const CANDIDATE_PROMPT = Object.freeze({
  task: AI_TASKS.CANDIDATE_ACTIONS,
  system: systemPrompt(`Task: propose candidate intervention plans for FORSEER to simulate. You do not choose between them; FORSEER simulates each plan, and the results decide.
- A plan is 1 to 3 actions, executed in order.
- Every number in an action (durations, loads, fractions) must appear in FACTS. For example, use durations from this machine's maintenance history, and loads no larger than a machine's spareCapacityPerHour.
- Only use machines, orders and lines listed in FACTS.
- expectedEffect is qualitative ("should reduce the capacity lost on LINE-2"), with no new figures.
- Offer genuinely different options rather than small variations of one.
${ACTION_GUIDE}`),
  instructions: 'Propose candidate plans using the JSON schema. Respect FACTS.maxPlans.',
  schema: S.object({ plans: S.array(PLAN_SCHEMA), notes: S.string() }),
  // Plans are validated one by one, so a single bad plan is rejected, not the whole reply.
  localSchema: S.object({ plans: S.array(S.any()), notes: S.string() }),
})
