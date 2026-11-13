import { model, Schema, type InferSchemaType } from 'mongoose'

/*
 * A record of every roster change after the draft, shown to the league as recent moves.
 * Free-agent claims, and Solo's swaps (docs/SOLO_SPEC.md, "Lineup, swaps and locks"). Accepted trades are their own
 * records (modules/trades/trade.model.ts) and join these in the league's recent moves.
 */

export const ROSTER_MOVE_KINDS = ['claim', 'swap'] as const

const rosterMoveSchema = new Schema(
  {
    leagueId: { type: Schema.Types.ObjectId, ref: 'League', required: true, immutable: true },
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true, immutable: true },
    kind: { type: String, required: true, enum: ROSTER_MOVE_KINDS, immutable: true },
    added: { type: Schema.Types.ObjectId, ref: 'Hero', required: true, immutable: true },
    // null: a claim into an open roster spot, left by an uneven trade
    dropped: { type: Schema.Types.ObjectId, ref: 'Hero', default: null, immutable: true },
    // The first game week the change counts for
    effectiveWeek: { type: Number, required: true, immutable: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)
rosterMoveSchema.index({ leagueId: 1, createdAt: -1 })
// Solo: a run's swaps in a game week
rosterMoveSchema.index({ leagueId: 1, effectiveWeek: 1 })

export type RosterMove = InferSchemaType<typeof rosterMoveSchema>

export const RosterMoveModel = model('RosterMove', rosterMoveSchema)
