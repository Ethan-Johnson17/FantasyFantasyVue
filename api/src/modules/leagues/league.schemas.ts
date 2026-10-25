import { z } from 'zod'
import { NotFound } from '../../lib/errors.js'
import {
  LEAGUE_CADENCES,
  LEAGUE_MODES,
  LEAGUE_NAME_MAX,
  LEAGUE_VISIBILITIES,
  MAX_PARTIES,
  MIN_PARTIES
} from './league.model.js'
import { CREST_BANNERS, CREST_EMBLEMS } from './crests.js'
import { PARTY_NAME_MAX } from './party.model.js'
import { PIN_PATTERN } from './pin.js'

export const PartyInputSchema = z
  .object({
    name: z.string().trim().min(1).max(PARTY_NAME_MAX),
    crest: z.object({ emblem: z.enum(CREST_EMBLEMS), banner: z.enum(CREST_BANNERS) }).strict()
  })
  .strict()

export const PinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PIN_PATTERN, 'must be a 6-character league PIN')

export const CreateLeagueSchema = z
  .object({
    name: z.string().trim().min(1).max(LEAGUE_NAME_MAX),
    visibility: z.enum(LEAGUE_VISIBILITIES),
    cadence: z.enum(LEAGUE_CADENCES),
    maxParties: z.number().int().min(MIN_PARTIES).max(MAX_PARTIES),
    // Crossover follows the NFL's weeks, so its cadence is always weekly.
    mode: z.enum(LEAGUE_MODES).default('classic'),
    party: PartyInputSchema
  })
  .strict()

export const UpdateLeagueSchema = CreateLeagueSchema.omit({ party: true, mode: true })
  .partial()
  .strict()
  .refine(update => Object.keys(update).length > 0, 'provide at least one field to change')

export const JoinLeagueSchema = z.object({ pin: PinSchema, party: PartyInputSchema }).strict()

export const UpdatePartySchema = PartyInputSchema.extend({ autoSwap: z.boolean() })
  .partial()
  .strict()
  .refine(update => Object.keys(update).length > 0, 'provide at least one field to change')

const ObjectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, 'must be an id')

export const ScheduleDraftSchema = z
  .object({ draftAt: z.iso.datetime({ offset: true }).transform(value => new Date(value)) })
  .strict()

export const RankingsSchema = z
  .object({
    heroIds: z
      .array(ObjectIdSchema)
      .max(200)
      .refine(ids => new Set(ids.map(id => id.toLowerCase())).size === ids.length, 'heroes may only be ranked once')
  })
  .strict()

/** Hero id by slot key. Which keys are required depends on the league's ruleset (checked in the service). */
export const LineupSchema = z.record(z.string().regex(/^[A-Za-z0-9]{1,20}$/, 'must be a slot key'), ObjectIdSchema)

export const ClaimSchema = z
  .object({ heroId: ObjectIdSchema.transform(id => id.toLowerCase()), dropHeroId: ObjectIdSchema.transform(id => id.toLowerCase()) })
  .strict()

export const ChampionSchema = z.object({ heroId: ObjectIdSchema.transform(id => id.toLowerCase()).nullable() }).strict()

// Classic plays 14 weeks; Crossover up to 17 (NFL weeks 1-17).
export const WeekParamSchema = z.coerce.number().int().min(1).max(17)

export const QuestPartySchema = z
  .object({ heroIds: z.array(ObjectIdSchema.transform(id => id.toLowerCase())).min(1).max(10) })
  .strict()

export const MatchupQuerySchema = z.object({ week: WeekParamSchema.optional() }).strict()

export const PageQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(100).default(1) })

export type CreateLeagueInput = z.infer<typeof CreateLeagueSchema>
export type UpdateLeagueInput = z.infer<typeof UpdateLeagueSchema>
export type PartyInput = z.infer<typeof PartyInputSchema>
export type UpdatePartyInput = z.infer<typeof UpdatePartySchema>

/** Route ids that aren't valid ObjectIds can't exist, so treat them as not found rather than a 500. */
export function parseId(id: string | undefined): string {
  if (!id || !/^[0-9a-f]{24}$/i.test(id)) throw new NotFound()
  return id
}
