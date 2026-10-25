import mongoose from 'mongoose'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { assignTraits, type PoolCandidate } from '../src/modules/heroes/pool.js'
import { CROSSOVER_V1 } from '../src/modules/scoring/rulesets.js'
import { NflGameModel } from '../src/modules/stats/stats.models.js'
import { SEASON, seedCrossover } from './crossoverSeed.js'
import { buildTestApp, signToken } from './helpers.js'
import { as, draftedLeague, host, type Player } from './leagueHelpers.js'
import { seedStats } from './statsSeed.js'

const alice = as('auth0|alice')
const crest = { emblem: 'crown', banner: 'crimson' }

interface ListedHero {
  id: string
  heroClass: string
  level: number | null
  levelRange: unknown
  traits: string[]
  partyId: string | null
  player?: { name: string; team: string; position: string }
}

const leagueInput = (overrides: object = {}) => ({
  name: 'Sunday Crossover',
  visibility: 'private',
  cadence: 'daily',
  maxParties: 4,
  mode: 'crossover',
  party: { name: 'Host Party', crest },
  ...overrides
})

async function crossoverLeague(members: readonly Player[] = [alice]) {
  const created = await host.post('/api/leagues', leagueInput())
  expect(created.status).toBe(201)
  const { id, pin } = created.body as { id: string; pin: string }
  for (const [i, member] of members.entries()) {
    await member.post('/api/leagues/join', { pin, party: { name: `Member ${String(i)}`, crest } })
  }
  return id
}

async function scheduleDraft(id: string) {
  const res = await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })
  expect(res.status).toBe(200)
}

async function runDraft(id: string) {
  await LeagueModel.updateOne({ _id: id }, { $set: { draftAt: new Date(Date.now() - 1000) } })
  await host.get(`/api/leagues/${id}`)
}

const heroesOf = async (id: string) => (await host.get(`/api/leagues/${id}/heroes`)).body as ListedHero[]

describe('creating a Crossover league', () => {
  beforeEach(async () => {
    await seedCrossover()
  })

  it('is weekly, on the Crossover ruleset, whatever cadence was sent', async () => {
    const res = await host.post('/api/leagues', leagueInput())
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ mode: 'crossover', cadence: 'weekly', rulesetVersion: CROSSOVER_V1.version })
  })

  it('is refused until Crossover is switched on', async () => {
    const off = buildTestApp({ crossoverEnabled: false })
    const res = await request(off).post('/api/leagues').set('Authorization', await signToken(host.sub)).send(leagueInput())
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('Crossover leagues aren’t available yet')
  })

  it('stays weekly', async () => {
    const id = await crossoverLeague()
    expect((await host.patch(`/api/leagues/${id}`, { cadence: 'daily' })).status).toBe(400)
    expect((await host.patch(`/api/leagues/${id}`, { name: 'Renamed' })).status).toBe(200)
  })
})

describe('the Crossover calendar', () => {
  it('needs this season’s NFL schedule', async () => {
    const res = await host.post('/api/leagues', leagueInput())
    expect(res.status).toBe(409)
    expect(res.body.error.message).toMatch(/schedule isn’t available yet/)
  })

  it('needs at least 4 weeks left through week 17', async () => {
    await seedCrossover({ nextWeek: 15 })
    const res = await host.post('/api/leagues', leagueInput())
    expect(res.status).toBe(409)
    expect(res.body.error.message).toMatch(/Too little of the NFL season is left/)

    await NflGameModel.deleteMany({})
    await seedScheduleOnly(14)
    expect((await host.post('/api/leagues', leagueInput())).status).toBe(201)
  })

  it('checks again when the draft is scheduled', async () => {
    await seedCrossover({ nextWeek: 14 })
    const id = await crossoverLeague()
    // Week 14 kicks off in 2 days; a draft after it leaves only weeks 15-17.
    const res = await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3 * 86_400_000).toISOString() })
    expect(res.status).toBe(409)
  })
})

/** Just a schedule whose next week is `nextWeek` (players and stats already seeded or not needed). */
async function seedScheduleOnly(nextWeek: number) {
  const start = Date.now() + 2 * 86_400_000
  await NflGameModel.insertMany(
    Array.from({ length: 18 }, (_, i) => ({
      _id: `${String(SEASON)}_${String(i + 1)}`,
      season: SEASON,
      seasonType: 'REG',
      week: i + 1,
      kickoff: new Date(start + (i + 1 - nextWeek) * 7 * 86_400_000),
      homeTeam: 'KC',
      awayTeam: 'BUF'
    }))
  )
}

describe('the Crossover hero pool', () => {
  beforeEach(async () => {
    await seedCrossover()
  })

  it('shows each hero’s real player, in the class of their position', async () => {
    const id = await crossoverLeague()
    await scheduleDraft(id)
    const heroes = await heroesOf(id)
    expect(heroes.length).toBeGreaterThanOrEqual(CROSSOVER_V1.pool.minPerParty * 2)
    const classOf = { QB: 'Mage', RB: 'Warrior', WR: 'Ranger', TE: 'Rogue', DEF: 'Paladin' } as Record<string, string>
    for (const hero of heroes) {
      expect(hero.player).toBeDefined()
      expect(classOf[hero.player!.position]).toBe(hero.heroClass)
      // Known players: everyone has a Level, nobody is a mystery recruit.
      expect(hero.level).not.toBeNull()
      expect(hero.levelRange).toBeNull()
    }
    expect(heroes.find(hero => hero.player?.name === 'QB Player 0')).toMatchObject({ level: 10, player: { team: 'KC', position: 'QB' } })
    expect(heroes.find(hero => hero.player?.position === 'DEF' && hero.player.team === 'KC')?.player?.name).toBe('Kansas City Chiefs')
  })

  it('ranks by this season, blended with last season (or a Level 1 start) worth 3 games', async () => {
    const id = await crossoverLeague()
    await scheduleDraft(id)
    const heroes = await heroesOf(id)
    const byName = (name: string) => heroes.find(hero => hero.player?.name === name)
    // One game this season (2 points), but 50 a game last season: a Level 10.
    expect(byName('Returning Star')).toMatchObject({ level: 10 })
    // The rookie's three games (25 a game) are blended with a Level 1 start: in the pool, below proven
    // receivers, and with no last season, no traits.
    expect(byName('Rookie Receiver')?.level).toBeLessThanOrEqual(5)
    expect(byName('Rookie Receiver')?.traits).toEqual([])
    // One 35-point game and no real history: a backup, not a star.
    const fluke = byName('One Game Wonder')
    if (fluke) expect(fluke.level).toBeLessThanOrEqual(2)
    // 5 a game last season, 40 this season: ranked by this season.
    expect(byName('Breakout Receiver')).toMatchObject({ level: 10 })
    // A traded player shows his latest team.
    expect(byName('Traded End')?.player?.team).toBe('DET')
    // Veterans with a last season get traits, as in Classic.
    expect(heroes.some(hero => hero.traits.includes('steadfast'))).toBe(true)
    expect(heroes.some(hero => hero.traits.includes('wild'))).toBe(true)
  })

  it('drafts 14-player rosters into football positions', async () => {
    const id = await crossoverLeague()
    await scheduleDraft(id)
    await runDraft(id)
    const league = await LeagueModel.findById(id)
    expect(league?.status).toBe('active')
    // Real NFL weeks: the first starting after the draft (week 8 in the seed) through week 17.
    expect(league?.nflWeeks?.map(week => week.nflWeek)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17])
    expect(league?.schedule).toHaveLength(10)

    const heroById = new Map((await HeroModel.find({ leagueId: id })).map(hero => [hero.id, hero]))
    for (const party of await PartyModel.find({ leagueId: id })) {
      const roster = [...heroById.values()].filter(hero => hero.partyId?.equals(party._id))
      expect(roster).toHaveLength(14)
      expect(roster.filter(hero => hero.heroClass === 'Paladin').length).toBeLessThanOrEqual(2)
      const slotClass = new Map(party.lineup!.map(entry => [entry.slot, heroById.get(entry.heroId.toString())!.heroClass]))
      expect(Object.fromEntries(slotClass)).toMatchObject({
        qb: 'Mage',
        rb1: 'Warrior',
        rb2: 'Warrior',
        wr1: 'Ranger',
        wr2: 'Ranger',
        te: 'Rogue',
        def: 'Paladin'
      })
      expect(['Warrior', 'Ranger', 'Rogue']).toContain(slotClass.get('flex'))
    }
    const lineup = (await alice.get(`/api/leagues/${id}/lineup`)).body as { slots: { label: string }[] }
    expect(lineup.slots.map(slot => slot.label)).toEqual(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DEF'])
  })
})

describe('traits', () => {
  it('go only to players with a previous season, ranked among those who have one', () => {
    const candidate = (id: string, volatility?: number, ceiling = 0): PoolCandidate => ({
      sourceKind: 'player',
      sourceId: id,
      heroClass: 'Ranger',
      ppg: 10,
      ...(volatility === undefined ? {} : { volatility, ceiling })
    })
    const traits = assignTraits([
      candidate('a-rookie'),
      candidate('b-rookie'),
      candidate('c-rookie'),
      candidate('steady', 0.1, 10),
      candidate('middle', 0.5, 20),
      candidate('swingy', 0.9, 30)
    ])
    expect(Object.fromEntries(traits)).toEqual({
      'a-rookie': [],
      'b-rookie': [],
      'c-rookie': [],
      steady: ['steadfast'],
      middle: [],
      swingy: ['wild', 'mighty']
    })
  })
})

describe('Classic', () => {
  it('never shows players', async () => {
    await seedStats()
    const id = await draftedLeague([alice])
    const heroes = await heroesOf(id)
    expect(heroes.length).toBeGreaterThan(0)
    expect(JSON.stringify(heroes)).not.toContain('"player"')
    expect(await HeroModel.countDocuments({ leagueId: id, player: mongoose.trusted({ $ne: null }) })).toBe(0)
  })
})
