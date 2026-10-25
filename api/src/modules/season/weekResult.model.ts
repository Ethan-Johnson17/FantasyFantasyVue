import { model, Schema, type InferSchemaType } from 'mongoose'
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
    gridironOutcome: { type: String, enum: ['home', 'away', 'draw'], default: null }
  },
  { _id: false }
)

const weekResultSchema = new Schema(
  {
    leagueId: { type: Schema.Types.ObjectId, ref: 'League', required: true, immutable: true },
    week: { type: Number, required: true, immutable: true },
    matchups: { type: [matchupResultSchema], required: true },
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

export const WeekResultModel = model('WeekResult', weekResultSchema)
