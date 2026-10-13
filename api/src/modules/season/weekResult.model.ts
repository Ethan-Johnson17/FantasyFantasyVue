import { model, Schema, type InferSchemaType } from 'mongoose'

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
    // Points that counted toward the party: points × multiplier for swapped-in heroes, 0 on the bench
    counted: { type: Number, required: true }
  },
  { _id: false }
)

const sideSchema = new Schema(
  {
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true },
    total: { type: Number, required: true },
    top: { type: Number, required: true },
    bench: { type: Number, required: true },
    heroes: { type: [heroResultSchema], required: true }
  },
  { _id: false }
)

const matchupResultSchema = new Schema(
  {
    home: { type: sideSchema, required: true },
    // Absent when the home party fought the monster
    away: { type: sideSchema, default: null },
    monster: {
      type: new Schema({ name: { type: String, required: true }, total: { type: Number, required: true } }, { _id: false }),
      default: null
    },
    // "away" means the monster when there is no away party
    outcome: { type: String, required: true, enum: ['home', 'away', 'draw'] }
  },
  { _id: false }
)

const weekResultSchema = new Schema(
  {
    leagueId: { type: Schema.Types.ObjectId, ref: 'League', required: true, immutable: true },
    week: { type: Number, required: true, immutable: true },
    matchups: { type: [matchupResultSchema], required: true }
  },
  { timestamps: true }
)
weekResultSchema.index({ leagueId: 1, week: 1 }, { unique: true })

export type WeekResult = InferSchemaType<typeof weekResultSchema>

export const WeekResultModel = model('WeekResult', weekResultSchema)
