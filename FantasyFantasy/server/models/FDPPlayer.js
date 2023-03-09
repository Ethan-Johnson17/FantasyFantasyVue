import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const FDPPlayerSchema = new Schema({
    playerName: { type: String, required: true },
    position: { type: String, required: true },
    season: { type: String, required: true }
  },
  { timestamps: true, toJSON: { virtuals: true } }
)
