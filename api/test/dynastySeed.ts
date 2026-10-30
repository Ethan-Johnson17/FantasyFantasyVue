import { DefenseWeekStatModel, NflPlayerModel, PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'

/*
 * Synthetic stats for consecutive seasons, for Dynasty tests. Only 2020 has the previous season (2019) and two more
 * after it, so a 3-season dynasty always starts in 2020 and plays 2020, 2021, 2022.
 */

export const FIRST_SEASON = 2020
const SEASONS = [2019, 2020, 2021, 2022]
const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
const PER_POSITION = 30
const DEFENSES = 16

/** Players who stop after 2020: kept heroes who've retired */
export const RETIRES_AFTER_2020 = (index: number) => index % 10 === 9

const zero = {
  passingYards: 0,
  passingTds: 0,
  interceptions: 0,
  rushingYards: 0,
  rushingTds: 0,
  receptions: 0,
  receivingYards: 0,
  receivingTds: 0,
  twoPointConversions: 0,
  fumblesLost: 0,
  specialTeamsTds: 0,
  fumbleRecoveryTds: 0
}

export async function seedDynasty(): Promise<void> {
  const players: object[] = []
  const lines: object[] = []
  for (const position of POSITIONS) {
    for (let i = 0; i < PER_POSITION; i++) {
      const id = `${position}-${String(i)}`
      players.push({ _id: id, name: `Real ${id}`, position })
      for (const season of SEASONS) {
        if (season > 2020 && RETIRES_AFTER_2020(i)) continue
        // Each season reshuffles who's good, so Levels move between seasons.
        const yards = 50 + ((i * 7 + season * 13) % 30) * 6
        for (let week = 1; week <= 14; week++) {
          lines.push({
            playerId: id,
            season,
            seasonType: 'REG',
            week,
            gameId: `${String(season)}_${String(week)}_${id}`,
            team: 'AAA',
            opponent: 'BBB',
            position,
            stats: { ...zero, rushingYards: yards + ((week * (i + 3)) % 40) }
          })
        }
      }
    }
  }
  await NflPlayerModel.insertMany(players)
  await PlayerWeekStatModel.insertMany(lines)

  const defenses: object[] = []
  for (let t = 0; t < DEFENSES; t++) {
    for (const season of SEASONS) {
      for (let week = 1; week <= 14; week++) {
        defenses.push({
          team: `T${String(t)}`,
          season,
          seasonType: 'REG',
          week,
          gameId: `${String(season)}_${String(week)}_T${String(t)}`,
          opponent: 'BBB',
          stats: { sacks: (t + week + season) % 6, interceptions: 1, fumbleRecoveries: 0, touchdowns: 0, safeties: 0, blockedKicks: 0, pointsAllowed: 17 }
        })
      }
    }
  }
  await DefenseWeekStatModel.insertMany(defenses)
}
