import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const TeamSchema = new Schema({
    teamName: { type: String, required: true },
    teamLogo: { type: String, required: true },
    primaryColor: { type: String, required: true },
    secondaryColor: { type: String, required: true },
    rank: {type: Number },
    players: { type: Array },
    stats: { type: Object },
    salary: { type: String, default: "$50,000"},
    accountId: { type: ObjectId, ref: 'Account', required: true },
    partyId: { type: ObjectId, ref: 'Party' },
    faceoffs: { type: Array },
    readyStatus: { type: Boolean, default: false },
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
