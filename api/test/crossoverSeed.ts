import { currentNflSeason } from '../src/modules/stats/seasons.js'
import { DefenseWeekStatModel, NflGameModel, NflPlayerModel, PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'

/* Synthetic data for the season being played now, for Crossover tests. */

export const SEASON = currentNflSeason()
const DAY = 24 * 60 * 60 * 1000
export const TEAMS = ['KC', 'BUF', 'PHI', 'SF', 'DET', 'BAL', 'GB', 'DAL'] as const
const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
export const PER_POSITION = 30
/** NFL weeks played so far this season */
export const WEEKS_PLAYED = 7

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
const zeroDefense = { sacks: 0, interceptions: 0, fumbleRecoveries: 0, touchdowns: 0, safeties: 0, blockedKicks: 0, pointsAllowed: 24 }

/** Special players, by id */
export const IDS = {
  /** One game this season, a strong last season: ranked by last season */
  returningStar: 'RB-returning-star',
  /** A rookie with three games: ranked by this season, no traits */
  rookie: 'WR-rookie',
  /** Traded after week 3: shows their new team */
  traded: 'TE-traded',
  /** Weak last season, great this season: ranked by this season */
  breakout: 'WR-breakout',
  /** One big game this season and almost no history: stays low */
  fluke: 'TE-fluke'
}

function weeks(playerId: string, position: string, season: number, count: number, rushingYards: (week: number) => number, team = 'KC') {
  return Array.from({ length: count }, (_, i) => ({
    playerId,
    season,
    seasonType: 'REG',
    week: i + 1,
    gameId: `${String(season)}_${String(i + 1)}_${playerId}`,
    team,
    opponent: 'BUF',
    position,
    stats: { ...zeroOffense, rushingYards: rushingYards(i + 1) }
  }))
}

/**
 * Players at each position whose points per game fall with their index, team defenses, the special players
 * above, and an 18-week schedule: `nextWeek` is the first week whose games haven't kicked off yet.
 */
export async function seedCrossover({ nextWeek = WEEKS_PLAYED + 1 }: { nextWeek?: number } = {}): Promise<void> {
  const players: object[] = []
  const lines: object[] = []
  for (const position of POSITIONS) {
    for (let i = 0; i < PER_POSITION; i++) {
      const id = `${position}-${String(i)}`
      players.push({ _id: id, name: `${position} Player ${String(i)}`, position })
      lines.push(...weeks(id, position, SEASON, WEEKS_PLAYED, () => 300 - i * 8, TEAMS[i % TEAMS.length]))
      // Last season: alternating steady and swingy weeks so traits split them
      lines.push(...weeks(id, position, SEASON - 1, 10, week => (i % 2 === 0 ? 200 : week % 2 === 0 ? 400 : 0)))
    }
  }
  players.push(
    { _id: IDS.returningStar, name: 'Returning Star', position: 'RB' },
    { _id: IDS.rookie, name: 'Rookie Receiver', position: 'WR', draft: { season: SEASON, round: 1, pick: 3 } },
    { _id: IDS.traded, name: 'Traded End', position: 'TE' },
    { _id: IDS.breakout, name: 'Breakout Receiver', position: 'WR' },
    { _id: IDS.fluke, name: 'One Game Wonder', position: 'TE' }
  )
  lines.push(...weeks(IDS.fluke, 'TE', SEASON, 1, () => 350))
  lines.push(...weeks(IDS.fluke, 'TE', SEASON - 1, 2, () => 0))
  lines.push(...weeks(IDS.breakout, 'WR', SEASON, WEEKS_PLAYED, () => 400))
  lines.push(...weeks(IDS.breakout, 'WR', SEASON - 1, 10, () => 50))
  // One quiet game this season after missing time, but a huge last season
  lines.push(...weeks(IDS.returningStar, 'RB', SEASON, 1, () => 20))
  lines.push(...weeks(IDS.returningStar, 'RB', SEASON - 1, 12, () => 500))
  lines.push(...weeks(IDS.rookie, 'WR', SEASON, 3, () => 250))
  lines.push(...weeks(IDS.traded, 'TE', SEASON - 1, 10, () => 300))
  lines.push(
    ...weeks(IDS.traded, 'TE', SEASON, WEEKS_PLAYED, () => 280).map(line => (line.week > 3 ? { ...line, team: 'DET' } : { ...line, team: 'BAL' }))
  )
  await NflPlayerModel.insertMany(players)
  await PlayerWeekStatModel.insertMany(lines)

  const defenses: object[] = []
  for (const [i, team] of TEAMS.entries()) {
    for (const season of [SEASON - 1, SEASON]) {
      for (let week = 1; week <= (season === SEASON ? WEEKS_PLAYED : 10); week++) {
        defenses.push({
          team,
          season,
          seasonType: 'REG',
          week,
          gameId: `${String(season)}_${String(week)}_${team}`,
          opponent: 'BUF',
          stats: { ...zeroDefense, sacks: 8 - i }
        })
      }
    }
  }
  await DefenseWeekStatModel.insertMany(defenses)

  // Week w's first game kicks off (w - nextWeek) weeks from two days from now.
  const start = Date.now() + 2 * DAY
  const games = Array.from({ length: 18 }, (_, i) => i + 1).flatMap(week =>
    [0, 1].map(game => ({
      _id: `${String(SEASON)}_${String(week).padStart(2, '0')}_G${String(game)}`,
      season: SEASON,
      seasonType: 'REG',
      week,
      kickoff: new Date(start + (week - nextWeek) * 7 * DAY + game * 3 * 60 * 60 * 1000),
      homeTeam: TEAMS[game * 2] ?? 'KC',
      awayTeam: TEAMS[game * 2 + 1] ?? 'BUF',
      homeScore: week < nextWeek ? 24 : null,
      awayScore: week < nextWeek ? 17 : null
    }))
  )
  await NflGameModel.insertMany(games)
}
