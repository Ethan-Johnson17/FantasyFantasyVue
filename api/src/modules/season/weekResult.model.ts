import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { SYNERGIES } from './strategy.js'

/*
 * The outcome of one game week. Stores exact points and the lineups used, so results are
 * auditable and never change if lineups are edited later. Views round per-hero points.
 */

const heroResultSchema = new Schema(
  {
    heroId: { type: Schema.Types.ObjectId, ref: 'Hero', required: true },
    // The ruleset slot key the hero started in, or "Bench"
    slot: { type: String, required: true },
    // Exact points the hero earned that NFL week (before any auto-swap multiplier)
    points: { type: Number, required: true },
    resting: { type: Boolean, required: true },
    // Set when this bench hero was auto-swapped into a slot for a resting starter
    swappedInto: { type: String, default: null },
    // Damage that counted toward the party: class damage (× swap penalty for swapped-in heroes,
    // × Champion multiplier for the Champion), 0 on the bench. Crossover: Quest damage, 0 outside the Quest party.
    counted: { type: Number, required: true },
    // Crossover only: the hero fought the encounter in the Quest party
    quest: { type: Boolean, default: false }
  },
  { _id: false }
)

const boardSchema = new Schema(
  { total: { type: Number, required: true }, top: { type: Number, required: true }, bench: { type: Number, required: true } },
  { _id: false }
)

const sideSchema = new Schema(
  {
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true },
    total: { type: Number, required: true },
    top: { type: Number, required: true },
    bench: { type: Number, required: true },
    // The Champion named for this week, if any (it may have been resting)
    champion: { type: Schema.Types.ObjectId, ref: 'Hero', default: null },
    // Synergies that took effect; total already includes them
    synergies: { type: [{ type: String, enum: SYNERGIES }], default: [] },
    heroes: { type: [heroResultSchema], required: true },
    // Crossover only: the Gridiron board, plain fantasy points (total, then top starter and bench as tiebreakers).
    // `total` above is then the Quest board.
    gridiron: { type: boardSchema, default: null }
  },
  { _id: false }
)

const matchupResultSchema = new Schema(
  {
    home: { type: sideSchema, required: true },
    // Absent when the home party fought the monster
    away: { type: sideSchema, default: null },
    monster: {
      type: new Schema(
        // gridiron: Crossover only, the monster's Gridiron score
        { name: { type: String, required: true }, total: { type: Number, required: true }, gridiron: { type: Number, default: null } },
        { _id: false }
      ),
      default: null
    },
    // "away" means the monster when there is no away party. In Crossover, this is the Quest board.
    outcome: { type: String, required: true, enum: ['home', 'away', 'draw'] },
    // Crossover only: the Gridiron board's outcome
    gridironOutcome: { type: String, enum: ['home', 'away', 'draw'], default: null },
    // Playoff weeks: a bracket game, or a consolation battle; only regular-season battles count in the standings
    kind: { type: String, enum: ['regular', 'playoff', 'consolation'], default: 'regular' }
  },
  { _id: false }
)

const weekResultSchema = new Schema(
  {
    leagueId: { type: Schema.Types.ObjectId, ref: 'League', required: true, immutable: true },
    week: { type: Number, required: true, immutable: true },
    // Co-op has no matchups: this is empty, and `sides` holds every party's week instead.
    matchups: { type: [matchupResultSchema], required: true },
    // Co-op only: each party's damage against the chapter's monster
    sides: { type: [sideSchema], default: undefined },
    // Co-op only: the campaign this week (playCampaignWeek in campaign.ts)
    campaign: {
      type: new Schema(
        {
          chapter: { type: Number, required: true },
          monster: { type: String, required: true },
          hpBefore: { type: Number, required: true },
          dealt: { type: Number, required: true },
          fallen: { type: [Number], default: [] },
          failed: { type: Number, default: null },
          failedHpLeft: { type: Number, default: null },
          // The campaign after the week
          state: {
            type: new Schema(
              {
                chapter: { type: Number, required: true },
                hpLeft: { type: Number, required: true },
                livesLeft: { type: Number, required: true },
                outcome: { type: String, required: true, enum: ['ongoing', 'won', 'lost'] }
              },
              { _id: false }
            ),
            required: true
          }
        },
        { _id: false }
      ),
      default: null
    },
    // Crossover only: the week's encounter
    encounter: {
      type: new Schema(
        { name: { type: String, required: true }, weak: { type: [String], required: true }, resists: { type: String, required: true } },
        { _id: false }
      ),
      default: null
    }
  },
  { timestamps: true }
)
weekResultSchema.index({ leagueId: 1, week: 1 }, { unique: true })

export type WeekResult = InferSchemaType<typeof weekResultSchema>
export type WeekResultDocument = HydratedDocument<WeekResult>

export const WeekResultModel = model('WeekResult', weekResultSchema)
