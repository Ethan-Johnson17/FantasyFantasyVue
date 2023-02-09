import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const LeagueSchema = new Schema({
    leagueName: { type: String, required: true },
    teams: { type: Array },
    participants: { type: Array },
    style: { type: String, enum: ['classic', 'classic-crossover', 'co-op', 'free-for-all', 'lone-wolf']},
    hostId: { type: ObjectId, ref: 'Profile', required: true },
    schedule: { type: Object },
    stats: { type: Object },
    standings: { type: Object },
    pin: { type: String, unique: true, required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
)

LeagueSchema.virtual('profile', {
  localField: 'hostId',
  foreignField: '_id',
  justOne: true,
  ref: 'Profile'
})

