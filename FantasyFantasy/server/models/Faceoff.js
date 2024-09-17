import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const FaceoffSchema = new Schema({
    weekNumber: { type: Number, required: true },
    date: { type: String, required: true },
    leagueId: { type: ObjectId, ref: 'League' },
    unitAId: { type: ObjectId, ref: 'Unit' },
    unitBId: { type: ObjectId, ref: 'Unit' },
    score: { type: Object},
    victor: { type: String },
  },
  { timestamps: true, toJSON: { virtuals: true } }

)

FaceoffSchema.virtual('league', {
  localField: 'leagueId',
  foreignField: '_id',
  justOne: true,
  ref: 'League'
})

FaceoffSchema.virtual('unitAId', {
  localField: 'unitAId',
  foreignField: '_id',
  justOne: true,
  ref: 'Unit'
})

FaceoffSchema.virtual('unitBId', {
  localField: 'unitBId',
  foreignField: '_id',
  justOne: true,
  ref: 'Unit'
})