import { beforeAll, describe, expect, it } from 'vitest'
import { RULESET_V1 } from '../src/modules/scoring/rulesets.js'
import { scoreDefense, scoreOffense } from '../src/modules/scoring/scoring.js'
import {
  toDefenseWeekDocs,
  toGameScores,
  toFranchiseCode,
  toPlayerWeekDocs,
  type CsvRow,
  type DefenseWeekDoc,
  type GameScore
} from '../src/modules/stats/nflverse.js'
import { parseSeasonRange } from '../src/modules/stats/seasons.js'
import { readFixture } from './fixtures.js'

let playerRows: CsvRow[]
let teamRows: CsvRow[]
let games: Map<string, GameScore>

beforeAll(async () => {
  playerRows = await readFixture('stats_player_week_2023.csv')
  teamRows = await readFixture('stats_team_week_2023.csv')
  games = toGameScores(await readFixture('games.csv'))
})

describe('toPlayerWeekDocs', () => {
  it('keeps only regular-season QB / RB / WR / TE rows', () => {
    const names = toPlayerWeekDocs(playerRows).map(doc => doc.playerName)
    expect(names).toEqual([
      'Christian McCaffrey',
      'Jimmy Garoppolo',
      'Kyren Williams',
      'Kirk Cousins',
      'Xavier Gipson',
      'T.J. Hockenson',
      'Terry McLaurin'
    ])
    // Excluded: T.J. Watt (OLB), Joe Flacco (postseason), Matt Prater (K)
  })

  it('scores every row the same as nflverse half-PPR: (standard + PPR) / 2', () => {
    const docs = toPlayerWeekDocs(playerRows)
    for (const doc of docs) {
      const source = playerRows.find(row => row.player_id === doc.playerId && Number(row.week) === doc.week)
      const halfPpr = (Number(source?.fantasy_points) + Number(source?.fantasy_points_ppr)) / 2
      expect(scoreOffense(doc.stats, RULESET_V1), doc.playerName).toBeCloseTo(halfPpr, 6)
    }
  })

  it('combines 2-pt conversions and lost fumbles across play types', () => {
    const kyren = toPlayerWeekDocs(playerRows).find(doc => doc.playerName === 'Kyren Williams')
    expect(kyren?.stats.twoPointConversions).toBeGreaterThanOrEqual(1)
    expect(kyren?.stats.fumblesLost).toBeGreaterThanOrEqual(1)
    const cousins = toPlayerWeekDocs(playerRows).find(doc => doc.playerName === 'Kirk Cousins')
    expect(cousins?.stats.fumblesLost).toBeGreaterThanOrEqual(1)
  })

  it('reports the offending row when data is malformed', () => {
    const broken = [...playerRows]
    broken[2] = { ...broken[2], game_id: '' }
    expect(() => toPlayerWeekDocs(broken)).toThrow(/player stats row 3: game_id/)
  })

  it('skips team-level rows that have no player (penalties, uncredited safeties)', () => {
    const teamLevel = { ...playerRows[0], player_id: '', player_display_name: '', position: '', def_safeties: '1' }
    expect(toPlayerWeekDocs([teamLevel, ...playerRows])).toHaveLength(7)
    expect(toPlayerWeekDocs([{ ...teamLevel, player_id: 'NA' }])).toEqual([])
  })

  it('rejects non-numeric stats instead of silently scoring them', () => {
    const broken = [{ ...playerRows[0], rushing_yards: 'lots' }]
    expect(() => toPlayerWeekDocs(broken)).toThrow(/rushing_yards/)
  })
})

describe('toGameScores', () => {
  it('skips games that have not been played', () => {
    expect(games.has('2026_05_BAL_ATL')).toBe(false)
    expect(games.get('2023_01_SF_PIT')).toEqual({ homeTeam: 'PIT', awayTeam: 'SF', homeScore: 7, awayScore: 30 })
  })
})

describe('relocated franchises', () => {
  it('matches current team codes in stats files to historical codes in the schedule', () => {
    const scheduleRow = { game_id: '2011_01_PHI_STL', home_team: 'STL', away_team: 'PHI', home_score: '13', away_score: '31' }
    const statsRow = { ...teamRows[0], team: 'LA', opponent_team: 'PHI', game_id: '2011_01_PHI_STL', season: '2011', week: '1' }
    const [doc] = toDefenseWeekDocs([statsRow], [], toGameScores([scheduleRow]))
    expect(doc?.team).toBe('LA')
    expect(doc?.stats.pointsAllowed).toBe(31)
  })

  it.each([
    ['STL', 'LA'],
    ['SD', 'LAC'],
    ['OAK', 'LV'],
    ['KC', 'KC']
  ])('maps %s to %s', (historical, current) => {
    expect(toFranchiseCode(historical)).toBe(current)
  })
})

describe('toDefenseWeekDocs', () => {
  let docs: DefenseWeekDoc[]
  const find = (team: string, week: number) => docs.find(doc => doc.team === team && doc.week === week)

  beforeAll(() => {
    docs = toDefenseWeekDocs(teamRows, playerRows, games)
  })

  it('counts pick-sixes and defensive fumble-return TDs (PIT week 2)', () => {
    const pit = find('PIT', 2)
    expect(pit?.stats).toEqual({
      sacks: 6,
      interceptions: 1,
      fumbleRecoveries: 3,
      touchdowns: 2,
      safeties: 0,
      blockedKicks: 0,
      pointsAllowed: 22
    })
    // 6 sacks + 2 (INT) + 6 (3 FR) + 12 (2 TD) + 0 (22 allowed)
    expect(pit && scoreDefense(pit.stats, RULESET_V1)).toBe(26)
  })

  it("does not credit the defense with an offense's own end-zone fumble recovery (WAS week 4)", () => {
    expect(find('WAS', 4)?.stats.touchdowns).toBe(0)
  })

  it('credits return TDs to the defense / special teams unit (NYJ week 1)', () => {
    const nyj = find('NYJ', 1)
    expect(nyj?.stats.touchdowns).toBe(1)
    // 5 sacks + 6 (3 INT) + 2 (FR) + 6 (punt return TD) + 1 (16 allowed)
    expect(nyj && scoreDefense(nyj.stats, RULESET_V1)).toBe(20)
  })

  it('uses the opponent score as points allowed, home or away', () => {
    expect(find('PIT', 1)?.stats.pointsAllowed).toBe(30)
    expect(find('SF', 1)?.stats.pointsAllowed).toBe(7)
  })

  it('fails loudly when a final score is missing', () => {
    expect(() => toDefenseWeekDocs(teamRows, playerRows, new Map())).toThrow(/no final score/)
  })
})

describe('parseSeasonRange', () => {
  it('parses single seasons and ranges', () => {
    expect(parseSeasonRange('2023', 2026)).toEqual([2023])
    expect(parseSeasonRange('2011-2014', 2026)).toEqual([2011, 2012, 2013, 2014])
  })

  it.each(['23', '2014-2011', '1998', '2027', '2011-2030', 'abc'])('rejects %s', input => {
    expect(() => parseSeasonRange(input, 2026)).toThrow()
  })
})
