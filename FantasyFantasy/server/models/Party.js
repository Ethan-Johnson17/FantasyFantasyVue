import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const PartySchema = new Schema({
    partyName: { type: String, required: true },
    logoColor: { type: String, required: true },
    heroes: { type: Array },
    rank: {type: Number},
    questId: { type: ObjectId, ref: 'Quest' },
    accountId: { type: ObjectId, ref: 'Account', required: true },
    leagueId: { type: ObjectId, ref: 'League' },
    faceoffs: { type: Array },
    readyStatus: { type: Boolean, default: false },
    activeHeroes: { type: Array }
  },
  { timestamps: true, toJSON: { virtuals: true } }
)

PartySchema.virtual('account', {
  localField: 'accountId',
  foreignField: '_id',
  justOne: true,
  ref: 'Account'
})

PartySchema.virtual('quest', {
  localField: 'questId',
  foreignField: '_id',
  justOne: true,
  ref: 'Quest'
})

PartySchema.virtual('league', {
  localField: 'leagueId',
  foreignField: '_id',
  justOne: true,
  ref: 'League'
})
