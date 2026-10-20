import { DefenseWeekStatModel, NflPlayerModel, PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'

/** The only hidden season the seeded data makes eligible (2019 provides the "previous season"). */
export const SEEDED_SEASON = 2020

const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
const VETERANS_PER_POSITION = 30
const ROOKIES_PER_POSITION = 5
const DEFENSES = 16

/** Ids of players who must never appear in a pool. */
export const EXCLUDED_IDS = {
  tooFewGamesLastSeason: 'QB-few-games',
  didNotPlayThisSeason: 'QB-retired',
  undraftedNoHistory: 'WR-undrafted-unknown'
}

const zeroOffense = {
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

function playerWeeks(playerId: string, position: string, season: number, weeks: number, rushingYards: number) {
  return Array.from({ length: weeks }, (_, i) => ({
    playerId,
    season,
    seasonType: 'REG',
    week: i + 1,
    gameId: `${String(season)}_${String(i + 1)}_${playerId}`,
    team: 'AAA',
    opponent: 'BBB',
    position,
    stats: { ...zeroOffense, rushingYards }
  }))
}

/**
 * Two seasons of synthetic stats: veterans whose points per game fall with their index,
 * 2020 rookies with draft slots, team defenses, and a few players who must be excluded.
 * `depth` adds that many lower-scoring veteran running backs and receivers, for big-league pools.
 */
export async function seedStats({ depth = 0 }: { depth?: number } = {}): Promise<void> {
  const players: object[] = []
  const weeks: object[] = []
  for (const position of ['RB', 'WR'] as const) {
    for (let i = 0; i < depth; i++) {
      const id = `${position}-depth-${String(i)}`
      players.push({ _id: id, name: `Real ${id}`, position })
      weeks.push(...playerWeeks(id, position, SEEDED_SEASON - 1, 10, 40 - (i % 30)))
      weeks.push(...playerWeeks(id, position, SEEDED_SEASON, 14, 60))
    }
  }
  for (const position of POSITIONS) {
    for (let i = 0; i < VETERANS_PER_POSITION; i++) {
      const id = `${position}-${String(i)}`
      players.push({ _id: id, name: `Real ${id}`, position })
      weeks.push(...playerWeeks(id, position, SEEDED_SEASON - 1, 10, 200 - i * 5))
      weeks.push(...playerWeeks(id, position, SEEDED_SEASON, 14, 100))
    }
    for (let i = 0; i < ROOKIES_PER_POSITION; i++) {
      const id = `${position}-rookie-${String(i)}`
      players.push({ _id: id, name: `Real ${id}`, position, draft: { season: SEEDED_SEASON, round: i + 1, pick: 5 + i * 32 } })
      weeks.push(...playerWeeks(id, position, SEEDED_SEASON, 14, 100))
    }
  }
  players.push(
    { _id: EXCLUDED_IDS.tooFewGamesLastSeason, name: 'Real few', position: 'QB' },
    { _id: EXCLUDED_IDS.didNotPlayThisSeason, name: 'Real retired', position: 'QB' },
    { _id: EXCLUDED_IDS.undraftedNoHistory, name: 'Real unknown', position: 'WR' }
  )
  // Elite last season, but only 3 games
  weeks.push(...playerWeeks(EXCLUDED_IDS.tooFewGamesLastSeason, 'QB', SEEDED_SEASON - 1, 3, 500))
  weeks.push(...playerWeeks(EXCLUDED_IDS.tooFewGamesLastSeason, 'QB', SEEDED_SEASON, 14, 100))
  // Elite last season, no games this season
  weeks.push(...playerWeeks(EXCLUDED_IDS.didNotPlayThisSeason, 'QB', SEEDED_SEASON - 1, 16, 500))
  weeks.push(...playerWeeks(EXCLUDED_IDS.undraftedNoHistory, 'WR', SEEDED_SEASON, 14, 100))

  const defenses = Array.from({ length: DEFENSES }, (_, t) =>
    [SEEDED_SEASON - 1, SEEDED_SEASON].flatMap(season =>
      Array.from({ length: 14 }, (_, w) => ({
        team: `T${String(t)}`,
        season,
        seasonType: 'REG',
        week: w + 1,
        gameId: `${String(season)}_${String(w + 1)}_T${String(t)}`,
        opponent: 'OPP',
        stats: { sacks: 16 - t, interceptions: 0, fumbleRecoveries: 0, touchdowns: 0, safeties: 0, blockedKicks: 0, pointsAllowed: 21 }
      }))
    )
  ).flat()

  await NflPlayerModel.insertMany(players)
  await PlayerWeekStatModel.insertMany(weeks)
  await DefenseWeekStatModel.insertMany(defenses)
}
