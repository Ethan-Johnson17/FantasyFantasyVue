import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { CADENCE_MS, LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'
import { buildTestApp, signToken } from './helpers.js'
import { SEEDED_SEASON, seedStats } from './statsSeed.js'

const app = buildTestApp()

function as(sub: string) {
  const withAuth = async (req: request.Test) => req.set('Authorization', await signToken(sub))
  return {
    get: (url: string) => withAuth(request(app).get(url)),
    post: (url: string, body: object = {}) => withAuth(request(app).post(url).send(body)),
    put: (url: string, body: object) => withAuth(request(app).put(url).send(body))
  }
}

const host = as('auth0|host')
const alice = as('auth0|alice')
const bob = as('auth0|bob')
const outsider = as('auth0|outsider')
const DAY = CADENCE_MS.daily

interface LineupView {
  lineup: Record<string, string> | null
  roster: { id: string; heroClass: string; restingNextWeek: boolean; partyId: string }[]
  nextWeek: number | null
}

/** A daily league with the draft already run. */
async function draftedLeague(members = [alice]) {
  const created = await host.post('/api/leagues', {
    name: 'Season League',
    visibility: 'private',
    cadence: 'daily',
    maxParties: 6,
    party: { name: 'Host Party', color: '#111111' }
  })
  const { id, pin } = created.body as { id: string; pin: string }
  for (const [i, member] of members.entries()) {
    await member.post('/api/leagues/join', { pin, party: { name: `Member ${String(i)}`, color: '#222222' } })
  }
  await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })
  await LeagueModel.updateOne({ _id: id }, { $set: { draftAt: new Date(Date.now() - 1000) } })
  await host.get(`/api/leagues/${id}`) // runs the draft
  return id
}

/** Shifts week 1's resolve time so that `weeksDue` game weeks are due now. */
async function makeWeeksDue(leagueId: string, weeksDue: number) {
  const weekOneAt = new Date(Date.now() - (weeksDue - 1) * DAY - 60_000)
  await LeagueModel.updateOne({ _id: leagueId }, { $set: { weekOneAt } })
}

beforeEach(async () => {
  await seedStats()
})

describe('schedule', () => {
  it('is created by the draft and lists 14 weeks with resolve times', async () => {
    const id = await draftedLeague()
    const res = await alice.get(`/api/leagues/${id}/schedule`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(14)
    expect(res.body[0].matchups).toHaveLength(1)
    expect(res.body[0].matchups[0].result).toBeNull()
    expect(new Date(res.body[1].resolvesAt as string).getTime() - new Date(res.body[0].resolvesAt as string).getTime()).toBe(DAY)
  })

  it('pairs the odd party out against the dungeon monster', async () => {
    const id = await draftedLeague([alice, bob])
    await makeWeeksDue(id, 1)
    const week = (await alice.get(`/api/leagues/${id}/results/1`)).body
    const monsterGame = week.matchups.find((m: { away: unknown }) => m.away === null)
    const realGame = week.matchups.find((m: { away: unknown }) => m.away !== null)
    expect(monsterGame.monster.name).toEqual(expect.any(String))
    const totals = [realGame.home.total, realGame.away.total, monsterGame.home.total] as number[]
    expect(monsterGame.monster.total).toBeCloseTo(totals.reduce((a, b) => a + b, 0) / 3, 2)
  })
})

describe('weekly resolution', () => {
  it('resolves a due week the next time the league is opened', async () => {
    const id = await draftedLeague()
    expect((await alice.get(`/api/leagues/${id}/results/1`)).status).toBe(404)

    await makeWeeksDue(id, 1)
    const res = await alice.get(`/api/leagues/${id}/results/1`)
    expect(res.status).toBe(200)
    const [matchup] = res.body.matchups
    for (const side of [matchup.home, matchup.away]) {
      const starters = side.heroes.filter((h: { slot: string }) => h.slot !== 'Bench')
      expect(starters).toHaveLength(6)
      expect(side.heroes).toHaveLength(8)
    }
    expect(['home', 'away', 'draw']).toContain(matchup.outcome)
    expect(await WeekResultModel.countDocuments({ leagueId: id })).toBe(1)
  })

  it('stores exact scores from the hidden season and the lineup that was used', async () => {
    const id = await draftedLeague()
    await makeWeeksDue(id, 1)
    await alice.get(`/api/leagues/${id}`)

    const result = await WeekResultModel.findOne({ leagueId: id, week: 1 }).lean()
    const parties = await PartyModel.find({ leagueId: id }).lean()
    const heroes = await HeroModel.find({ leagueId: id }).select('+source').lean()
    const side = result!.matchups[0]!.home
    const party = parties.find(p => p._id.equals(side.partyId))!

    // Recompute the total from raw stats: every seeded 2020 line is 100 rushing yards (10 points).
    let expected = 0
    for (const slot of ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin', 'Flex'] as const) {
      const hero = heroes.find(h => h._id.equals(party.lineup![slot]))!
      const line = side.heroes.find(h => h.heroId.equals(hero._id))!
      expect(line.slot).toBe(slot)
      if (hero.source.kind === 'player') {
        const stat = await PlayerWeekStatModel.findOne({ playerId: hero.source.id, season: SEEDED_SEASON, week: 1 }).lean()
        expect(stat).not.toBeNull()
        expect(line.points).toBe(10)
      }
      expected += line.points
    }
    expect(side.total).toBeCloseTo(expected, 6)
  })

  it('catches up on several due weeks at once, in order', async () => {
    const id = await draftedLeague()
    await makeWeeksDue(id, 4)
    await alice.get(`/api/leagues/${id}`)
    const weeks = (await WeekResultModel.find({ leagueId: id }).lean()).map(r => r.week).sort((a, b) => a - b)
    expect(weeks).toEqual([1, 2, 3, 4])
    expect((await LeagueModel.findById(id).lean())?.resolvedWeeks).toBe(4)
  })

  it('completes the league after week 14 with full standings', async () => {
    const id = await draftedLeague([alice, bob])
    await makeWeeksDue(id, 30)
    const league = (await alice.get(`/api/leagues/${id}`)).body
    expect(league.status).toBe('complete')
    expect(await WeekResultModel.countDocuments({ leagueId: id })).toBe(14)

    const standings = (await alice.get(`/api/leagues/${id}/standings`)).body as {
      wins: number
      losses: number
      draws: number
      totalDamage: number
    }[]
    expect(standings).toHaveLength(3)
    for (const row of standings) expect(row.wins + row.losses + row.draws).toBe(14)
    const winPoints = standings.map(row => row.wins + row.draws / 2)
    expect(winPoints).toEqual([...winPoints].sort((a, b) => b - a))
  })

  it('resolves each week exactly once under concurrent requests', async () => {
    const id = await draftedLeague([alice, bob])
    await makeWeeksDue(id, 3)
    const results = await Promise.all(
      [host, alice, bob, host, alice, bob].map(user => user.get(`/api/leagues/${id}/standings`))
    )
    expect(results.every(res => res.status === 200)).toBe(true)
    expect(await WeekResultModel.countDocuments({ leagueId: id })).toBe(3)
  })
})

describe('lineups', () => {
  async function myLineup(id: string) {
    return (await alice.get(`/api/leagues/${id}/lineup`)).body as LineupView
  }

  it('shows my roster, lineup, and the next week', async () => {
    const id = await draftedLeague()
    const view = await myLineup(id)
    expect(view.roster).toHaveLength(8)
    expect(Object.keys(view.lineup ?? {})).toEqual(['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin', 'Flex'])
    expect(view.nextWeek).toBe(1)
  })

  it('accepts a valid lineup and rejects invalid ones', async () => {
    const id = await draftedLeague()
    const { lineup, roster } = await myLineup(id)
    // Any bench hero can always start in its own class's slot.
    const benchHero = roster.find(hero => !Object.values(lineup!).includes(hero.id))!
    const res = await alice.put(`/api/leagues/${id}/lineup`, { ...lineup, [benchHero.heroClass]: benchHero.id })
    expect(res.status).toBe(200)
    expect(res.body.lineup[benchHero.heroClass]).toBe(benchHero.id)
    const mage = roster.find(hero => hero.heroClass === 'Mage')!
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...lineup, Paladin: mage.id })).status).toBe(400)
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...lineup, Flex: lineup!.Warrior })).status).toBe(400)

    const hostRoster = ((await host.get(`/api/leagues/${id}/lineup`)).body as LineupView).roster
    const foreignWarrior = hostRoster.find(hero => hero.heroClass === 'Warrior')!
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...lineup, Warrior: foreignWarrior.id })).status).toBe(400)
    expect((await outsider.put(`/api/leagues/${id}/lineup`, lineup!)).status).toBe(404)
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...lineup, Captain: mage.id })).status).toBe(400)
  })

  it('locks at resolve time: a change after the deadline only affects later weeks', async () => {
    const id = await draftedLeague()
    const { lineup, roster } = await myLineup(id)
    // Swap a bench hero into its own class's slot (always valid).
    const swap = roster.find(hero => !Object.values(lineup!).includes(hero.id))!
    const slot = swap.heroClass
    const replaced = lineup![slot]!

    await makeWeeksDue(id, 1)
    // Week 1 is due but nobody has opened the league yet. This change must not count for week 1.
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...lineup, [slot]: swap.id })).status).toBe(200)

    const week1 = await WeekResultModel.findOne({ leagueId: id, week: 1 }).lean()
    const mySide = week1!.matchups
      .flatMap(m => (m.away ? [m.home, m.away] : [m.home]))
      .find(side => side.heroes.some(h => h.heroId.toString() === swap.id))!
    expect(mySide.heroes.find(h => h.heroId.toString() === replaced)?.slot).toBe(slot)
    expect(mySide.heroes.find(h => h.heroId.toString() === swap.id)?.slot).toBe('Bench')
    // ...and the change does apply from week 2.
    expect(((await alice.get(`/api/leagues/${id}/lineup`)).body as LineupView).lineup?.[slot]).toBe(swap.id)
  })

  it('marks heroes without stats that week as Resting, and they score 0', async () => {
    const id = await draftedLeague()
    const { lineup } = await myLineup(id)
    const mage = await HeroModel.findById(lineup!.Mage).select('+source').lean()
    await PlayerWeekStatModel.deleteMany({ playerId: mage!.source.id, season: SEEDED_SEASON, week: 1 })

    const view = await myLineup(id)
    expect(view.roster.find(hero => hero.id === lineup!.Mage)?.restingNextWeek).toBe(true)
    expect(view.roster.filter(hero => hero.restingNextWeek)).toHaveLength(1)

    await makeWeeksDue(id, 1)
    const result = (await alice.get(`/api/leagues/${id}/results/1`)).body
    const line = [result.matchups[0].home, result.matchups[0].away]
      .flatMap((side: { heroes: { heroId: string; damage: number; resting: boolean }[] }) => side.heroes)
      .find(hero => hero.heroId === lineup!.Mage)
    expect(line).toMatchObject({ damage: 0, resting: true })
  })

  it('only allows changes while the season is running', async () => {
    const created = await host.post('/api/leagues', {
      name: 'Not drafted',
      visibility: 'private',
      cadence: 'daily',
      maxParties: 4,
      party: { name: 'Host Party', color: '#111111' }
    })
    const placeholder = '64b000000000000000000000'
    const slots = { Mage: placeholder, Warrior: placeholder, Ranger: placeholder, Rogue: placeholder, Paladin: placeholder, Flex: placeholder }
    expect((await host.put(`/api/leagues/${String(created.body.id)}/lineup`, slots)).status).toBe(409)

    const id = await draftedLeague()
    const { lineup } = await myLineup(id)
    await makeWeeksDue(id, 30)
    expect((await alice.put(`/api/leagues/${id}/lineup`, lineup!)).status).toBe(409)
  })
})

describe('hidden-player protection in results', () => {
  it('rounds per-hero damage and never exposes sources or the season', async () => {
    const id = await draftedLeague([alice, bob])
    // Give one hero a fractional score so rounding is observable.
    const party = await PartyModel.findOne({ leagueId: id }).lean()
    const mage = await HeroModel.findById(party!.lineup!.Mage).select('+source').lean()
    await PlayerWeekStatModel.updateOne(
      { playerId: mage!.source.id, season: SEEDED_SEASON, week: 1 },
      { $set: { 'stats.rushingYards': 104, 'stats.passingYards': 1 } }
    )
    await makeWeeksDue(id, 1)

    const responses = [
      await alice.get(`/api/leagues/${id}/results/1`),
      await alice.get(`/api/leagues/${id}/schedule`),
      await alice.get(`/api/leagues/${id}/standings`),
      await alice.get(`/api/leagues/${id}/lineup`)
    ]
    for (const res of responses) {
      expect(res.status).toBe(200)
      expect(res.text).not.toMatch(/"season"|"seed"|"source"|Real |QB-\d|"T\d+"|"playerId"/)
    }
    const result = responses[0]!.body
    type Side = { heroes: { heroId: string; damage: number }[] }
    const heroes = (result.matchups as { home: Side; away: Side | null }[])
      .flatMap(m => (m.away ? [m.home, m.away] : [m.home]))
      .flatMap(side => side.heroes)
    expect(heroes.every(hero => Number.isInteger(hero.damage))).toBe(true)
    // 104 rushing yards + 1 passing yard = 10.44 exact, shown as 10
    expect(heroes.find(hero => hero.heroId === party!.lineup!.Mage.toString())?.damage).toBe(10)
  })
})
