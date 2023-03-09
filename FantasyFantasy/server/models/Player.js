import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const PlayerSchema = new Schema({
    player_name: { type: String, required: true },
    // imgUrl: { type: String, required: true },
    nflTeam: { type: String, required: true },
    position: { type: String, required: true },
    stats: { type: Object, required: true },
    seasonWeek: { type: Object, required: true },
    fantasy_points: { type: Object, required: true },
    accountId: { type: ObjectId, ref: 'Account', required: true },
    teamId: { type: ObjectId, ref: 'Team' },
    heroId: { type: ObjectId, ref: 'Hero' },
    apiPlayerId: { type: String }
  },
  { timestamps: true, toJSON: { virtuals: true } }
)

PlayerSchema.virtual('account', {
  localField: 'accountId',
  foreignField: '_id',
  justOne: true,
  ref: 'Account'
})

PlayerSchema.virtual('team', {
  localField: 'teamId',
  foreignField: '_id',
  justOne: true,
  ref: 'Team'
})

PlayerSchema.virtual('hero', {
  localField: 'heroId',
  foreignField: '_id',
  justOne: true,
  ref: 'Hero'
})