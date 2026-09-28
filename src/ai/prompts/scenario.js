import { MACHINE_STATES } from '../../engine/index.js'
import { AI_TASKS } from '../config.js'
import { S } from '../schema.js'
import { ACTION_GUIDE, ACTION_PROPOSAL_SCHEMA, systemPrompt } from './shared.js'

export const SCENARIO_PROMPT = Object.freeze({
  task: AI_TASKS.SCENARIO_PARSE,
  system: systemPrompt(`Task: translate a what-if question into FORSEER's scenario format. You only translate; FORSEER runs the simulation.
- outcome "scenario": every machine, order and duration comes from the question (or from BASE_SCENARIO when the question extends it).
- outcome "clarification_required": something needed is missing or ambiguous (which machine, how long, when). Ask one short question. Never fill the gap yourself.
- outcome "unsupported": the question asks for something FORSEER cannot simulate. Explain briefly in unsupportedReason.
- machineEvents: a machine changing state. durationHours is the number of hours the user gave, or null if they gave none. Set untilFurtherNotice to true only if the user says it lasts indefinitely. startHours is null unless the user gave a start time in hours from now. capacityFactor only for "degraded", only if the user gave one.
- Set extendsBaseScenario to true only when the question adds to the previous scenario (for example "also", "as well", "on top of that").
- Leave out anything you would have to guess.
${ACTION_GUIDE}`),
  instructions: 'Translate the question inside <user_input> using the JSON schema.',
  schema: S.object({
    outcome: S.oneOf(['scenario', 'clarification_required', 'unsupported']),
    interpretation: S.string(),
    question: S.nullable(S.string()),
    unsupportedReason: S.nullable(S.string()),
    extendsBaseScenario: S.boolean(),
    machineEvents: S.array(
      S.object({
        machineCode: S.string(),
        state: S.oneOf(MACHINE_STATES),
        startHours: S.nullable(S.number()),
        durationHours: S.nullable(S.number()),
        untilFurtherNotice: S.boolean(),
        capacityFactor: S.nullable(S.number()),
      }),
    ),
    actions: S.array(ACTION_PROPOSAL_SCHEMA),
  }),
})
