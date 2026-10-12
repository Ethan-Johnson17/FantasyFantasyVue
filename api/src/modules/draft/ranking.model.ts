import { model, Schema, type InferSchemaType } from 'mongoose'

/** A party's pre-draft hero ranking, best first. */
const draftRankingSchema = new Schema(
  {
    leagueId: { type: Schema.Types.ObjectId, ref: 'League', required: true, immutable: true },
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true, immutable: true },
    heroIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Hero' }], default: [] }
  },
  { timestamps: true }
)
draftRankingSchema.index({ leagueId: 1, partyId: 1 }, { unique: true })

export type DraftRanking = InferSchemaType<typeof draftRankingSchema>

export const DraftRankingModel = model('DraftRanking', draftRankingSchema)
