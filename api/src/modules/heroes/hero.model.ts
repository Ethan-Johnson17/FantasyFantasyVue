import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { HERO_CLASSES } from './classes.js'
import { HERO_TRAITS } from './pool.js'

const heroSchema = new Schema(
  {
    leagueId: { type: Schema.Types.ObjectId, ref: 'League', required: true, immutable: true },
    // Set when drafted
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', default: null },
    heroClass: { type: String, required: true, enum: HERO_CLASSES, immutable: true },
    name: { type: String, required: true },
    race: { type: String, required: true },
    gender: { type: String, required: true, enum: ['male', 'female'] },
    weapon: { type: String, required: true },
    skill: { type: String, required: true },
    attack: { type: Number, required: true },
    defense: { type: Number, required: true },
    magic: { type: Number, required: true },
    // 1–10 for veterans; null for mystery recruits, who show levelRange instead
    level: { type: Number, default: null, min: 1, max: 10 },
    levelRange: {
      type: new Schema({ min: { type: Number, required: true }, max: { type: Number, required: true } }, { _id: false }),
      default: null
    },
    // Derived from the previous season; empty for mystery recruits
    traits: { type: [{ type: String, enum: HERO_TRAITS }], default: [] },
    // Crossover only: the real player shown with the hero. Always null in Classic, whose players stay hidden.
    player: {
      type: new Schema(
        { name: { type: String, required: true }, team: { type: String, required: true }, position: { type: String, required: true } },
        { _id: false }
      ),
      default: null
    },
    // Hidden-player rule: the real NFL player or team behind the hero. Never selected by default.
    source: {
      type: new Schema(
        { kind: { type: String, required: true, enum: ['player', 'defense'] }, id: { type: String, required: true } },
        { _id: false }
      ),
      required: true,
      select: false,
      immutable: true
    }
  },
  { timestamps: true }
)
heroSchema.index({ leagueId: 1, name: 1 }, { unique: true })
heroSchema.index({ leagueId: 1, partyId: 1 })

export type Hero = InferSchemaType<typeof heroSchema>
export type HeroDocument = HydratedDocument<Hero>

export const HeroModel = model('Hero', heroSchema)
