import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel, readLineup } from '../src/modules/leagues/party.model.js'
import { weekFinalAt } from '../src/modules/season/nflWeeks.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { NflGameModel, PlayerWeekStatModel, StatsImportModel } from '../src/modules/stats/stats.models.js'
import { alice, draftedCrossover, fixedRoster, freeAgent, kickOff } from './crossoverLeague.js'
import { SEASON, seedCrossover } from './crossoverSeed.js'
import { host } from './leagueHelpers.js'

beforeEach(async () => {
  await seedCrossover()
})

describe('when a Crossover week goes final', () => {
  it('is 6 AM Eastern on the Tuesday after the last game', () => {
    // Sunday 1 PM EDT, Monday night EDT, and a Thursday game: each goes final the following Tuesday.
    expect(weekFinalAt(new Date('2026-10-25T17:00:00Z')).toISOString()).toBe('2026-10-27T10:00:00.000Z')
    expect(weekFinalAt(new Date('2026-10-27T00:15:00Z')).toISOString()).toBe('2026-10-27T10:00:00.000Z') // Mon 8:15 PM EDT
    expect(weekFinalAt(new Date('2026-10-23T00:15:00Z')).toISOString()).toBe('2026-10-27T10:00:00.000Z') // Thu 8:15 PM EDT
    // After clocks change: Monday Nov 2, 8:15 PM EST goes final Tuesday 6 AM EST (11:00 UTC).
    expect(weekFinalAt(new Date('2026-11-03T01:15:00Z')).toISOString()).toBe('2026-11-03T11:00:00.000Z')
    // A rare Tuesday game (2020 had one) goes final the Tuesday after, not hours later.
    expect(weekFinalAt(new Date('2026-12-08T23:00:00Z')).toISOString()).toBe('2026-12-15T11:00:00.000Z')
  })

  it('sets up the league’s NFL weeks and schedule at the draft', async () => {
    const id = await draftedCrossover()
    const league = (await LeagueModel.findById(id))!
    expect(league.nflWeeks).toHaveLength(10)
    const lastKickoff = (await NflGameModel.find({ season: SEASON, week: 8 }).sort({ kickoff: -1 }).limit(1))[0]!.kickoff
    expect(league.nflWeeks![0]!.finalAt).toEqual(weekFinalAt(lastKickoff))
    expect(league.weekOneAt).toEqual(league.nflWeeks![0]!.finalAt)
    const schedule = (await host.get(`/api/leagues/${id}/schedule`)).body as { week: number; resolvesAt: string }[]
    expect(schedule.map(week => week.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(new Date(schedule[1]!.resolvesAt)).toEqual(league.nflWeeks![1]!.finalAt)
  })

  it('waits for every game to be final and imported, then resolves with that NFL week’s stats', async () => {
    const id = await draftedCrossover()
    const league = (await LeagueModel.findById(id))!
    const finalAt = new Date(Date.now() - 60_000)
    await LeagueModel.updateOne({ _id: id }, { $set: { 'nflWeeks.0.finalAt': finalAt, weekOneAt: finalAt } })
    // Week 8 stats: every player gains 10 points.
    const lines = await PlayerWeekStatModel.find({ season: SEASON, week: 7 }).lean()
    await PlayerWeekStatModel.insertMany(lines.map(({ _id, ...line }) => ({ ...line, week: 8, gameId: `${line.gameId}-8`, stats: { ...line.stats, rushingYards: 100 } })))

    // Due by the clock, but the games aren't final and nothing was imported since.
    await host.get(`/api/leagues/${id}`)
    expect((await LeagueModel.findById(id))?.resolvedWeeks).toBe(0)

    // A fresh import, but one game still isn't final.
    await NflGameModel.updateOne({ season: SEASON, week: 8, homeTeam: 'KC' }, { $set: { homeScore: 21, awayScore: 20 } })
    await StatsImportModel.create({ _id: SEASON, importedAt: new Date(), playerWeeks: 1, defenseWeeks: 1, games: 1, finalGames: 1 })
    await host.get(`/api/leagues/${id}`)
    expect((await LeagueModel.findById(id))?.resolvedWeeks).toBe(0)

    await NflGameModel.updateMany({ season: SEASON, week: 8 }, { $set: { homeScore: 21, awayScore: 20 } })
    await StatsImportModel.updateOne({ _id: SEASON }, { $set: { importedAt: new Date(finalAt.getTime() - 1000), playerWeeks: 1, defenseWeeks: 1, games: 1, finalGames: 1 } }, { upsert: true })
    await host.get(`/api/leagues/${id}`)
    expect((await LeagueModel.findById(id))?.resolvedWeeks).toBe(0) // imported before the week went final

    await StatsImportModel.updateOne({ _id: SEASON }, { $set: { importedAt: new Date() } })
    await host.get(`/api/leagues/${id}`)
    expect((await LeagueModel.findById(id))?.resolvedWeeks).toBe(1)
    const result = (await WeekResultModel.findOne({ leagueId: id, week: 1 }))!
    const played = result.matchups[0]!.home.heroes.filter(line => line.slot !== 'Bench' && !line.resting)
    // Starters on teams with a week 8 game scored that week's 10 points; byes rested.
    expect(played.length).toBeGreaterThan(0)
    for (const line of played) expect(line.points).toBe(10)
    expect(league.nflWeeks![0]!.nflWeek).toBe(8)
  })

  it('completes the league after its last NFL week', async () => {
    const id = await draftedCrossover()
    const weeks = (await LeagueModel.findById(id))!.nflWeeks!
    const past = new Date(Date.now() - 60_000)
    await LeagueModel.updateOne({ _id: id }, { $set: { nflWeeks: weeks.map(week => ({ nflWeek: week.nflWeek, finalAt: past })), weekOneAt: past } })
    await NflGameModel.updateMany({ season: SEASON }, { $set: { homeScore: 10, awayScore: 3 } })
    await StatsImportModel.create({ _id: SEASON, importedAt: new Date(), playerWeeks: 1, defenseWeeks: 1, games: 1, finalGames: 1 })
    await host.get(`/api/leagues/${id}`)
    const league = (await LeagueModel.findById(id))!
    expect(league.resolvedWeeks).toBe(10)
    expect(league.status).toBe('complete')
  })
})

describe('kickoff locks', () => {
  it('show each hero’s kickoff, byes as resting, and lock heroes once their game starts', async () => {
    const id = await draftedCrossover()
    const { ids } = await fixedRoster(id)
    await kickOff('KC')
    const view = (await alice.get(`/api/leagues/${id}/lineup`)).body as {
      roster: { id: string; kickoff: string | null; locked: boolean; restingNextWeek: boolean }[]
    }
    const entry = (heroId: string) => view.roster.find(hero => hero.id === heroId)!
    expect(entry(ids.qb)).toMatchObject({ locked: true, restingNextWeek: false })
    expect(entry(ids.rb2)).toMatchObject({ locked: false, restingNextWeek: false }) // PHI plays later
    expect(entry(ids.rb2).kickoff).not.toBeNull()
    expect(entry(ids.rb1)).toMatchObject({ locked: false, kickoff: null, restingNextWeek: true }) // DET on bye
  })

  it('keep a locked player in place and locked bench players out, but let everyone else move', async () => {
    const id = await draftedCrossover()
    const { ids, lineup } = await fixedRoster(id)
    await kickOff('KC')
    // The KC quarterback has kicked off: he can't be benched.
    const benchQb = await alice.put(`/api/leagues/${id}/lineup`, { ...lineup, qb: ids['bench-qb'] })
    expect(benchQb.status).toBe(409)
    expect(benchQb.body.error.message).toMatch(/is locked: their game has kicked off/)
    // The KC running back on the bench has kicked off too: he can't come in.
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...lineup, rb1: ids['bench-rb'] })).status).toBe(409)
    // A receiver on bye out, an SF receiver yet to play in: fine.
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...lineup, wr2: ids['bench-wr'] })).status).toBe(200)
  })

  it('keep the Champion from changing to or from a locked player', async () => {
    const id = await draftedCrossover()
    const { ids } = await fixedRoster(id)
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: ids.qb })).status).toBe(200)
    await kickOff('KC')
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: ids.te })).status).toBe(409)
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: null })).status).toBe(409)
  })

  it('let the Champion move between players yet to play', async () => {
    const id = await draftedCrossover()
    const { ids } = await fixedRoster(id)
    await kickOff('KC')
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: ids.te })).status).toBe(200)
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: ids.rb2 })).status).toBe(200)
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: ids.qb })).status).toBe(409)
  })
})

describe('claims under kickoff locks', () => {
  it('refuse dropping a starter whose game has kicked off', async () => {
    const id = await draftedCrossover()
    const { ids } = await fixedRoster(id)
    const free = await freeAgent(id, 'Mage', 'PHI', Object.values(ids))
    await kickOff('KC')
    const res = await alice.post(`/api/leagues/${id}/claims`, { heroId: free, dropHeroId: ids.qb })
    expect(res.status).toBe(409)
    expect(res.body.error.message).toMatch(/game has kicked off/)
  })

  it('refill the slot from the bench when the claimed player has already played', async () => {
    const id = await draftedCrossover()
    const { ids, party } = await fixedRoster(id)
    const played = await freeAgent(id, 'Ranger', 'BUF', Object.values(ids))
    await kickOff('BUF')
    // Drop the GB receiver (bye) for a BUF receiver who has played: the SF receiver on the bench steps in.
    expect((await alice.post(`/api/leagues/${id}/claims`, { heroId: played, dropHeroId: ids.wr2 })).status).toBe(200)
    const after = readLineup((await PartyModel.findById(party._id))!.lineup)!
    expect(after.wr2).toBe(ids['bench-wr'])
    expect(Object.values(after)).not.toContain(played)
  })

  it('refuse a claim that leaves a slot nobody yet to play can fill', async () => {
    const id = await draftedCrossover()
    const { ids } = await fixedRoster(id)
    const played = await freeAgent(id, 'Warrior', 'BUF', Object.values(ids))
    // KC plays BUF: the claimed BUF back has played and the KC back on Alice's bench is locked.
    await kickOff('BUF')
    const refused = await alice.post(`/api/leagues/${id}/claims`, { heroId: played, dropHeroId: ids.rb1 })
    expect(refused.status).toBe(400)
    expect(refused.body.error.message).toMatch(/can fill your RB slot this week/)
  })

  it('let a claimed player take the slot when they haven’t played yet', async () => {
    const id = await draftedCrossover()
    const { ids, party } = await fixedRoster(id)
    const yetToPlay = await freeAgent(id, 'Warrior', 'BUF', Object.values(ids))
    expect((await alice.post(`/api/leagues/${id}/claims`, { heroId: yetToPlay, dropHeroId: ids.rb1 })).status).toBe(200)
    expect(readLineup((await PartyModel.findById(party._id))!.lineup)!.rb1).toBe(yetToPlay)
  })
})

describe('game-day scores', () => {
  interface LiveSide {
    projectedTotal: number
    liveTotal: number | null
    projectedGridiron: number | null
    liveGridiron: number | null
    starters: { slot: string; hero: { id: string; projected: number; game?: { final: boolean; locked: boolean; points: number | null } | null } | null }[]
  }

  it('count final games for real and the rest by projection, with how many games are final', async () => {
    const id = await draftedCrossover()
    const { ids } = await fixedRoster(id)
    // KC-BUF is over: the KC quarterback ran for 300 yards (30 points). PHI-SF hasn't started.
    await kickOff('KC')
    await NflGameModel.updateOne({ season: SEASON, week: 8, homeTeam: 'KC' }, { $set: { homeScore: 27, awayScore: 24 } })
    const qb = (await HeroModel.findById(ids.qb).select('+source'))!
    const [line] = await PlayerWeekStatModel.find({ season: SEASON, week: 7, playerId: qb.source.id }).lean()
    const { _id, ...week7 } = line!
    await PlayerWeekStatModel.create({ ...week7, week: 8, gameId: 'week8-kc', stats: { ...week7.stats, rushingYards: 300 } })

    const matchup = (await alice.get(`/api/leagues/${id}/matchup`)).body as { games: { final: number; total: number }; me: LiveSide }
    expect(matchup.games).toEqual({ final: 1, total: 2 })
    const slot = (key: string) => matchup.me.starters.find(starter => starter.slot === key)!.hero!
    expect(slot('qb').game).toMatchObject({ final: true, locked: true, points: 30 })
    expect(slot('rb2').game).toMatchObject({ final: false, locked: false, points: null })
    expect(slot('rb1').game).toBeNull() // bye
    // The live total swaps the quarterback's projection for his 30 real points (a Mage deals 1x).
    // The BUF receiver's game is over too, but he has no stat line: he sat out, so 0 instead of a projection.
    expect(slot('wr1').game).toMatchObject({ final: true, points: 0 })
    // Gridiron is plain points: the live total swaps those two projections (class damage / class multiplier) for
    // real points, rounding aside. Quest goes live the same way, with the encounter's modifiers on top.
    const pointsOf = (projected: number, multiplier: number) => projected / multiplier
    const expected = matchup.me.projectedGridiron! - pointsOf(slot('qb').projected, 1) + 30 - pointsOf(slot('wr1').projected, 1.4)
    expect(Math.abs(matchup.me.liveGridiron! - expected)).toBeLessThanOrEqual(1)
    expect(matchup.me.liveTotal).not.toBe(matchup.me.projectedTotal)
  })

  it('are left out of Classic matchups', async () => {
    const { seedStats } = await import('./statsSeed.js')
    const { draftedLeague } = await import('./leagueHelpers.js')
    await NflGameModel.deleteMany({})
    await PlayerWeekStatModel.deleteMany({})
    const { NflPlayerModel, DefenseWeekStatModel } = await import('../src/modules/stats/stats.models.js')
    await NflPlayerModel.deleteMany({})
    await DefenseWeekStatModel.deleteMany({})
    await seedStats()
    const id = await draftedLeague([alice])
    const matchup = (await alice.get(`/api/leagues/${id}/matchup`)).body as { games: unknown; me: LiveSide }
    expect(matchup.games).toBeNull()
    expect(matchup.me.liveTotal).toBeNull()
    expect(matchup.me.projectedGridiron).toBeNull()
    expect(JSON.stringify(matchup.me.starters)).not.toContain('"game"')
  })
})

describe('Crossover form', () => {
  it('covers the whole real season, even before the first battle', async () => {
    const id = await draftedCrossover()
    const heroes = (await host.get(`/api/leagues/${id}/heroes`)).body as { form: { played: number } }[]
    expect(heroes.some(hero => hero.form.played === 7)).toBe(true)
  })
})
