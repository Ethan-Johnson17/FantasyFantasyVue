import mongoose from 'mongoose'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { HERO_CLASSES, type HeroClass } from '../src/modules/heroes/classes.js'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { CROSSOVER_V1 } from '../src/modules/scoring/rulesets.js'
import { ENCOUNTERS, encounterFor, encounterMultiplier, type Encounter } from '../src/modules/season/encounters.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { DefenseWeekStatModel, NflGameModel, PlayerWeekStatModel, StatsImportModel } from '../src/modules/stats/stats.models.js'
import { alice, draftedCrossover, fixedRoster, freeAgent, kickOff, QUEST_PARTY, type RosterKey } from './crossoverLeague.js'
import { SEASON, seedCrossover } from './crossoverSeed.js'
import { buildTestApp } from './helpers.js'
import { host } from './leagueHelpers.js'

const quest = CROSSOVER_V1.quest!
const classDamage = (points: number, heroClass: HeroClass) => points * CROSSOVER_V1.lineup.classMultipliers[heroClass]

beforeEach(async () => {
  await seedCrossover()
})

/** A drafted league with Alice's fixed roster, and no traits, so synergies stay out of the arithmetic. */
async function league() {
  const id = await draftedCrossover()
  await HeroModel.updateMany({ leagueId: id }, { $set: { traits: [] } })
  const roster = await fixedRoster(id)
  const seed = (await LeagueModel.findById(id).select('+seed'))!.seed!
  return { id, ...roster, encounter: encounterFor(seed, 1) }
}

/** Plays game week 1 (NFL week 8) with these points for Alice's heroes; nobody else scores. */
async function playWeekOne(leagueId: string, ids: Record<RosterKey, string>, points: Partial<Record<RosterKey, number>>) {
  for (const [key, value] of Object.entries(points) as [RosterKey, number][]) {
    const hero = (await HeroModel.findById(ids[key]).select('+source'))!
    const base = { season: SEASON, seasonType: 'REG', week: 8, gameId: `w8-${hero.id}`, opponent: 'BUF' }
    if (hero.source.kind === 'defense') {
      await DefenseWeekStatModel.create({ ...base, seasonType: 'REG' as const, team: hero.source.id, stats: { sacks: value, interceptions: 0, fumbleRecoveries: 0, touchdowns: 0, safeties: 0, blockedKicks: 0, pointsAllowed: 24 } })
    } else {
      // Their latest game this season as a template (the seeded rookie hasn't played every week).
      const [line] = await PlayerWeekStatModel.find({ season: SEASON, playerId: hero.source.id }).sort({ week: -1 }).limit(1).lean()
      const { _id, ...week7 } = line!
      await PlayerWeekStatModel.create({ ...week7, ...base, seasonType: 'REG' as const, team: week7.team, stats: { ...week7.stats, rushingYards: value * 10 } })
    }
  }
  const past = new Date(Date.now() - 60_000)
  await LeagueModel.updateOne({ _id: leagueId }, { $set: { 'nflWeeks.0.finalAt': past, weekOneAt: past } })
  await NflGameModel.updateMany({ season: SEASON, week: 8 }, { $set: { homeScore: 20, awayScore: 17 } })
  await StatsImportModel.create({ _id: SEASON, importedAt: new Date(), playerWeeks: 1, defenseWeeks: 1, games: 1, finalGames: 1 })
  await host.get(`/api/leagues/${leagueId}`)
  return (await WeekResultModel.findOne({ leagueId, week: 1 }))!
}

const CLASS_OF: Record<RosterKey, HeroClass> = {
  qb: 'Mage',
  rb1: 'Warrior',
  rb2: 'Warrior',
  wr1: 'Ranger',
  wr2: 'Ranger',
  te: 'Rogue',
  flex: 'Warrior',
  def: 'Paladin',
  'bench-qb': 'Mage',
  'bench-rb': 'Warrior',
  'bench-wr': 'Ranger',
  'bench-te': 'Rogue'
}
const questDamage = (key: RosterKey, points: number, encounter: Encounter) =>
  classDamage(points, CLASS_OF[key]) * encounterMultiplier(encounter, CLASS_OF[key], quest)

describe('encounters', () => {
  it('cover every pair of classes once as weaknesses, and resist each class twice', () => {
    expect(ENCOUNTERS).toHaveLength(10)
    const pairs = new Set(ENCOUNTERS.map(encounter => [...encounter.weak].sort().join('+')))
    expect(pairs.size).toBe(10)
    for (const heroClass of HERO_CLASSES) {
      expect(ENCOUNTERS.filter(encounter => encounter.resists === heroClass)).toHaveLength(2)
      for (const encounter of ENCOUNTERS) if (encounter.resists === heroClass) expect(encounter.weak).not.toContain(heroClass)
    }
  })

  it('come up in a seeded order, all ten before any repeats', () => {
    const weeks = Array.from({ length: 10 }, (_, i) => encounterFor('seed-a', i + 1).name)
    expect(new Set(weeks).size).toBe(10)
    expect(encounterFor('seed-a', 11).name).toBe(weeks[0])
    expect(Array.from({ length: 10 }, (_, i) => encounterFor('seed-a', i + 1).name)).toEqual(weeks)
    // Each league's order comes from its own seed.
    expect(Array.from({ length: 10 }, (_, i) => encounterFor('seed-b', i + 1).name)).not.toEqual(weeks)
  })
})

describe('the two scoreboards', () => {
  it('score Gridiron from the football lineup and Quest from the Quest party against the encounter', async () => {
    const { id, ids, encounter } = await league()
    // Football starters: qb, rb2, wr1, te play; the others are on bye. bench-rb plays for the Quest only.
    // bench-wr isn't in either lineup: his 30 points count for neither board.
    const points = { qb: 20, rb2: 10, wr1: 10, te: 10, 'bench-rb': 10, 'bench-wr': 30 } as const
    const result = await playWeekOne(id, ids, points)
    const matchup = result.matchups[0]!
    const mine = [matchup.home, matchup.away!].find(side => side.heroes.some(line => line.heroId.toString() === ids.qb))!

    expect(mine.gridiron?.total).toBe(20 + 10 + 10 + 10)
    const expected = QUEST_PARTY.reduce((sum, key) => sum + questDamage(key, points[key as keyof typeof points], encounter), 0)
    expect(mine.total).toBeCloseTo(expected, 1)
    expect(result.encounter).toMatchObject({ name: encounter.name, resists: encounter.resists })
    expect(mine.heroes.filter(line => line.quest).map(line => line.heroId.toString()).sort()).toEqual(QUEST_PARTY.map(key => ids[key]).sort())

    // Nobody else scored, so Alice sweeps both boards: two results.
    expect(matchup.gridironOutcome).not.toBeNull()
    const standings = (await host.get(`/api/leagues/${id}/standings`)).body as { name: string; wins: number; losses: number; totalDamage: number }[]
    expect(standings.find(row => row.name === 'Alice Party')).toMatchObject({ wins: 2, losses: 0, totalDamage: 50 })
    expect(standings.find(row => row.name === 'Host Party')).toMatchObject({ wins: 0, losses: 2 })
  })

  it('count natural 20s and natural 1s in the Quest, but never on Gridiron', async () => {
    const { id, ids, encounter } = await league()
    // 40 points: a Mage's natural 20 (31+ damage). A receiver's 1 point: a Ranger's natural 1 (2 or less).
    const result = await playWeekOne(id, ids, { qb: 40, wr1: 1 })
    const side = [result.matchups[0]!.home, result.matchups[0]!.away!].find(entry => entry.heroes.some(line => line.heroId.toString() === ids.qb))!
    const line = (key: RosterKey) => side.heroes.find(entry => entry.heroId.toString() === ids[key])!
    expect(line('qb').counted).toBeCloseTo(questDamage('qb', 40, encounter) * quest.natural20Multiplier, 2)
    expect(line('wr1').counted).toBe(0)
    // Gridiron counts plain points, crits or not.
    expect(side.gridiron?.total).toBe(41)

    const view = (await alice.get(`/api/leagues/${id}/results/1`)).body as {
      matchups: { home: { heroes: { heroId: string; crit: string | null; quest: boolean; damage: number; points?: number }[] }; away: { heroes: { heroId: string; crit: string | null; quest: boolean; points?: number }[] } | null }[]
      encounter: { name: string } | null
    }
    const lines = [...view.matchups[0]!.home.heroes, ...(view.matchups[0]!.away?.heroes ?? [])]
    expect(lines.find(entry => entry.heroId === ids.qb)).toMatchObject({ crit: 'success', quest: true, points: 40 })
    expect(lines.find(entry => entry.heroId === ids.wr1)).toMatchObject({ crit: 'fail', quest: true })
    expect(view.encounter?.name).toBe(encounter.name)
  })

  it('show what a hero outside the Quest party would have dealt, with no crit', async () => {
    const { id, ids } = await league()
    await playWeekOne(id, ids, { 'bench-wr': 30 })
    const detail = (await alice.get(`/api/leagues/${id}/heroes/${ids['bench-wr']}`)).body as { history: { week: number; damage: number; crit: string | null }[] }
    expect(detail.history[0]).toMatchObject({ week: 1, damage: Math.round(classDamage(30, 'Ranger')), crit: null })
  })
})

describe('standings over two boards', () => {
  it('count a split as 1-1 and break ties on Gridiron points', async () => {
    const { id } = await league()
    const parties = await PartyModel.find({ leagueId: id })
    const [a, b] = parties
    const board = (total: number) => ({ total, top: total, bench: 0 })
    const side = (partyId: mongoose.Types.ObjectId, questTotal: number, gridiron: number) => ({ partyId, total: questTotal, top: questTotal, bench: 0, heroes: [], gridiron: board(gridiron) })
    await WeekResultModel.create({
      leagueId: id,
      week: 1,
      // a wins the Quest, b wins Gridiron: one result each.
      matchups: [{ home: side(a!._id, 90, 80), away: side(b!._id, 70, 110), outcome: 'home', gridironOutcome: 'away' }]
    })
    await LeagueModel.updateOne({ _id: id }, { $set: { resolvedWeeks: 1 } })
    const standings = (await host.get(`/api/leagues/${id}/standings`)).body as { partyId: string; wins: number; losses: number; totalDamage: number }[]
    // Level on wins; b's 110 Gridiron points beat a's 80.
    expect(standings.map(row => [row.partyId, row.wins, row.losses, row.totalDamage])).toEqual([
      [b!.id, 1, 1, 110],
      [a!.id, 1, 1, 80]
    ])
  })
})

describe('the Quest party', () => {
  it('is any 5 heroes from the roster, each once', async () => {
    const { id, ids } = await league()
    const set = (heroIds: string[]) => alice.put(`/api/leagues/${id}/quest-party`, { heroIds })
    expect((await set([ids.def, ids['bench-qb'], ids['bench-te'], ids.flex, ids.wr2])).status).toBe(200)
    const lineup = (await alice.get(`/api/leagues/${id}/lineup`)).body as { questParty: string[]; questPartySize: number }
    expect(lineup).toMatchObject({ questPartySize: 5 })
    expect(lineup.questParty.sort()).toEqual([ids.def, ids['bench-qb'], ids['bench-te'], ids.flex, ids.wr2].sort())

    expect((await set([ids.def, ids.flex, ids.wr2, ids.rb1])).status).toBe(400) // 4 heroes
    expect((await set([ids.def, ids.def, ids.flex, ids.wr2, ids.rb1])).status).toBe(400) // the same hero twice
    const outsider = await freeAgent(id, 'Mage', 'PHI', Object.values(ids))
    expect((await set([outsider, ids.flex, ids.wr2, ids.rb1, ids.def])).status).toBe(400) // not Alice's
  })

  it('keeps kickoff locks: a player whose game started can’t join or leave it', async () => {
    const { id, ids } = await league()
    await kickOff('KC')
    // The KC quarterback is in the party and has kicked off: he can't leave.
    const leave = await alice.put(`/api/leagues/${id}/quest-party`, { heroIds: [ids['bench-qb'], ids.rb2, ids['bench-rb'], ids.wr1, ids.te] })
    expect(leave.status).toBe(409)
    expect(leave.body.error.message).toMatch(/is locked/)
    // Swapping players yet to play is fine: the SF receiver for the PHI running back.
    expect((await alice.put(`/api/leagues/${id}/quest-party`, { heroIds: [ids.qb, ids['bench-wr'], ids['bench-rb'], ids.wr1, ids.te] })).status).toBe(200)
    // Once PHI-SF kicks off, the PHI running back (now outside the party) can't join it.
    await kickOff('PHI')
    const join = await alice.put(`/api/leagues/${id}/quest-party`, { heroIds: [ids.qb, ids.rb2, ids['bench-rb'], ids.wr1, ids['bench-qb']] })
    expect(join.status).toBe(409)
  })

  it('leads with the Champion, who must be in it and is withdrawn when left out', async () => {
    const { id, ids } = await league()
    // The GB receiver starts at football but isn't in the Quest party.
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: ids.wr2 })).status).toBe(400)
    // The KC running back is only on the football bench, but in the Quest party.
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: ids['bench-rb'] })).status).toBe(200)
    // Changing the football lineup doesn't touch the Champion.
    const lineup = (await alice.get(`/api/leagues/${id}/lineup`)).body as { lineup: Record<string, string>; champion: string | null }
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...lineup.lineup, wr2: ids['bench-wr'] })).status).toBe(200)
    expect(((await alice.get(`/api/leagues/${id}/lineup`)).body as { champion: string | null }).champion).toBe(ids['bench-rb'])
    // Leaving the Champion out of the Quest party withdraws them.
    await alice.put(`/api/leagues/${id}/quest-party`, { heroIds: [ids.qb, ids.rb2, ids.def, ids.wr1, ids.te] })
    expect(((await alice.get(`/api/leagues/${id}/lineup`)).body as { champion: string | null }).champion).toBeNull()
  })

  it('is only for Crossover leagues', async () => {
    const { seedStats } = await import('./statsSeed.js')
    const { draftedLeague } = await import('./leagueHelpers.js')
    const { NflPlayerModel } = await import('../src/modules/stats/stats.models.js')
    await Promise.all([NflPlayerModel.deleteMany({}), PlayerWeekStatModel.deleteMany({}), DefenseWeekStatModel.deleteMany({})])
    await seedStats()
    const id = await draftedLeague([alice])
    const res = await alice.put(`/api/leagues/${id}/quest-party`, { heroIds: ['0123456789abcdef01234567'] })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('Only Crossover leagues have a Quest party')
    const lineup = (await alice.get(`/api/leagues/${id}/lineup`)).body as { questParty: unknown; questPartySize: unknown }
    expect(lineup).toMatchObject({ questParty: null, questPartySize: null })
    const matchup = (await alice.get(`/api/leagues/${id}/matchup`)).body as { encounter: unknown; me: { questParty: unknown } }
    expect(matchup.encounter).toBeNull()
    expect(matchup.me.questParty).toBeNull()
  })
})

describe('claims and the Quest party', () => {
  it('put the claimed hero in a dropped member’s place, or the best hero yet to play if they’ve played', async () => {
    const { id, ids, party } = await league()
    const yetToPlay = await freeAgent(id, 'Mage', 'PHI', Object.values(ids))
    // Dropping the PHI running back from the party: the PHI quarterback (yet to play) takes his place.
    expect((await alice.post(`/api/leagues/${id}/claims`, { heroId: yetToPlay, dropHeroId: ids.rb2 })).status).toBe(200)
    expect((await PartyModel.findById(party._id))!.questParty!.map(String)).toContain(yetToPlay)

    // A BUF tight end who has played: the best hero yet to play who isn't in the party steps in instead.
    const played = await freeAgent(id, 'Rogue', 'BUF', [...Object.values(ids), yetToPlay])
    await kickOff('BUF')
    expect((await alice.post(`/api/leagues/${id}/claims`, { heroId: played, dropHeroId: ids.te })).status).toBe(200)
    const after = (await PartyModel.findById(party._id))!.questParty!.map(String)
    expect(after).toHaveLength(5)
    expect(after).not.toContain(played)
    expect(after).not.toContain(ids.te)
  })

  it('refuse dropping a Quest party member whose game has kicked off', async () => {
    const { id, ids } = await league()
    const free = await freeAgent(id, 'Warrior', 'PHI', Object.values(ids))
    await kickOff('KC')
    // The KC running back is on the football bench, but fights in the Quest party.
    const res = await alice.post(`/api/leagues/${id}/claims`, { heroId: free, dropHeroId: ids['bench-rb'] })
    expect(res.status).toBe(409)
  })
})

describe('the matchup preview', () => {
  it('names the week’s encounter, lists the Quest party, and projects both boards', async () => {
    const { id, ids, encounter } = await league()
    const matchup = (await alice.get(`/api/leagues/${id}/matchup`)).body as {
      encounter: { name: string; weak: string[]; resists: string }
      monster: unknown
      me: { questParty: { id: string; projected: number; restingNextWeek: boolean }[]; projectedGridiron: number; projectedTotal: number }
    }
    expect(matchup.encounter).toEqual({ name: encounter.name, weak: [...encounter.weak], resists: encounter.resists })
    expect(matchup.me.questParty.map(hero => hero.id).sort()).toEqual(QUEST_PARTY.map(key => ids[key]).sort())
    expect(matchup.me.projectedGridiron).toBeGreaterThan(0)
    // Quest projection: the party's projections with the encounter's modifiers (no Champion, no traits).
    const heroes = await HeroModel.find({ _id: mongoose.trusted({ $in: QUEST_PARTY.map(key => ids[key]) }) })
    const expected = matchup.me.questParty.reduce((sum, hero) => {
      const heroClass = heroes.find(entry => entry.id === hero.id)!.heroClass
      return sum + (hero.restingNextWeek ? 0 : hero.projected * encounterMultiplier(encounter, heroClass, quest))
    }, 0)
    expect(Math.abs(matchup.me.projectedTotal - expected)).toBeLessThanOrEqual(1)
  })
})

describe('what the app needs to show Crossover', () => {
  it('publishes Crossover’s rules, and whether leagues can be created yet', async () => {
    type Rules = { crossover: { available: boolean; slots: string[]; quest: { partySize: number }; encounters: unknown[] } }
    const on = (await request(buildTestApp()).get('/api/rules')).body as Rules
    expect(on.crossover).toMatchObject({ available: true, slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DEF'], quest: { partySize: 5 } })
    expect(on.crossover.encounters).toHaveLength(10)
    const off = (await request(buildTestApp({ crossoverEnabled: false })).get('/api/rules')).body as Rules
    expect(off.crossover.available).toBe(false)
  })

  it('gives the lineup screen the next encounter and the Quest modifiers', async () => {
    const { id, encounter } = await league()
    const lineup = (await alice.get(`/api/leagues/${id}/lineup`)).body as { quest: { encounter: { name: string }; weakMultiplier: number; classMultipliers: Record<string, number> } }
    expect(lineup.quest).toMatchObject({ encounter: { name: encounter.name }, weakMultiplier: quest.weakMultiplier, classMultipliers: { Rogue: 2.05 } })
  })

  it('labels each week with its NFL week', async () => {
    const { id } = await league()
    const schedule = (await alice.get(`/api/leagues/${id}/schedule`)).body as { week: number; nflWeek: number }[]
    expect(schedule.slice(0, 2).map(week => [week.week, week.nflWeek])).toEqual([
      [1, 8],
      [2, 9]
    ])
  })
})
