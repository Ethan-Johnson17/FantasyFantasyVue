import mongoose from 'mongoose'
const Schema = mongoose.Schema

export const TeamSchema = new Schema(
  {
    teamName: { type: String, required: true },
    teamLogo: { type: String, required: true },
    players: { type: Array },
    creatorId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true }
  },
  { timestamps: true, toJSON: { virtuals: true } }
)

TeamSchema.virtual('creator', {
  localField: 'creatorId',
  foreignField: '_id',
  justOne: true,
  ref: 'Profile'
})
