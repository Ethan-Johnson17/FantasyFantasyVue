import { model, Schema, type InferSchemaType } from 'mongoose'

/*
 * Server-only collections holding imported NFL data (source: nflverse, CC-BY-4.0).
 * Hidden-player rule: nothing here may be sent to clients while a league is active.
 */

export const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
export type FantasyPosition = (typeof FANTASY_POSITIONS)[number]

export const SEASON_TYPES = ['REG', 'POST'] as const

const count = { type: Number, required: true, default: 0 }

const offenseStatsSchema = new Schema(
  {
    passingYards: count,
    passingTds: count,
    interceptions: count,
    rushingYards: count,
    rushingTds: count,
    receptions: count,
    receivingYards: count,
    receivingTds: count,
    twoPointConversions: count,
    fumblesLost: count,
    specialTeamsTds: count,
    fumbleRecoveryTds: count
  },
  { _id: false }
)

const defenseStatsSchema = new Schema(
  {
    sacks: count,
    interceptions: count,
    fumbleRecoveries: count,
    touchdowns: count,
    safeties: count,
    blockedKicks: count,
    pointsAllowed: count
  },
  { _id: false }
)

const nflPlayerSchema = new Schema(
  {
    // nflverse / NFL GSIS player id, e.g. "00-0033280"
    _id: { type: String, required: true },
    name: { type: String, required: true },
    // Position from the most recently imported season
    position: { type: String, required: true, enum: FANTASY_POSITIONS },
    // NFL draft slot; absent for undrafted players
    draft: {
      type: new Schema(
        { season: { type: Number, required: true }, round: { type: Number, required: true }, pick: { type: Number, required: true } },
        { _id: false }
      ),
      required: false
    }
  },
  { timestamps: true }
)

const playerWeekStatSchema = new Schema({
  playerId: { type: String, required: true, ref: 'NflPlayer' },
  season: { type: Number, required: true },
  seasonType: { type: String, required: true, enum: SEASON_TYPES },
  week: { type: Number, required: true },
  gameId: { type: String, required: true },
  team: { type: String, required: true },
  opponent: { type: String, required: true },
  position: { type: String, required: true, enum: FANTASY_POSITIONS },
  stats: { type: offenseStatsSchema, required: true }
})
playerWeekStatSchema.index({ playerId: 1, season: 1, seasonType: 1, week: 1 }, { unique: true })
playerWeekStatSchema.index({ season: 1, seasonType: 1, week: 1, position: 1 })

const defenseWeekStatSchema = new Schema({
  team: { type: String, required: true },
  season: { type: Number, required: true },
  seasonType: { type: String, required: true, enum: SEASON_TYPES },
  week: { type: Number, required: true },
  gameId: { type: String, required: true },
  opponent: { type: String, required: true },
  stats: { type: defenseStatsSchema, required: true }
})
defenseWeekStatSchema.index({ team: 1, season: 1, seasonType: 1, week: 1 }, { unique: true })

export type NflPlayer = InferSchemaType<typeof nflPlayerSchema>
export type PlayerWeekStat = InferSchemaType<typeof playerWeekStatSchema>
export type DefenseWeekStat = InferSchemaType<typeof defenseWeekStatSchema>

export const NflPlayerModel = model('NflPlayer', nflPlayerSchema)
export const PlayerWeekStatModel = model('PlayerWeekStat', playerWeekStatSchema)
export const DefenseWeekStatModel = model('DefenseWeekStat', defenseWeekStatSchema)
