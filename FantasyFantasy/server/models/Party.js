import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const PartySchema = new Schema({
    partyName: { type: String, required: true },
    heroes: { type: Array },
    questId: { type: ObjectId, ref: 'Quest' },
    accountId: { type: ObjectId, ref: 'Account', required: true },
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
