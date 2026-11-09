import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { byeSeeds, gameWinner, playoffFormat, roundGames, roundName } from '../src/modules/season/bracket.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { DefenseWeekStatModel, PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'
import { as, host, makeWeeksDue } from './leagueHelpers.js'
import { SEEDED_SEASON, seedStats } from './statsSeed.js'

const outsider = as('auth0|outsider')

interface Side {
  seed: number
  partyId: string
  name: string
  total: number | null
}
interface Playoffs {
  format: { spots: number; rounds: number }
  provisional: boolean
  seeds: { seed: number; partyId: string; name: string }[]
  rounds: { round: number; week: number; name: string; games: { high: Side; low: Side; winner: string | null }[]; byes: { seed: number; partyId: string }[] }[]
  champion: { partyId: string; name: string } | null
}
interface Standing {
  partyId: string
  name: string
  wins: number
  losses: number
  draws: number
}
interface ScheduleWeek {
  week: number
  matchups: { home: { partyId: string }; away: { partyId: string } | null; kind: string }[]
}

beforeEach(async () => {
  // Deep enough for 8 parties. The seeded season stops at NFL week 14, so copy week 14 into the playoff weeks
  // to give them real totals (otherwise every playoff battle is a 0-0 draw).
  await seedStats({ depth: 40 })
  const players = await PlayerWeekStatModel.find({ season: SEEDED_SEASON, week: 14 }, { _id: 0 }).lean()
  const defenses = await DefenseWeekStatModel.find({ season: SEEDED_SEASON, week: 14 }, { _id: 0 }).lean()
  for (const week of [15, 16, 17]) {
    const copy = <T extends { gameId: string }>(stat: T) => ({ ...stat, week, gameId: `${stat.gameId}-w${String(week)}` })
    await PlayerWeekStatModel.insertMany(players.map(copy))
    await DefenseWeekStatModel.insertMany(defenses.map(copy))
  }
})

/** A daily league of `size` parties (host plus members), drafted; with playoffs unless told otherwise. */
async function league(size: number, extra: object = {}) {
  const created = await host.post('/api/leagues', {
    name: 'Bracket League',
    visibility: 'private',
    cadence: 'daily',
    maxParties: Math.max(size, 2),
    party: { name: 'Host Party', crest: { emblem: 'crown', banner: 'crimson' } },
    ...extra
  })
  expect(created.status).toBe(201)
  const { id, pin } = created.body as { id: string; pin: string }
  const members = Array.from({ length: size - 1 }, (_, i) => as(`auth0|member${String(i)}`))
  for (const [i, member] of members.entries()) {
    const joined = await member.post('/api/leagues/join', { pin, party: { name: `Party ${String(i)}`, crest: { emblem: 'oak', banner: 'emerald' } } })
    expect(joined.status).toBe(201)
  }
  const scheduled = await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })
  expect(scheduled.status).toBe(200)
  await LeagueModel.updateOne({ _id: id }, { $set: { draftAt: new Date(Date.now() - 1000) } })
  await host.get(`/api/leagues/${id}`) // runs the draft
  await HeroModel.updateMany({ leagueId: id }, { $set: { traits: [] } })
  return id
}

/** Resolves every week up to `weeks`. */
async function playThrough(id: string, weeks: number) {
  await makeWeeksDue(id, weeks)
  const res = await host.get(`/api/leagues/${id}`)
  expect(res.status).toBe(200)
  return res.body as { status: string; resolvedWeeks: number; seasonWeeks: number; playoffs: unknown }
}

const bracket = async (id: string) => (await host.get(`/api/leagues/${id}/playoffs`)).body as Playoffs
const standings = async (id: string) => (await host.get(`/api/leagues/${id}/standings`)).body as Standing[]
const schedule = async (id: string) => (await host.get(`/api/leagues/${id}/schedule`)).body as ScheduleWeek[]
const pair = (high: string, low: string) => ({ high, low })

describe('the bracket', () => {
  it('scales with the league', () => {
    expect([2, 3].map(playoffFormat)).toEqual([{ spots: 2, rounds: 1 }, { spots: 2, rounds: 1 }])
    expect([4, 7].map(playoffFormat)).toEqual([{ spots: 4, rounds: 2 }, { spots: 4, rounds: 2 }])
    expect([8, 12].map(playoffFormat)).toEqual([{ spots: 6, rounds: 3 }, { spots: 6, rounds: 3 }])
    expect(roundName(playoffFormat(8), 1)).toBe('Quarterfinals')
    expect(roundName(playoffFormat(4), 1)).toBe('Semifinals')
    expect(roundName(playoffFormat(2), 1)).toBe('Final')
  })

  it('pairs the best seeds left against the worst', () => {
    const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7']
    expect(roundGames(playoffFormat(4), seeds, 1, [])).toEqual([pair('s1', 's4'), pair('s2', 's3')])
    expect(roundGames(playoffFormat(4), seeds, 2, [['s4', 's2']])).toEqual([pair('s2', 's4')])
    const six = playoffFormat(8)
    expect(roundGames(six, seeds, 1, [])).toEqual([pair('s3', 's6'), pair('s4', 's5')])
    expect(byeSeeds(six, seeds, 1)).toEqual(['s1', 's2'])
    expect(byeSeeds(six, seeds, 2)).toEqual([])
    // The top seed plays the lowest seed to come through round 1.
    expect(roundGames(six, seeds, 2, [['s3', 's5']])).toEqual([pair('s1', 's5'), pair('s2', 's3')])
    expect(roundGames(six, seeds, 3, [['s3', 's5'], ['s5', 's2']])).toEqual([pair('s2', 's5')])
  })

  it('advances the higher seed on a draw', () => {
    expect(gameWinner(pair('s1', 's2'), 'draw')).toBe('s1')
    expect(gameWinner(pair('s1', 's2'), 'home')).toBe('s1')
    expect(gameWinner(pair('s1', 's2'), 'away')).toBe('s2')
  })
})

describe('hosting with playoffs', () => {
  it('is on by default for Classic and fixed once the league exists', async () => {
    const id = await league(2)
    const detail = (await host.get(`/api/leagues/${id}`)).body as { playoffs: unknown; seasonWeeks: number }
    expect(detail.playoffs).toEqual({ spots: 2, rounds: 1, regularWeeks: 14 })
    expect(detail.seasonWeeks).toBe(15)
    expect((await host.patch(`/api/leagues/${id}`, { playoffs: false })).status).toBe(400)
  })

  it('without playoffs, plays 14 weeks and the best record wins', async () => {
    const id = await league(2, { playoffs: false })
    expect((await playThrough(id, 14)).status).toBe('complete')
    expect((await host.get(`/api/leagues/${id}/playoffs`)).status).toBe(404)
    const finale = (await host.get(`/api/leagues/${id}/finale`)).body as { champion: { partyId: string } }
    expect(finale.champion.partyId).toBe((await standings(id))[0]!.partyId)
  })
})

describe('a two-party final', () => {
  it('is set from the standings and decides the champion', async () => {
    const id = await league(2)
    // Before the regular season ends, the final is provisional and can't be previewed.
    await playThrough(id, 3)
    const early = await bracket(id)
    expect(early.provisional).toBe(true)
    expect(early.rounds[0]!.games[0]!.high.total).toBeNull()
    expect(early.champion).toBeNull()
    const matchup = await host.get(`/api/leagues/${id}/matchup?week=15`)
    expect(matchup.status).toBe(404)
    expect((matchup.body as { error: { message: string } }).error.message).toMatch(/bracket plays out/)

    const afterRegular = await playThrough(id, 14)
    expect(afterRegular.status).toBe('active')
    const table = await standings(id)
    const set = await bracket(id)
    expect(set.provisional).toBe(false)
    expect(set.rounds[0]!.games).toEqual([
      { high: expect.objectContaining({ seed: 1, partyId: table[0]!.partyId, total: null }), low: expect.objectContaining({ seed: 2, partyId: table[1]!.partyId }), winner: null }
    ])
    expect((await schedule(id)).find(week => week.week === 15)!.matchups).toEqual([
      expect.objectContaining({ home: expect.objectContaining({ partyId: table[0]!.partyId }), away: expect.objectContaining({ partyId: table[1]!.partyId }), kind: 'playoff' })
    ])

    expect((await playThrough(id, 15)).status).toBe('complete')
    const done = await bracket(id)
    const final = done.rounds[0]!.games[0]!
    expect(final.high.total).toEqual(expect.any(Number))
    const result = (await WeekResultModel.findOne({ leagueId: id, week: 15 }).lean())!
    expect(result.matchups[0]!.kind).toBe('playoff')
    const expected = result.matchups[0]!.outcome === 'away' ? final.low.partyId : final.high.partyId
    expect(final.winner).toBe(expected)
    expect(done.champion?.partyId).toBe(expected)
    const finale = (await host.get(`/api/leagues/${id}/finale`)).body as { champion: { partyId: string } }
    expect(finale.champion.partyId).toBe(expected)
    // The final doesn't count in the standings.
    for (const row of await standings(id)) expect(row.wins + row.losses + row.draws).toBe(14)
  })

  it('crowns the higher seed on a draw, and the lower seed when it wins', async () => {
    const id = await league(2)
    await playThrough(id, 15)
    const table = await standings(id)
    const champion = async () => ((await host.get(`/api/leagues/${id}/finale`)).body as { champion: { partyId: string } }).champion.partyId
    await WeekResultModel.updateOne({ leagueId: id, week: 15 }, { $set: { 'matchups.0.outcome': 'draw' } })
    expect(await champion()).toBe(table[0]!.partyId)
    await WeekResultModel.updateOne({ leagueId: id, week: 15 }, { $set: { 'matchups.0.outcome': 'away' } })
    expect(await champion()).toBe(table[1]!.partyId)
  })

  it('is for members only', async () => {
    const id = await league(2)
    expect((await outsider.get(`/api/leagues/${id}/playoffs`)).status).toBe(404)
  })
})

describe('a top-4 bracket', () => {
  it('plays semifinals then a final, with consolation battles for the rest', async () => {
    const id = await league(5)
    expect((await host.get(`/api/leagues/${id}`)).body).toMatchObject({ seasonWeeks: 16, playoffs: { spots: 4, rounds: 2 } })
    await playThrough(id, 14)
    const seeds = (await standings(id)).map(row => row.partyId)

    const semis = (await schedule(id)).find(week => week.week === 15)!.matchups
    // The host's matchup is a semifinal, or a consolation battle outside the top 4.
    const hostSeed = (await standings(id)).findIndex(row => row.name === 'Host Party')
    const hostWeek = (await host.get(`/api/leagues/${id}/matchup?week=15`)).body as { kind: string }
    expect(hostWeek.kind).toBe(hostSeed < 4 ? 'playoff' : 'consolation')
    expect(semis.map(m => [m.home.partyId, m.away?.partyId ?? null, m.kind])).toEqual([
      [seeds[0], seeds[3], 'playoff'],
      [seeds[1], seeds[2], 'playoff'],
      [seeds[4], null, 'consolation'] // the odd one out fights the monster
    ])
    expect((await bracket(id)).rounds[1]!.games).toEqual([])

    await playThrough(id, 15)
    const winners = (await bracket(id)).rounds[0]!.games.map(game => game.winner!)
    const losers = (await bracket(id)).rounds[0]!.games.map(game => (game.winner === game.high.partyId ? game.low.partyId : game.high.partyId))
    const finalWeek = (await schedule(id)).find(week => week.week === 16)!.matchups
    const [high, low] = [...winners].sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b))
    expect(finalWeek[0]).toMatchObject({ home: { partyId: high }, away: { partyId: low }, kind: 'playoff' })
    // The semifinal losers and the fifth party play consolation battles, in standings order.
    const rest = seeds.filter(seedId => losers.includes(seedId) || seedId === seeds[4])
    expect(finalWeek.slice(1).map(m => [m.home.partyId, m.away?.partyId ?? null, m.kind])).toEqual([
      [rest[0], rest[1], 'consolation'],
      [rest[2], null, 'consolation']
    ])

    const done = await playThrough(id, 16)
    expect(done.status).toBe('complete')
    const view = await bracket(id)
    expect(view.rounds.map(round => round.name)).toEqual(['Semifinals', 'Final'])
    expect(view.champion?.partyId).toBe(view.rounds[1]!.games[0]!.winner)
    // Consolation battles don't count either.
    for (const row of await standings(id)) expect(row.wins + row.losses + row.draws).toBe(14)
  })
})

describe('a top-6 bracket', () => {
  it('rests the top two seeds in the quarterfinals, then seeds the semifinals', async () => {
    const id = await league(8)
    expect((await host.get(`/api/leagues/${id}`)).body).toMatchObject({ seasonWeeks: 17, playoffs: { spots: 6, rounds: 3 } })
    await playThrough(id, 14)
    const seeds = (await standings(id)).map(row => row.partyId)
    const quarters = (await schedule(id)).find(week => week.week === 15)!.matchups
    expect(quarters.map(m => [m.home.partyId, m.away?.partyId ?? null, m.kind])).toEqual([
      [seeds[2], seeds[5], 'playoff'],
      [seeds[3], seeds[4], 'playoff'],
      [seeds[6], seeds[7], 'consolation']
    ])
    expect((await bracket(id)).rounds[0]!.byes.map(bye => bye.partyId)).toEqual([seeds[0], seeds[1]])
    // The top seeds have no battle that week.
    const topName = (await standings(id))[0]!.name
    const topOwner = topName === 'Host Party' ? host : as(`auth0|member${topName.replace('Party ', '')}`)
    const rest = await topOwner.get(`/api/leagues/${id}/matchup?week=15`)
    expect(rest.status).toBe(404)
    expect((rest.body as { error: { message: string } }).error.message).toMatch(/bye/)

    await playThrough(id, 15)
    const through = (await bracket(id)).rounds[0]!.games.map(game => game.winner!)
    const lowest = [...through].sort((a, b) => seeds.indexOf(b) - seeds.indexOf(a))[0]
    const semis = (await schedule(id)).find(week => week.week === 16)!.matchups.filter(m => m.kind === 'playoff')
    expect(semis[0]).toMatchObject({ home: { partyId: seeds[0] }, away: { partyId: lowest } })
    expect(semis[1]!.home.partyId).toBe(seeds[1])

    expect((await playThrough(id, 17)).status).toBe('complete')
    const view = await bracket(id)
    expect(view.rounds.map(round => round.name)).toEqual(['Quarterfinals', 'Semifinals', 'Final'])
    expect(view.rounds[2]!.games).toHaveLength(1)
    expect(view.champion?.partyId).toBe(view.rounds[2]!.games[0]!.winner)
  })
})

