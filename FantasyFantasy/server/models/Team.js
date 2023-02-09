import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const TeamSchema = new Schema({
    teamName: { type: String, required: true },
    teamLogo: { type: String, required: true },
    primaryColor: { type: String, required: true },
    secondaryColor: { type: String, required: true },
    players: { type: Array },
    stats: { type: Object },
    salary: { type: Number, default: 50000},
    accountId: { type: ObjectId, ref: 'Account', required: true },
    partyId: { type: ObjectId, ref: 'Party' },
    leagueId: { type: ObjectId, ref: 'League'}
  },
  { timestamps: true, toJSON: { virtuals: true } }
)

TeamSchema.virtual('account', {
  localField: 'accountId',
  foreignField: '_id',
  justOne: true,
  ref: 'Account'
})

TeamSchema.virtual('party', {
  localField: 'partyId',
  foreignField: '_id',
  justOne: true,
  ref: 'Party'
})

TeamSchema.virtual('league', {
  localField: 'leagueId',
  foreignField: '_id',
  justOne: true,
  ref: 'League'
})
