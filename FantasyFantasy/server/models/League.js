import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const LeagueSchema = new Schema({
    leagueName: { type: String, required: true },
    teams: { type: Array },
    participants: { type: Array },
    leagueStyle: { type: String, enum: ['classic', 'crossover', 'coOp', 'freeForAll', 'loneWolf'], required: true},
    hostId: { type: ObjectId, ref: 'Account', required: true },
    schedule: { type: Object },
    stats: { type: Object },
    standings: { type: Object },
    privacyStatus: { type: String, required: true },
    pin: { type: String, unique: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
)

LeagueSchema.virtual('account', {
  localField: 'hostId',
  foreignField: '_id',
  justOne: true,
  ref: 'Account'
})

