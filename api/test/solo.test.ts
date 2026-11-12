import mongoose from 'mongoose'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { SOLO_V1, SOLO_V2 } from '../src/modules/scoring/rulesets.js'
import { monsterMultiplier, type CoopMonster } from '../src/modules/season/campaign.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { DefenseWeekStatModel, NflGameModel, NflPlayerModel, PlayerWeekStatModel, StatsImportModel } from '../src/modules/stats/stats.models.js'
import { SEASON, seedCrossover } from './crossoverSeed.js'
import { buildTestApp, signToken } from './helpers.js'
import { as, host } from './leagueHelpers.js'

/* Solo runs (docs/SOLO_SPEC.md), on the synthetic current season of crossoverSeed.ts: weeks 1-7 played, week 8 next. */

const rules = SOLO_V2.solo!
const alice = as('auth0|alice')
const party = { name: 'Lone Wolves', crest: { emblem: 'crown', banner: 'crimson' } }
const DAY = 24 * 60 * 60 * 1000

interface PoolHero {
  id: string
  name: string
  heroClass: string
  level: number
  cost: number
  price: number | null
  partyId: string | null
  locked: boolean
  traits: string[]
  player?: { name: string; team: string; position: string }
}

/** The seed with weeks before `nextWeek` gone final a week ago, and their data imported. */
async function seedSeason(nextWeek = 8) {
  await seedCrossover({ nextWeek })
  const games = await NflGameModel.find({ season: SEASON, week: mongoose.trusted({ $lt: nextWeek }) })
  await NflGameModel.bulkWrite(
    games.map(game => ({ updateOne: { filter: { _id: game._id }, update: { $set: { kickoff: new Date(game.kickoff.getTime() - 7 * DAY) } } } }))
  )
  await StatsImportModel.create({ _id: SEASON, importedAt: new Date(), playerWeeks: 1, defenseWeeks: 1, games: 1, finalGames: 1 })
}

async function startRun(player = host) {
  const res = await player.post('/api/leagues/solo', { party })
  expect(res.status).toBe(201)
  return res.body.id as string
}

const soloOf = async (id: string, player = host) => (await player.get(`/api/leagues/${id}/solo`)).body
const poolOf = async (id: string) => (await soloOf(id)).pool as PoolHero[]

/** Heroes of each class at a Level, from the pool, skipping any already picked. */
function pick(pool: readonly PoolHero[], wants: readonly { heroClass: string; level?: number; team?: string }[]) {
  const taken = new Set<string>()
  return wants.map(want => {
    const hero = pool.find(
      candidate =>
        !taken.has(candidate.id) &&
        candidate.heroClass === want.heroClass &&
        (want.level === undefined || candidate.level === want.level) &&
        (want.team === undefined || candidate.player?.team === want.team)
    )
    if (!hero) throw new Error(`No ${want.heroClass} at Level ${String(want.level)} on ${String(want.team)}`)
    taken.add(hero.id)
    return hero
  })
}

/**
 * A party of 107 gold: a Level 10 Mage and seven Level 1s (the seed's eight defenses start at Level 2, so none). The
 * Quest party is the first five. Week 8: KC-BUF and PHI-SF play; DET, BAL, GB and DAL are on bye.
 */
async function buildParty(id: string) {
  const pool = await poolOf(id)
  const heroes = pick(pool, [
    { heroClass: 'Mage', level: 10 },
    { heroClass: 'Warrior', level: 1 },
    { heroClass: 'Ranger', level: 1 },
    { heroClass: 'Rogue', level: 1 },
    { heroClass: 'Warrior', level: 1 },
    { heroClass: 'Ranger', level: 1 },
    { heroClass: 'Rogue', level: 1 },
    { heroClass: 'Mage', level: 1 }
  ])
  return { heroes, heroIds: heroes.map(hero => hero.id), questParty: heroes.slice(0, 5).map(hero => hero.id) }
}

async function confirmedRun() {
  const id = await startRun()
  const built = await buildParty(id)
  const res = await host.post(`/api/leagues/${id}/solo/confirm`, { heroIds: built.heroIds, questParty: built.questParty, champion: built.heroIds[0] })
  expect(res.status).toBe(200)
  return { id, ...built }
}

beforeEach(async () => {
  await seedSeason()
})

describe('starting a Solo run', () => {
  it('is refused until Solo is switched on (SOLO_ENABLED)', async () => {
    const off = buildTestApp({ soloEnabled: false })
    const res = await request(off).post('/api/leagues/solo').set('Authorization', await signToken('auth0|host')).send({ party })
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('Solo runs aren’t available yet')
    expect((await request(off).get('/api/rules')).body.solo.available).toBe(false)
  })

  it('creates a private run of one party, with no PIN to share', async () => {
    const res = await host.post('/api/leagues/solo', { party })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ mode: 'solo', status: 'forming', visibility: 'private', maxParties: 1, partyCount: 1, rulesetVersion: 5 })
    expect(res.body.pin).toBeUndefined()
    expect(res.body.parties).toHaveLength(1)
    expect(res.body.parties[0]).toMatchObject({ name: 'Lone Wolves', isMine: true })
    const mine = (await host.get('/api/leagues/mine')).body
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ mode: 'solo', standing: null })
    expect(mine[0].pin).toBeUndefined()
  })

  it('moves a run still being built to the new budget, and leaves confirmed runs on theirs', async () => {
    const id = await startRun()
    await LeagueModel.updateOne({ _id: id }, { $set: { rulesetVersion: SOLO_V1.version } }, { overwriteImmutable: true })
    expect((await soloOf(id)).cap).toBe(350)
    expect((await LeagueModel.findById(id))!.rulesetVersion).toBe(SOLO_V2.version)

    await host.post(`/api/leagues/${id}/cancel`)
    const { id: confirmed } = await confirmedRun()
    await LeagueModel.updateOne({ _id: confirmed }, { $set: { rulesetVersion: SOLO_V1.version } }, { overwriteImmutable: true })
    expect((await soloOf(confirmed)).cap).toBe(116)
    expect((await LeagueModel.findById(confirmed))!.rulesetVersion).toBe(SOLO_V1.version)
  })

  it('confirms a run still being built on the new budget', async () => {
    const id = await startRun()
    const pool = await poolOf(id)
    const { heroIds } = await buildParty(id)
    // Started under the first budget, and not opened since
    await LeagueModel.updateOne({ _id: id }, { $set: { rulesetVersion: SOLO_V1.version } }, { overwriteImmutable: true })
    // 305 gold: over the first budget's 116, within 350
    const stars = pick(pool, [{ heroClass: 'Warrior', level: 10 }, { heroClass: 'Ranger', level: 10 }])
    const ids = [heroIds[0]!, ...stars.map(hero => hero.id), ...heroIds.slice(3)]
    const res = await host.post(`/api/leagues/${id}/solo/confirm`, { heroIds: ids, questParty: ids.slice(0, 5), champion: null })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ cap: 350, spent: 305 })
    expect((await LeagueModel.findById(id))!.rulesetVersion).toBe(SOLO_V2.version)
  })

  it('opens with the whole pool: every player who has played, priced by Level squared', async () => {
    const id = await startRun()
    const solo = await soloOf(id)
    expect(solo).toMatchObject({ confirmed: false, cap: 350, rosterSize: 8, partySize: 5, paladinLimit: 2, spent: 0, swapsLeft: null, poolWeek: 7 })
    expect(solo.costs).toEqual([1, 4, 9, 16, 25, 36, 49, 64, 81, 100])
    // 30 of each position, the five special players, and eight team defenses
    expect(solo.pool).toHaveLength(30 * 4 + 5 + 8)
    for (const hero of solo.pool as PoolHero[]) {
      expect(hero.cost).toBe(hero.level ** 2)
      expect(hero.player).toBeDefined()
      expect(hero.partyId).toBeNull()
    }
    // Deciles of each class: three of the 30 quarterbacks at every Level
    const mages = (solo.pool as PoolHero[]).filter(hero => hero.heroClass === 'Mage')
    for (let level = 1; level <= 10; level++) expect(mages.filter(hero => hero.level === level)).toHaveLength(3)
    // Confirmed now, the run plays NFL weeks 8-17: windows of 2, 2, 2, 3 and 1 weeks
    expect(solo.start).toEqual({ firstWeek: 8, weeks: 10, windows: [2, 2, 2, 3, 1] })
    expect(solo.startProblem).toBeNull()
    expect(solo.monsters).toHaveLength(5)
    expect(solo.monsters[4]).toMatchObject({ name: 'The Dragon Tyrant', boss: true })
    // Nothing about the run's seed or season is sent
    expect(JSON.stringify(solo)).not.toMatch(/"seed"|"season"/)
  })

  it('allows one run at a time per account', async () => {
    const id = await startRun()
    const again = await host.post('/api/leagues/solo', { party })
    expect(again.status).toBe(409)
    expect(again.body.error.message).toBe('You already have a Solo run in progress: finish or abandon it first')
    // Someone else can start their own
    await startRun(alice)
    // Canceling a run still being built frees the account to start another
    expect((await host.post(`/api/leagues/${id}/cancel`)).body.status).toBe('canceled')
    await startRun()
  })

  it('is refused once fewer than 8 weeks are left', async () => {
    await NflGameModel.deleteMany({})
    await seedSeasonGamesFrom(11)
    const res = await host.post('/api/leagues/solo', { party })
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('Too little of the NFL season is left: Solo runs start by NFL week 10, so they open again next season')
  })

  it('opens from NFL week 2, once week 1 has gone final', async () => {
    await NflGameModel.deleteMany({})
    await seedSeasonGamesFrom(1)
    const res = await host.post('/api/leagues/solo', { party })
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('Solo opens once NFL week 1 has gone final: heroes are bought from players who have played')
  })

  it('stays private: not hosted as a league, never joined by PIN, and seen only by its player', async () => {
    const hosted = await host.post('/api/leagues', {
      name: 'Nope',
      visibility: 'private',
      cadence: 'weekly',
      maxParties: 2,
      mode: 'solo',
      party
    })
    expect(hosted.status).toBe(400)
    const id = await startRun()
    const { pin } = (await LeagueModel.findById(id))!
    expect((await alice.get(`/api/leagues/pin/${pin}`)).status).toBe(404)
    expect((await alice.post('/api/leagues/join', { pin, party: { name: 'Crasher', crest: party.crest } })).status).toBe(404)
    expect((await alice.get(`/api/leagues/${id}`)).status).toBe(404)
    expect((await alice.get(`/api/leagues/${id}/solo`)).status).toBe(404)
    // No chat, no draft, no league settings
    expect((await host.get(`/api/leagues/${id}/chat`)).status).toBe(404)
    expect((await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })).status).toBe(400)
    expect((await host.patch(`/api/leagues/${id}`, { name: 'Renamed' })).status).toBe(400)
  })
})

/** Week w's games kick off (w - next) weeks from two days from now; weeks before `next` are final a week ago. */
async function seedSeasonGamesFrom(next: number) {
  const start = Date.now() + 2 * DAY
  await NflGameModel.insertMany(
    Array.from({ length: 18 }, (_, i) => i + 1).map(week => ({
      _id: `${String(SEASON)}_${String(week).padStart(2, '0')}_G0`,
      season: SEASON,
      seasonType: 'REG',
      week,
      kickoff: new Date(start + (week - next) * 7 * DAY - (week < next ? 7 * DAY : 0)),
      homeTeam: 'KC',
      awayTeam: 'BUF',
      homeScore: week < next ? 24 : null,
      awayScore: week < next ? 17 : null
    }))
  )
}

describe('confirming the party', () => {
  it('checks the roster size, the Quest party and the Champion', async () => {
    const id = await startRun()
    const { heroIds, questParty } = await buildParty(id)
    const confirm = (body: object) => host.post(`/api/leagues/${id}/solo/confirm`, { heroIds, questParty, champion: null, ...body })
    expect((await confirm({ heroIds: heroIds.slice(0, 7) })).body.error.message).toBe('Pick 8 different heroes')
    expect((await confirm({ heroIds: [...heroIds.slice(0, 7), heroIds[0]] })).body.error.message).toBe('Pick 8 different heroes')
    expect((await confirm({ questParty: questParty.slice(0, 4) })).body.error.message).toBe('Pick a Quest party of 5 from your heroes')
    expect((await confirm({ questParty: [...questParty.slice(0, 4), '0123456789abcdef01234567'] })).status).toBe(400)
    expect((await confirm({ champion: heroIds[7] })).body.error.message).toBe('Your Champion must be in your Quest party')
    expect((await confirm({ heroIds: [...heroIds.slice(0, 7), '0123456789abcdef01234567'] })).body.error.message).toBe(
      'Pick heroes from this run’s pool'
    )
    expect((await LeagueModel.findById(id))!.status).toBe('forming')
  })

  it('keeps the party under the cap and to two Paladins', async () => {
    const id = await startRun()
    const pool = await poolOf(id)
    const { heroIds, questParty } = await buildParty(id)
    const confirm = (ids: string[], quest = questParty) => host.post(`/api/leagues/${id}/solo/confirm`, { heroIds: ids, questParty: quest, champion: null })
    // Four Level 10s and four Level 1s: 404 gold
    const stars = pick(pool, [{ heroClass: 'Warrior', level: 10 }, { heroClass: 'Ranger', level: 10 }, { heroClass: 'Rogue', level: 10 }])
    const fourStars = [heroIds[0]!, ...stars.map(hero => hero.id), ...heroIds.slice(4)]
    const over = await confirm(fourStars, fourStars.slice(0, 5))
    expect(over.status).toBe(400)
    expect(over.body.error.message).toBe('Your party costs 404 gold; the cap is 350')
    // Three Level 10s and five Level 1s fit: 305 gold

    // Three team defenses
    const paladins = pool.filter(hero => hero.heroClass === 'Paladin').slice(0, 3)
    const three = await confirm([...heroIds.slice(0, 5), ...paladins.map(hero => hero.id)])
    expect(three.status).toBe(400)
    expect(three.body.error.message).toBe('A party can have at most 2 Paladins')
  })

  it('starts the campaign with the next NFL week, at today’s prices, against monsters set from the best party', async () => {
    const id = await startRun()
    const { heroIds, questParty } = await buildParty(id)
    const res = await host.post(`/api/leagues/${id}/solo/confirm`, { heroIds, questParty, champion: heroIds[0] })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'active', confirmed: true, spent: 107, swapsLeft: 2, start: null })
    const mine = (res.body.pool as PoolHero[]).filter(hero => hero.partyId !== null)
    expect(mine.map(hero => hero.id).sort()).toEqual([...heroIds].sort())
    expect(mine.map(hero => hero.price).sort((a, b) => b! - a!)).toEqual([100, 1, 1, 1, 1, 1, 1, 1])

    const league = (await LeagueModel.findById(id))!
    expect(league.nflWeeks?.map(week => week.nflWeek)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17])
    expect(league.weekOneAt?.getTime()).toBe(league.nflWeeks?.[0]?.finalAt.getTime())
    const monsters = league.campaign!.monsters
    expect(monsters.map(monster => monster.deadline)).toEqual([2, 4, 6, 9, 10])
    // HP per week of the window stays within the seeded variation of one strength
    const perWeek = monsters.map((monster, index) => monster.hp / [2, 2, 2, 3, 1][index]!)
    expect(Math.max(...perWeek) / Math.min(...perWeek)).toBeLessThanOrEqual((1 + rules.hpVariation) / (1 - rules.hpVariation) + 0.01)
    // The shown monsters are the ones fought
    expect(res.body.monsters.map((monster: { name: string }) => monster.name)).toEqual(monsters.map(monster => monster.name))

    const lineup = (await host.get(`/api/leagues/${id}/lineup`)).body
    expect(lineup).toMatchObject({ slots: [], lineup: null, champion: heroIds[0], questPartySize: 5 })
    expect([...lineup.questParty].sort()).toEqual([...questParty].sort())
    // The Quest board shows the campaign's first monster
    expect(lineup.quest.encounter.name).toBe(monsters[0]!.name)

    const campaign = (await host.get(`/api/leagues/${id}/campaign`)).body
    expect(campaign).toMatchObject({ abandoned: false, lives: 3, livesLeft: 3, outcome: 'ongoing', chapter: 1 })
    expect((await host.post(`/api/leagues/${id}/solo/confirm`, { heroIds, questParty, champion: null })).status).toBe(409)
  })

  it('gives every run starting the same week monsters of the same strength', async () => {
    const one = await confirmedRun()
    // Alice builds an all Level 1 party: her monsters follow the best party the cap could buy, not hers.
    const id = await startRun(alice)
    const pool = (await soloOf(id, alice)).pool as PoolHero[]
    const cheap = pick(pool, [
      { heroClass: 'Mage', level: 1 },
      { heroClass: 'Warrior', level: 1 },
      { heroClass: 'Ranger', level: 1 },
      { heroClass: 'Rogue', level: 1 },
      { heroClass: 'Warrior', level: 1 },
      { heroClass: 'Mage', level: 1 },
      { heroClass: 'Ranger', level: 1 },
      { heroClass: 'Rogue', level: 1 }
    ]).map(hero => hero.id)
    expect((await alice.post(`/api/leagues/${id}/solo/confirm`, { heroIds: cheap, questParty: cheap.slice(0, 5), champion: null })).status).toBe(200)
    const strength = async (runId: string) => {
      const monsters = (await LeagueModel.findById(runId))!.campaign!.monsters
      return monsters.reduce((sum, monster) => sum + monster.hp, 0) / 10
    }
    // Only the seeded variation tells them apart (a cheap party's own projection would be a fraction of the best's)
    const ratio = (await strength(one.id)) / (await strength(id))
    const spread = (1 + rules.hpVariation) / (1 - rules.hpVariation)
    expect(ratio).toBeGreaterThan(1 / spread - 0.01)
    expect(ratio).toBeLessThan(spread + 0.01)
  })
})

/** Starts the week 8 game a team plays in. */
async function kickOff(team: string) {
  await NflGameModel.updateOne(
    { season: SEASON, week: 8, $or: [{ homeTeam: team }, { awayTeam: team }] },
    { $set: { kickoff: new Date(Date.now() - 60_000) } }
  )
}

describe('swaps', () => {
  it('release a hero and sign another at today’s price, in the released hero’s place', async () => {
    const { id, heroes, questParty } = await confirmedRun()
    const pool = await poolOf(id)
    // Release the Level 1 Ranger in the Quest party (not yet kicked off), sign a Level 2 Warrior
    const released = heroes[2]!
    const [signed] = pick(
      pool.filter(hero => hero.partyId === null),
      [{ heroClass: 'Warrior', level: 2 }]
    )
    const res = await host.post(`/api/leagues/${id}/solo/swaps`, { releaseHeroId: released.id, signHeroId: signed!.id })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ spent: 107 - 1 + 4, swapsLeft: 1 })
    const after = res.body.pool as PoolHero[]
    expect(after.find(hero => hero.id === signed!.id)).toMatchObject({ price: 4 })
    expect(after.find(hero => hero.id === released.id)).toMatchObject({ partyId: null, price: null })
    const lineup = (await host.get(`/api/leagues/${id}/lineup`)).body
    expect([...lineup.questParty].sort()).toEqual(questParty.map(heroId => (heroId === released.id ? signed!.id : heroId)).sort())
    const moves = (await host.get(`/api/leagues/${id}/moves`)).body
    expect(moves[0]).toMatchObject({ kind: 'swap', added: { heroId: signed!.id }, dropped: { heroId: released.id }, effectiveWeek: 1 })
  })

  it('are limited to two a week', async () => {
    const { id, heroes } = await confirmedRun()
    const free = (await poolOf(id)).filter(hero => hero.partyId === null && hero.level === 1 && hero.heroClass !== 'Paladin')
    const swap = (release: string, sign: string) => host.post(`/api/leagues/${id}/solo/swaps`, { releaseHeroId: release, signHeroId: sign })
    expect((await swap(heroes[5]!.id, free[0]!.id)).status).toBe(200)
    expect((await swap(heroes[6]!.id, free[1]!.id)).status).toBe(200)
    const third = await swap(heroes[7]!.id, free[2]!.id)
    expect(third.status).toBe(409)
    expect(third.body.error.message).toBe('You’ve used this week’s 2 swaps; more open when the week goes final')
    expect((await soloOf(id)).swapsLeft).toBe(0)
  })

  it('keep the party under the cap it was confirmed with, at the prices paid, changing nothing when refused', async () => {
    const { id, heroes } = await confirmedRun()
    // A run confirmed under the first budget keeps its 116 gold
    await LeagueModel.updateOne({ _id: id }, { $set: { rulesetVersion: SOLO_V1.version } }, { overwriteImmutable: true })
    const [star] = pick(
      (await poolOf(id)).filter(hero => hero.partyId === null),
      [{ heroClass: 'Warrior', level: 4 }]
    )
    // 107 - 1 + 16 = 122 gold
    const res = await host.post(`/api/leagues/${id}/solo/swaps`, { releaseHeroId: heroes[5]!.id, signHeroId: star!.id })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('That swap would cost 122 gold of your 116')
    const solo = await soloOf(id)
    expect(solo).toMatchObject({ spent: 107, swapsLeft: 2 })
    expect((solo.pool as PoolHero[]).find(hero => hero.id === heroes[5]!.id)?.price).toBe(1)
  })

  it('keep to two Paladins', async () => {
    const id = await startRun()
    const pool = await poolOf(id)
    // The three cheapest defenses: Levels 2, 3 and 4
    const [first, second, third] = pool.filter(hero => hero.heroClass === 'Paladin').sort((a, b) => a.level - b.level)
    const others = pick(pool, ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Mage', 'Warrior'].map(heroClass => ({ heroClass, level: 1 })))
    const heroIds = [first!.id, second!.id, ...others.map(hero => hero.id)]
    expect((await host.post(`/api/leagues/${id}/solo/confirm`, { heroIds, questParty: heroIds.slice(0, 5), champion: null })).status).toBe(200)
    const res = await host.post(`/api/leagues/${id}/solo/swaps`, { releaseHeroId: others[5]!.id, signHeroId: third!.id })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('A party can have at most 2 Paladins')
  })

  it('can’t release or sign a hero whose game has kicked off', async () => {
    const id = await startRun()
    const pool = await poolOf(id)
    // The cheapest Kansas City running back, with six Level 1s from teams playing later (or on bye)
    const kcBack = pool.filter(hero => hero.heroClass === 'Warrior' && hero.player?.team === 'KC').sort((a, b) => a.level - b.level)[0]!
    const others = pick(
      pool.filter(hero => !['KC', 'BUF'].includes(hero.player?.team ?? '')),
      ['Mage', 'Ranger', 'Rogue', 'Mage', 'Ranger', 'Rogue'].map(heroClass => ({ heroClass, level: 1 }))
    )
    const heroIds = [kcBack.id, ...others.map(hero => hero.id)]
    const [star] = pick(pool.filter(hero => !['KC', 'BUF'].includes(hero.player?.team ?? '')), [{ heroClass: 'Warrior', level: 6 }])
    heroIds.push(star!.id)
    expect((await host.post(`/api/leagues/${id}/solo/confirm`, { heroIds, questParty: heroIds.slice(0, 5), champion: null })).status).toBe(200)
    await kickOff('KC')
    const free = (await poolOf(id)).filter(hero => hero.partyId === null)
    const kc = free.find(hero => hero.player?.team === 'KC')!
    const notKc = free.find(hero => hero.player?.team === 'PHI')!
    expect((await poolOf(id)).find(hero => hero.id === kc.id)?.locked).toBe(true)
    const release = await host.post(`/api/leagues/${id}/solo/swaps`, { releaseHeroId: heroIds[0], signHeroId: notKc.id })
    expect(release.status).toBe(409)
    expect(release.body.error.message).toMatch(/is locked: their game has kicked off/)
    const sign = await host.post(`/api/leagues/${id}/solo/swaps`, { releaseHeroId: heroIds[6], signHeroId: kc.id })
    expect(sign.status).toBe(409)
    expect((await soloOf(id)).swapsLeft).toBe(2)
  })

  it('withdraw a released Champion, and need a confirmed party', async () => {
    const early = await startRun(alice)
    const freeAgent = ((await soloOf(early, alice)).pool as PoolHero[])[0]!
    expect((await alice.post(`/api/leagues/${early}/solo/swaps`, { releaseHeroId: freeAgent.id, signHeroId: freeAgent.id })).status).toBe(409)

    const { id, heroes } = await confirmedRun()
    // Name a Level 1 Champion, then release them
    await host.put(`/api/leagues/${id}/champion`, { heroId: heroes[1]!.id })
    const [signed] = pick(
      (await poolOf(id)).filter(hero => hero.partyId === null),
      [{ heroClass: 'Warrior', level: 1 }]
    )
    await host.post(`/api/leagues/${id}/solo/swaps`, { releaseHeroId: heroes[1]!.id, signHeroId: signed!.id })
    expect((await host.get(`/api/leagues/${id}/lineup`)).body.champion).toBeNull()
  })

  it('are the only roster moves: no free agency or football lineup', async () => {
    const { id, heroes } = await confirmedRun()
    const free = (await poolOf(id)).find(hero => hero.partyId === null)!
    expect((await host.post(`/api/leagues/${id}/claims`, { heroId: free.id, dropHeroId: heroes[7]!.id })).status).toBe(400)
    expect((await host.put(`/api/leagues/${id}/lineup`, {})).status).toBe(400)
    expect((await host.get(`/api/leagues/${id}/standings`)).status).toBe(409)
    expect((await host.get(`/api/leagues/${id}/matchup`)).status).toBe(409)
  })
})

/** Week 8's stat lines for these heroes (rushing yards for `points` points; defenses' sacks), then it goes final. */
async function playWeekEight(id: string, points: ReadonlyMap<string, number>) {
  for (const [heroId, value] of points) {
    const hero = (await HeroModel.findById(heroId).select('+source'))!
    const base = { season: SEASON, seasonType: 'REG' as const, week: 8, gameId: `w8-${hero.id}`, opponent: 'BUF' }
    if (hero.source.kind === 'defense') {
      await DefenseWeekStatModel.create({
        ...base,
        team: hero.source.id,
        stats: { sacks: value, interceptions: 0, fumbleRecoveries: 0, touchdowns: 0, safeties: 0, blockedKicks: 0, pointsAllowed: 24 }
      })
    } else {
      const [line] = await PlayerWeekStatModel.find({ season: SEASON, playerId: hero.source.id }).sort({ week: -1 }).limit(1).lean()
      const { _id, ...latest } = line!
      await PlayerWeekStatModel.create({ ...latest, ...base, team: latest.team, stats: { ...latest.stats, passingYards: 0, rushingYards: value * 10 } })
    }
  }
  // Week 8 kicked off over a week ago and has gone final
  const games = await NflGameModel.find({ season: SEASON, week: 8 })
  await NflGameModel.bulkWrite(
    games.map(game => ({
      updateOne: { filter: { _id: game._id }, update: { $set: { kickoff: new Date(Date.now() - 9 * DAY), homeScore: 20, awayScore: 17 } } }
    }))
  )
  const past = new Date(Date.now() - 60_000)
  await LeagueModel.updateOne({ _id: id }, { $set: { 'nflWeeks.0.finalAt': past, weekOneAt: past } })
  await StatsImportModel.updateOne({ _id: SEASON }, { $set: { importedAt: new Date() } })
  await host.get(`/api/leagues/${id}`)
}

describe('playing the campaign', () => {
  it('deals the Quest party’s class damage, with the monster’s weaknesses, to the current monster', async () => {
    const { id, heroes, questParty } = await confirmedRun()
    await HeroModel.updateMany({ leagueId: id }, { $set: { traits: [] } })
    await PartyModel.updateOne({ leagueId: id }, { $set: { champion: null } })
    // 10 points each for the Quest party; a bench hero's 30 count for nothing
    const points = new Map([...questParty.map(heroId => [heroId, 10] as const), [heroes[7]!.id, 30] as const])
    await playWeekEight(id, points)

    const league = (await LeagueModel.findById(id))!
    expect(league.resolvedWeeks).toBe(1)
    const monster = league.campaign!.monsters[0]! as unknown as CoopMonster
    const multipliers = SOLO_V1.lineup.classMultipliers
    const expected = heroes
      .slice(0, 5)
      .reduce((sum, hero) => sum + 10 * multipliers[hero.heroClass as keyof typeof multipliers] * monsterMultiplier(monster, hero.heroClass as never, rules), 0)
    const result = (await WeekResultModel.findOne({ leagueId: id, week: 1 }))!
    expect(result.sides).toHaveLength(1)
    expect(result.sides![0]!.total).toBeCloseTo(expected, 1)
    expect(result.sides![0]!.gridiron).toBeNull()
    expect(result.campaign).toMatchObject({ chapter: 1, monster: monster.name, hpBefore: monster.hp })
    expect(result.campaign!.dealt).toBeCloseTo(expected, 1)

    // Results show the real players' points, as in Crossover
    const shown = (await host.get(`/api/leagues/${id}/results/1`)).body
    expect(shown.sides[0].heroes.find((line: { heroId: string }) => line.heroId === questParty[0]).points).toBe(10)
    expect(shown.campaign.state.hpLeft).toBeCloseTo(monster.hp - expected, 1)
    // A new week: swaps are back to two, and the pool now reflects week 8
    expect(await soloOf(id)).toMatchObject({ swapsLeft: 2, poolWeek: 8 })
    const mine = (await host.get('/api/leagues/mine')).body[0]
    expect(mine.outlook.campaign).toMatchObject({ chapter: 1, monster: monster.name, livesLeft: 3, outcome: 'ongoing' })
    expect(mine.outlook.nextBattle).toMatchObject({ week: 2, monster: monster.name })
  })

  it('moves Levels as weeks go final, adds new players to the pool, and keeps the prices paid', async () => {
    const { id, heroes } = await confirmedRun()
    // A newcomer's first game, a huge one, in week 8; the party's Level 10 Mage scores nothing
    await NflPlayerModel.create({ _id: 'QB-newcomer', name: 'New Arm', position: 'QB' })
    await PlayerWeekStatModel.create({
      playerId: 'QB-newcomer',
      season: SEASON,
      seasonType: 'REG',
      week: 8,
      gameId: 'w8-newcomer',
      team: 'KC',
      opponent: 'BUF',
      position: 'QB',
      stats: { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 600, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, twoPointConversions: 0, fumblesLost: 0, specialTeamsTds: 0, fumbleRecoveryTds: 0 }
    })
    await playWeekEight(id, new Map([[heroes[1]!.id, 5]]))
    const pool = await poolOf(id)
    const newcomer = pool.find(hero => hero.player?.name === 'New Arm')
    expect(newcomer).toBeDefined()
    expect(newcomer!.partyId).toBeNull()
    // Names stay unique within the run
    expect(new Set(pool.map(hero => hero.name)).size).toBe(pool.length)
    // Prices paid don't follow the Level
    const star = pool.find(hero => hero.id === heroes[0]!.id)!
    expect(star.price).toBe(100)
    expect(star.cost).toBe(star.level ** 2)
  })

  it('keeps the pool as of the last final week while a week is being played', async () => {
    // Week 8 is under way when the run starts: a newcomer has a stat line, but the week hasn't gone final
    await NflPlayerModel.create({ _id: 'QB-early', name: 'Early Arm', position: 'QB' })
    await PlayerWeekStatModel.create({
      playerId: 'QB-early',
      season: SEASON,
      seasonType: 'REG',
      week: 8,
      gameId: 'w8-early',
      team: 'KC',
      opponent: 'BUF',
      position: 'QB',
      stats: { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 600, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, twoPointConversions: 0, fumblesLost: 0, specialTeamsTds: 0, fumbleRecoveryTds: 0 }
    })
    await kickOff('KC')
    await StatsImportModel.updateOne({ _id: SEASON }, { $set: { importedAt: new Date() } })
    const id = await startRun()
    const solo = await soloOf(id)
    expect(solo.poolWeek).toBe(7)
    expect((solo.pool as PoolHero[]).some(hero => hero.player?.name === 'Early Arm')).toBe(false)
  })

  it('is won when the boss falls, with the run’s best moments', async () => {
    const { id, questParty } = await confirmedRun()
    // Weak monsters: one good week brings them all down
    await LeagueModel.updateOne({ _id: id }, { $set: { 'campaign.monsters.$[].hp': 5 } })
    await playWeekEight(id, new Map(questParty.map(heroId => [heroId, 10])))
    const league = (await LeagueModel.findById(id))!
    expect(league.status).toBe('complete')
    const finale = (await host.get(`/api/leagues/${id}/finale`)).body
    expect(finale).toMatchObject({ mode: 'solo', outcome: 'won', abandoned: false, lives: 3, livesLeft: 3, weeksPlayed: 1 })
    expect(finale.chapters.map((chapter: { status: string }) => chapter.status)).toEqual(['fallen', 'fallen', 'fallen', 'fallen', 'fallen'])
    const kinds = finale.awards.map((award: { kind: string }) => award.kind)
    expect(kinds).toEqual(['biggestWeek', 'topHero'])
    expect(finale.awards[0]).toMatchObject({ week: 1, damage: Math.round(finale.total) })
    const lines = (await WeekResultModel.findOne({ leagueId: id, week: 1 }))!.sides![0]!.heroes
    const top = [...lines].sort((a, b) => b.counted - a.counted)[0]!
    expect(finale.awards[1]).toMatchObject({ hero: { heroId: top.heroId.toString() }, damage: Math.round(top.counted) })
    expect(finale.awards[1].hero.player).toBeDefined()
    // A finished run frees the account to start another
    await startRun()
  })

  it('counts natural 20s for the finale', async () => {
    const { id, questParty } = await confirmedRun()
    await LeagueModel.updateOne({ _id: id }, { $set: { 'campaign.monsters.$[].hp': 5 } })
    // 40 points: a natural 20 for every class
    await playWeekEight(id, new Map(questParty.map(heroId => [heroId, 40])))
    const finale = (await host.get(`/api/leagues/${id}/finale`)).body
    expect(finale.awards.find((award: { kind: string }) => award.kind === 'natural20')).toMatchObject({ count: 5 })
  })

  it('can be abandoned once confirmed, which loses the run', async () => {
    const { id } = await confirmedRun()
    const res = await host.post(`/api/leagues/${id}/cancel`)
    expect(res.body.status).toBe('complete')
    expect((await host.get(`/api/leagues/${id}/campaign`)).body).toMatchObject({ abandoned: true, outcome: 'lost', nextWeek: null })
    const finale = (await host.get(`/api/leagues/${id}/finale`)).body
    expect(finale).toMatchObject({ mode: 'solo', outcome: 'lost', abandoned: true, weeksPlayed: 0, awards: [] })
    expect((await host.get('/api/leagues/mine')).body[0].outlook.campaign).toMatchObject({ outcome: 'lost' })
    expect((await host.post(`/api/leagues/${id}/cancel`)).status).toBe(409)
    // Nothing more resolves for an abandoned run
    await playWeekEight(id, new Map())
    expect((await LeagueModel.findById(id))!.resolvedWeeks).toBe(0)
  })
})

describe('the rules', () => {
  it('publish Solo’s budget, swaps and campaign', async () => {
    const rulesView = (await request(buildTestApp()).get('/api/rules')).body.solo
    expect(rulesView).toMatchObject({
      available: true,
      version: 5,
      rosterSize: 8,
      partySize: 5,
      classLimits: { Paladin: 2 },
      cap: 350,
      swapsPerWeek: 2,
      firstWeek: 2,
      lastWeek: 17,
      minWeeks: 8,
      chapters: 5,
      lives: 3,
      boss: 'The Dragon Tyrant'
    })
    expect(rulesView.costs).toEqual([1, 4, 9, 16, 25, 36, 49, 64, 81, 100])
  })
})
