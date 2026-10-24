import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { CURRENT_RULESET_VERSION } from '../scoring/rulesets.js'

export const LEAGUE_STATUSES = ['forming', 'drafting', 'active', 'complete', 'canceled'] as const
export const LEAGUE_VISIBILITIES = ['private', 'public'] as const
/** Classic hides each hero's player; Crossover (docs/CROSSOVER_SPEC.md, in progress) shows real, current players. */
export const LEAGUE_MODES = ['classic', 'crossover'] as const
export type LeagueMode = (typeof LEAGUE_MODES)[number]
export const LEAGUE_CADENCES = ['daily', 'weekly'] as const
export const MIN_PARTIES = 2
export const MAX_PARTIES = 12
export const LEAGUE_NAME_MAX = 50

export type LeagueStatus = (typeof LEAGUE_STATUSES)[number]
export type LeagueCadence = (typeof LEAGUE_CADENCES)[number]

/** How long one game week lasts for each cadence. */
export const CADENCE_MS: Readonly<Record<LeagueCadence, number>> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
}

const draftPickSchema = new Schema(
  {
    round: { type: Number, required: true },
    overall: { type: Number, required: true },
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true },
    heroId: { type: Schema.Types.ObjectId, ref: 'Hero', required: true }
  },
  { _id: false }
)

const scheduledWeekSchema = new Schema(
  {
    week: { type: Number, required: true },
    matchups: {
      type: [
        new Schema(
          {
            home: { type: Schema.Types.ObjectId, ref: 'Party', required: true },
            // null: the home party fights the dungeon monster
            away: { type: Schema.Types.ObjectId, ref: 'Party', default: null }
          },
          { _id: false }
        )
      ],
      required: true
    }
  },
  { _id: false }
)

const leagueSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: LEAGUE_NAME_MAX },
    hostId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, immutable: true },
    status: { type: String, required: true, enum: LEAGUE_STATUSES, default: 'forming' },
    // Chosen at creation and never changed: the two modes play by different rules.
    mode: { type: String, required: true, enum: LEAGUE_MODES, default: 'classic', immutable: true },
    visibility: { type: String, required: true, enum: LEAGUE_VISIBILITIES },
    cadence: { type: String, required: true, enum: LEAGUE_CADENCES },
    maxParties: { type: Number, required: true, min: MIN_PARTIES, max: MAX_PARTIES },
    // Maintained transactionally alongside Party inserts/deletes so capacity checks are atomic.
    partyCount: { type: Number, required: true, default: 0, min: 0 },
    // Locked at creation so later ruleset changes never alter this league's results.
    rulesetVersion: { type: Number, required: true, immutable: true, default: CURRENT_RULESET_VERSION },
    pin: { type: String, required: true, unique: true, immutable: true },

    // Set when the draft is scheduled. Never sent to clients, even after the season ("No reveal, ever" in docs/CLASSIC_SCORING.md).
    season: { type: Number, select: false },
    // Seeds the league's hero pool and draft (see lib/random.ts). Never sent to clients.
    seed: { type: String, select: false },
    draftAt: { type: Date },
    // Set when the draft runs
    draftOrder: { type: [{ type: Schema.Types.ObjectId, ref: 'Party' }], default: undefined },
    draftPicks: { type: [draftPickSchema], default: undefined },
    weekOneAt: { type: Date },
    schedule: { type: [scheduledWeekSchema], default: undefined },
    // Game weeks resolved so far; also the optimistic-concurrency token for resolving the next one
    resolvedWeeks: { type: Number, required: true, default: 0 },
    // When the season finished or the league was canceled; starts the chat's retention clock
    endedAt: { type: Date }
  },
  { timestamps: true }
)
leagueSchema.index({ visibility: 1, status: 1, createdAt: -1 })

export type League = InferSchemaType<typeof leagueSchema>
export type LeagueDocument = HydratedDocument<League>

export const LeagueModel = model('League', leagueSchema)
