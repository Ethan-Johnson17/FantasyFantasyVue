import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const UnitSchema = new Schema({
  accountId: { type: ObjectId, ref: 'Account', required: true },
  faceoffId: { type: ObjectId, ref: 'Faceoff', required: true },
  leagueId: { type: ObjectId, ref: 'league', required: true },
  teamId: { type: ObjectId, ref: 'team', required: true },
  partyId: { type: ObjectId, ref: 'team', required: true },
  score: { type: Number, default: 0 },
  activeHeroes: { type: Array,  }

})

UnitSchema.virtual('account', {
  localField: 'accountId',
  foreignField: '_id',
  justOne: true,
  ref: 'Account'
})
UnitSchema.virtual('league', {
  localField: 'leagueId',
  foreignField: '_id',
  justOne: true,
  ref: 'League'
})
UnitSchema.virtual('faceoff', {
  localField: 'faceoffId',
  foreignField: '_id',
  justOne: true,
  ref: 'Faceoff'
})
UnitSchema.virtual('team', {
  localField: 'teamId',
  foreignField: '_id',
  justOne: true,
  ref: 'Team'
})
UnitSchema.virtual('party', {
  localField: 'partyId',
  foreignField: '_id',
  justOne: true,
  ref: 'Party'
})