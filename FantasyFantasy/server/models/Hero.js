import mongoose from 'mongoose'
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId

export const HeroSchema = new Schema({
    heroName: { type: String, required: true },
    heroClass: { type: String, required: true },
    heroRace: { type: String, required: true },
    weapon: { type: String, require: true, enum: ['Sword and Shield', 'Spear', 'Bow', 'Dagger', 'Staff'] },
    attack: { type: Number, required: true },
    defense: { type: Number, required: true },
    magic: { type: Number, required: true },
    armorRating: { type: Number },
    items: { type: Array },
    lifeStatus: { type: String, default: 'active' },
    skills: { type: Array },
    gender: { type: String },
    questId: { type: ObjectId, ref: 'Quest' },
    accountId: { type: ObjectId, ref: 'Account', required: true },
    partyId: { type: ObjectId, ref: 'Party' },
    leagueId: { type: ObjectId, ref: 'League' },
    playerId: { type: ObjectId, ref: 'Player' },
    FDPPlayerId: { type: ObjectId, ref: 'FDPPlayer' },
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

HeroSchema.virtual('player', {
  localField: 'playerId',
  foreignField: '_id',
  justOne: true,
  ref: 'Player'
})

HeroSchema.virtual('FDPPlayer', {
  localField: 'FDPPlayerId',
  foreignField: '_id',
  justOne: true,
  ref: 'FDPPlayer'
})

HeroSchema.virtual('league', {
  localField: 'leagueId',
  foreignField: '_id',
  justOne: true,
  ref: 'League'
})
