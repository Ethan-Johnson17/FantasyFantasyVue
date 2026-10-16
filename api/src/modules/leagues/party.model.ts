import { model, Schema, type HydratedDocument, type InferSchemaType, type Types } from 'mongoose'
import type { Lineup } from '../heroes/lineup.js'
import { CREST_BANNERS, CREST_EMBLEMS } from './crests.js'

export const PARTY_NAME_MAX = 30

const partySchema = new Schema(
  {
    leagueId: { type: Schema.Types.ObjectId, ref: 'League', required: true, immutable: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: PARTY_NAME_MAX },
    crest: {
      type: new Schema(
        {
          emblem: { type: String, required: true, enum: CREST_EMBLEMS },
          banner: { type: String, required: true, enum: CREST_BANNERS }
        },
        { _id: false }
      ),
      required: true
    },
    // Swap resting starters for bench heroes (at a points penalty) when a week resolves
    autoSwap: { type: Boolean, required: true, default: true },
    // Starting lineup: one entry per slot of the league's ruleset; auto-filled after the draft
    lineup: {
      type: [
        new Schema(
          {
            slot: { type: String, required: true },
            heroId: { type: Schema.Types.ObjectId, ref: 'Hero', required: true }
          },
          { _id: false }
        )
      ],
      default: undefined
    },
    // The weekly Champion. Counts only in the named week; no Champion that week otherwise.
    champion: {
      type: new Schema(
        {
          heroId: { type: Schema.Types.ObjectId, ref: 'Hero', required: true },
          week: { type: Number, required: true }
        },
        { _id: false }
      ),
      default: null
    }
  },
  { timestamps: true }
)
// One party per user per league.
partySchema.index({ leagueId: 1, accountId: 1 }, { unique: true })
// Party names are unique within a league, ignoring case.
partySchema.index({ leagueId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } })
partySchema.index({ accountId: 1 })

export type Party = InferSchemaType<typeof partySchema>
export type PartyDocument = HydratedDocument<Party>

export const PartyModel = model('Party', partySchema)

/** Stored lineup entries as a slot-to-hero map, or null before the draft. */
export function readLineup(stored: readonly { slot: string; heroId: Types.ObjectId }[] | null | undefined): Lineup | null {
  if (!stored?.length) return null
  return Object.fromEntries(stored.map(entry => [entry.slot, entry.heroId.toString()]))
}

export function storedLineup(lineup: Lineup): { slot: string; heroId: string }[] {
  return Object.entries(lineup).map(([slot, heroId]) => ({ slot, heroId }))
}
