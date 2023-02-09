import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const HeroSchema = new Schema({
    heroName: { type: String, required: true },
    heroClass: { type: String, required: true },
    heroRace: { type: String, required: true },
    weapon: { type: String, enum: ['sword', 'spear', 'bow', 'dagger'] },
    attack: { type: String },
    defense: { type: String },
    armorRating: { type: String },
    items: { type: Array },
    skills: { type: Array },
    questId: { type: ObjectId, ref: 'Quest' },
    accountId: { type: ObjectId, ref: 'Account', required: true },
    partyId: { type: ObjectId, ref: 'Party'}
  },
  { timestamps: true, toJSON: { virtuals: true } }
)

HeroSchema.virtual('account', {
  localField: 'accountId',
  foreignField: '_id',
  justOne: true,
  ref: 'Account'
})

HeroSchema.virtual('party', {
  localField: 'partyId',
  foreignField: '_id',
  justOne: true,
  ref: 'Party'
})

HeroSchema.virtual('quest', {
  localField: 'questId',
  foreignField: '_id',
  justOne: true,
  ref: 'Quest'
})
