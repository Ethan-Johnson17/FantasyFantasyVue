import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { CURRENT_RULESET_VERSION } from '../scoring/rulesets.js'

export const LEAGUE_STATUSES = ['forming', 'drafting', 'active', 'complete', 'canceled'] as const
export const LEAGUE_VISIBILITIES = ['private', 'public'] as const
export const LEAGUE_CADENCES = ['daily', 'weekly'] as const
export const MIN_PARTIES = 2
export const MAX_PARTIES = 6
export const LEAGUE_NAME_MAX = 50

export type LeagueStatus = (typeof LEAGUE_STATUSES)[number]

const leagueSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: LEAGUE_NAME_MAX },
    hostId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, immutable: true },
    status: { type: String, required: true, enum: LEAGUE_STATUSES, default: 'forming' },
    visibility: { type: String, required: true, enum: LEAGUE_VISIBILITIES },
    cadence: { type: String, required: true, enum: LEAGUE_CADENCES },
    maxParties: { type: Number, required: true, min: MIN_PARTIES, max: MAX_PARTIES },
    // Maintained transactionally alongside Party inserts/deletes so capacity checks are atomic.
    partyCount: { type: Number, required: true, default: 0, min: 0 },
    // Locked at creation so later ruleset changes never alter this league's results.
    rulesetVersion: { type: Number, required: true, immutable: true, default: CURRENT_RULESET_VERSION },
    pin: { type: String, required: true, unique: true, immutable: true }
  },
  { timestamps: true }
)
leagueSchema.index({ visibility: 1, status: 1, createdAt: -1 })

export type League = InferSchemaType<typeof leagueSchema>
export type LeagueDocument = HydratedDocument<League>

export const LeagueModel = model('League', leagueSchema)
