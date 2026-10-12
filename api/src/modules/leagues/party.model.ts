import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'

export const PARTY_NAME_MAX = 30

const partySchema = new Schema(
  {
    leagueId: { type: Schema.Types.ObjectId, ref: 'League', required: true, immutable: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: PARTY_NAME_MAX },
    color: { type: String, required: true, match: /^#[0-9a-f]{6}$/i }
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
