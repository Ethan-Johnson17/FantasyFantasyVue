import { describe, expect, it } from 'vitest'
import { loadScriptEnv } from '../src/config/env.js'
import { LAST_LEAGUE_SEASON } from '../src/modules/draft/candidates.js'
import { CsvNotFound, importSeasons, type CsvLoader } from '../src/modules/stats/importer.js'
import { easternTimeToUtc, toScheduleDocs } from '../src/modules/stats/nflverse.js'
import { currentNflSeason } from '../src/modules/stats/seasons.js'
import { DefenseWeekStatModel, NflGameModel, PlayerWeekStatModel, StatsImportModel } from '../src/modules/stats/stats.models.js'
import { fixtureLoader, readFixture } from './fixtures.js'

// The fixtures are the 2023 season; pretend it's being played to test in-progress imports.
const DURING_2023 = new Date('2023-10-15T12:00:00Z')

describe('kickoff times', () => {
  it('converts Eastern kickoffs to UTC across daylight saving time', () => {
    expect(easternTimeToUtc('2026-10-25', '13:00').toISOString()).toBe('2026-10-25T17:00:00.000Z') // EDT
    expect(easternTimeToUtc('2026-11-08', '13:00').toISOString()).toBe('2026-11-08T18:00:00.000Z') // EST
    expect(easternTimeToUtc('2026-11-01', '13:00').toISOString()).toBe('2026-11-01T18:00:00.000Z') // the day clocks change
    expect(easternTimeToUtc('2026-10-22', '20:15').toISOString()).toBe('2026-10-23T00:15:00.000Z') // Thursday night
    expect(easternTimeToUtc('2026-10-25', '9:30').toISOString()).toBe('2026-10-25T13:30:00.000Z') // an early international game
  })
})

describe('the schedule', () => {
  it('keeps regular-season games of the requested seasons, with kickoffs and final scores', async () => {
    const rows = await readFixture('games.csv')
    const games = toScheduleDocs(rows, new Set([2023]))
    expect(games).toHaveLength(9) // the 2023 games; the fixture also has one 2026 game
    expect(games.find(game => game._id === '2023_01_SF_PIT')).toEqual({
      _id: '2023_01_SF_PIT',
      season: 2023,
      seasonType: 'REG',
      week: 1,
      kickoff: new Date('2023-09-10T17:00:00.000Z'),
      homeTeam: 'PIT',
      awayTeam: 'SF',
      homeScore: 7,
      awayScore: 30
    })
    expect(toScheduleDocs(rows, new Set([2024]))).toEqual([])
  })

  it('never keeps betting lines', async () => {
    const [game] = toScheduleDocs(await readFixture('games.csv'), new Set([2023]))
    expect(Object.keys(game!).join(' ')).not.toMatch(/line|odds|moneyline|spread|total/i)
  })

  it('treats blank scores as not final, and a blank kickoff time as 1 PM', async () => {
    const [first] = await readFixture('games.csv')
    const [game] = toScheduleDocs([{ ...first!, home_score: '', away_score: '', gametime: '' }], new Set([2023]))
    expect(game).toMatchObject({ homeScore: null, awayScore: null, kickoff: new Date('2023-09-10T17:00:00.000Z') })
  })
})

describe('importing the season in progress', () => {
  it('stores the schedule and when each season was imported', async () => {
    const [result] = await importSeasons([2023], fixtureLoader)
    expect(result).toMatchObject({ season: 2023, games: 9, finalGames: 9 })
    expect(await NflGameModel.countDocuments({ season: 2023 })).toBe(9)
    const record = await StatsImportModel.findById(2023).lean()
    expect(record).toMatchObject({ playerWeeks: 7, defenseWeeks: 18, games: 9, finalGames: 9 })
    expect(Date.now() - record!.importedAt.getTime()).toBeLessThan(60_000)
  })

  it('treats stats nflverse hasn’t published yet as empty, but only for the season in progress', async () => {
    const unpublished: CsvLoader = url => (/stats_(player|team)_week/.test(url) ? Promise.reject(new CsvNotFound(url)) : fixtureLoader(url))
    const [result] = await importSeasons([2023], unpublished, { now: DURING_2023 })
    expect(result).toMatchObject({ playerWeeks: 0, defenseWeeks: 0, games: 9 })
    // A finished season with a missing file is a real problem.
    await expect(importSeasons([2023], unpublished, { now: new Date('2024-06-01T00:00:00Z') })).rejects.toThrow(CsvNotFound)
  })

  it('leaves a defense whose game isn’t final for the next import, instead of failing', async () => {
    const unfinished: CsvLoader = async url => {
      const rows = await fixtureLoader(url)
      return url.endsWith('games.csv') ? rows.map(row => (row.game_id === '2023_01_SF_PIT' ? { ...row, home_score: '', away_score: '' } : row)) : rows
    }
    const [result] = await importSeasons([2023], unfinished, { now: DURING_2023 })
    expect(result).toMatchObject({ defenseWeeks: 16, finalGames: 8 })
    expect(await DefenseWeekStatModel.countDocuments({ gameId: '2023_01_SF_PIT' })).toBe(0)
    expect(await PlayerWeekStatModel.countDocuments({ gameId: '2023_01_SF_PIT' })).toBeGreaterThan(0)

    // Once the game is final, the next import adds it.
    const [later] = await importSeasons([2023], fixtureLoader, { now: DURING_2023 })
    expect(later).toMatchObject({ defenseWeeks: 18, finalGames: 9 })
    expect((await NflGameModel.findById('2023_01_SF_PIT'))?.homeScore).toBe(7)
  })
})

describe('the current season', () => {
  it('runs September to February', () => {
    expect(currentNflSeason(new Date('2026-10-24T12:00:00Z'))).toBe(2026)
    expect(currentNflSeason(new Date('2027-02-10T12:00:00Z'))).toBe(2026)
    expect(currentNflSeason(new Date('2027-03-01T12:00:00Z'))).toBe(2027)
  })

  it('is never a Classic season: Classic hides players, and a live season can be looked up', () => {
    expect(LAST_LEAGUE_SEASON).toBeLessThan(currentNflSeason())
  })
})

describe('script configuration', () => {
  it('needs only the database address', () => {
    expect(loadScriptEnv({ MONGODB_URI: 'mongodb://localhost/test' })).toMatchObject({ MONGODB_URI: 'mongodb://localhost/test' })
    expect(() => loadScriptEnv({})).toThrow(/MONGODB_URI/)
    // Never echoes the value back.
    let message = ''
    try {
      loadScriptEnv({ MONGODB_URI: 'not-a-uri-secret' })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toMatch(/MONGODB_URI/)
    expect(message).not.toContain('secret')
  })
})
