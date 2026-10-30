import mongoose from 'mongoose'
import { beforeEach, describe, expect, it } from 'vitest'
import { createRng } from '../src/lib/random.js'
import { LAST_LEAGUE_SEASON, pickSeason } from '../src/modules/draft/candidates.js'
import { DYNASTY_KEEPERS } from '../src/modules/dynasty/dynasty.service.js'
import { chooseEarnedTrait, withEarnedTrait, XP_TIERS, xpMultiplier, xpTier, xpView } from '../src/modules/dynasty/xp.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { generateAppearances } from '../src/modules/heroes/generator.js'
import type { PoolEntry } from '../src/modules/heroes/pool.js'
import { DefenseWeekStatModel, PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { FIRST_SEASON, RETIRES_AFTER_2020, seedDynasty } from './dynastySeed.js'
import { as, DAY, host, makeWeeksDue } from './leagueHelpers.js'

const { trusted } = mongoose
const alice = as('auth0|alice')
const bob = as('auth0|bob')
const crest = { emblem: 'crown', banner: 'crimson' }

interface Keepers {
  limit: number
  options: {
    heroId: string
    name: string
    heroClass: string
    previousLevel: number | null
    level: number | null
    traits: string[]
    retired: boolean
    kept: boolean
    xp: { xp: number; tier: number; bonus: number; nextTierAt: number | null }
    earnedTrait: string | null
  }[]
}

beforeEach(async () => {
  await seedDynasty()
})

async function createDynasty(seasons = 3) {
  const res = await host.post('/api/leagues', {
    name: 'Long Haul',
    visibility: 'private',
    cadence: 'daily',
    maxParties: 6,
    dynastySeasons: seasons,
    party: { name: 'Host Party', crest }
  })
  expect(res.status).toBe(201)
  const { id, pin } = res.body as { id: string; pin: string }
  for (const [i, member] of [alice, bob].entries()) {
    await member.post('/api/leagues/join', { pin, party: { name: `Member ${String(i)}`, crest } })
  }
  return id
}

/** Schedules and runs the draft. */
async function draft(id: string) {
  expect((await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })).status).toBe(200)
  await LeagueModel.updateOne({ _id: id }, { $set: { draftAt: new Date(Date.now() - 1000) } })
  await host.get(`/api/leagues/${id}`)
}

/** Plays the whole season. */
async function finish(id: string) {
  await makeWeeksDue(id, 14)
  await host.get(`/api/leagues/${id}`)
  expect((await LeagueModel.findById(id))?.status).toBe('complete')
}

async function nextSeason(id: string) {
  const res = await host.post(`/api/leagues/${id}/next-season`)
  expect(res.status).toBe(201)
  return (res.body as { id: string }).id
}

const seasonOf = async (id: string) => (await LeagueModel.findById(id).select('+season'))?.season

describe('creating a dynasty', () => {
  it('is a Classic league marked as season 1 of its chain', async () => {
    const id = await createDynasty(5)
    const league = (await host.get(`/api/leagues/${id}`)).body as { dynasty: unknown; mode: string }
    expect(league).toMatchObject({ mode: 'classic', dynasty: { seasons: 5, number: 1, previousLeagueId: null, nextLeagueId: null } })
    expect((await LeagueModel.findById(id))?.dynasty?.rootId.toString()).toBe(id)
  })

  it('comes in 3 or 5 seasons, Classic only', async () => {
    const base = { name: 'X', visibility: 'private', cadence: 'daily', maxParties: 4, party: { name: 'P', crest } }
    expect((await host.post('/api/leagues', { ...base, dynastySeasons: 4 })).status).toBe(400)
    expect((await host.post('/api/leagues', { ...base, mode: 'crossover', cadence: 'weekly', dynastySeasons: 3 })).status).toBe(400)
  })

  it('starts on a hidden season with the whole chain still to come', async () => {
    const id = await createDynasty(3)
    await draft(id)
    // Only 2020 has a season before it and two after it in the seed.
    expect(await seasonOf(id)).toBe(FIRST_SEASON)
    expect(JSON.stringify((await host.get(`/api/leagues/${id}`)).body)).not.toContain(String(FIRST_SEASON))
  })
})

describe('the season chain', () => {
  it('never runs past the last season Classic may use, whatever else is imported', async () => {
    // Stub lines make 2023-2026 "imported" (2026 being a season Classic must never use).
    for (const season of [2023, 2024, 2025, 2026]) {
      await PlayerWeekStatModel.create({ playerId: 'QB-0', season, seasonType: 'REG', week: 1, gameId: `stub-${String(season)}`, team: 'AAA', opponent: 'BBB', position: 'QB', stats: {} })
      await DefenseWeekStatModel.create({ team: 'T0', season, seasonType: 'REG', week: 1, gameId: `stub-${String(season)}`, opponent: 'BBB', stats: {} })
    }
    const starts = await Promise.all(Array.from({ length: 40 }, (_, i) => pickSeason(createRng(`seed-${String(i)}`), 3)))
    expect(Math.max(...starts)).toBe(LAST_LEAGUE_SEASON - 2)
    expect(Math.min(...starts)).toBe(FIRST_SEASON)
  })

  it('gives new heroes names no kept hero already has', () => {
    const entries: PoolEntry[] = Array.from({ length: 30 }, (_, i) => ({ sourceKind: 'player', sourceId: `p${String(i)}`, heroClass: 'Mage', level: 5, levelRange: null, traits: [] }))
    const first = generateAppearances(entries, createRng('names'))
    const taken = first.map(hero => hero.name)
    // The same random draw, with those names taken: every name comes out different.
    const second = generateAppearances(entries, createRng('names'), taken)
    expect(second.filter(hero => taken.includes(hero.name))).toEqual([])
  })
})

describe('the next season', () => {
  it('carries every party into a new league on the next hidden season, once the season is over', async () => {
    const id = await createDynasty()
    await draft(id)
    expect((await host.post(`/api/leagues/${id}/next-season`)).status).toBe(409) // still being played
    await finish(id)
    expect((await alice.post(`/api/leagues/${id}/next-season`)).status).toBe(403) // host only

    const nextId = await nextSeason(id)
    const next = (await host.get(`/api/leagues/${nextId}`)).body as { status: string; dynasty: unknown; parties: { name: string }[]; partyCount: number }
    expect(next).toMatchObject({ status: 'forming', partyCount: 3, dynasty: { seasons: 3, number: 2, previousLeagueId: id, nextLeagueId: null } })
    expect(next.parties.map(party => party.name).sort()).toEqual(['Host Party', 'Member 0', 'Member 1'])
    expect(await seasonOf(nextId)).toBe(FIRST_SEASON + 1)
    expect((await LeagueModel.findById(id))?.dynasty?.nextId?.toString()).toBe(nextId)
    // Only once.
    expect((await host.post(`/api/leagues/${id}/next-season`)).status).toBe(409)
    // Members see the latest season in their list.
    const mine = (await alice.get('/api/leagues/mine')).body as { id: string }[]
    expect(mine.map(league => league.id)).toEqual([nextId])
  })

  it('isn’t offered after the last season, or outside a dynasty', async () => {
    const plain = await host.post('/api/leagues', { name: 'Plain', visibility: 'private', cadence: 'daily', maxParties: 4, party: { name: 'P', crest } })
    expect((await host.post(`/api/leagues/${(plain.body as { id: string }).id}/next-season`)).status).toBe(400)

    let id = await createDynasty(3)
    for (let season = 1; season <= 3; season++) {
      await draft(id)
      await finish(id)
      if (season < 3) id = await nextSeason(id)
    }
    expect(await seasonOf(id)).toBe(FIRST_SEASON + 2)
    const last = await host.post(`/api/leagues/${id}/next-season`)
    expect(last.status).toBe(409)
    expect(last.body.error.message).toBe('This was the dynasty’s last season')
  }, 60_000)
})

describe('keepers', () => {
  async function offseason() {
    const id = await createDynasty()
    await draft(id)
    await finish(id)
    return { previousId: id, id: await nextSeason(id) }
  }

  it('offer last season’s roster, re-leveled from the season just played, with retirements marked', async () => {
    const { id, previousId } = await offseason()
    const keepers = (await alice.get(`/api/leagues/${id}/keepers`)).body as Keepers
    expect(keepers.limit).toBe(DYNASTY_KEEPERS)
    const aliceOld = await PartyModel.findOne({ leagueId: previousId, name: 'Member 0' })
    expect(keepers.options).toHaveLength(await HeroModel.countDocuments({ partyId: aliceOld!._id }))
    for (const option of keepers.options) {
      if (option.retired) expect(option.level).toBeNull()
      else expect(option.level).toBeGreaterThanOrEqual(1)
    }
    // Retirements in the seed are the players numbered 9, 19 and 29 of each position.
    const heroes = await HeroModel.find({ _id: trusted({ $in: keepers.options.map(option => option.heroId) }) }).select('+source')
    for (const hero of heroes) {
      const option = keepers.options.find(entry => entry.heroId === hero.id)!
      const index = Number(hero.source.id.split('-')[1])
      if (hero.source.kind === 'player') expect(option.retired).toBe(RETIRES_AFTER_2020(index))
    }
  })

  it('can’t keep a hero who has retired', async () => {
    const { id, previousId } = await offseason()
    // Give Alice last season's hero for a player who retired after it (players numbered 9, 19, 29 stop after 2020).
    const aliceOld = (await PartyModel.findOne({ leagueId: previousId, name: 'Member 0' }))!
    const pool = await HeroModel.find({ leagueId: previousId, 'source.kind': 'player' }).select('+source')
    const retiredHero = pool.find(hero => RETIRES_AFTER_2020(Number(hero.source.id.split('-')[1])))!
    expect(retiredHero).toBeDefined()
    await HeroModel.updateOne({ _id: retiredHero._id }, { $set: { partyId: aliceOld._id } })
    const { options } = (await alice.get(`/api/leagues/${id}/keepers`)).body as Keepers
    expect(options.find(option => option.heroId === retiredHero.id)).toMatchObject({ retired: true, level: null })
    const res = await alice.put(`/api/leagues/${id}/keepers`, { heroIds: [retiredHero.id] })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/has retired/)
  })

  it('keep up to 3 of your own active heroes, until the draft is scheduled', async () => {
    const { id } = await offseason()
    const { options } = (await alice.get(`/api/leagues/${id}/keepers`)).body as Keepers
    const active = options.filter(option => !option.retired)
    const put = (heroIds: string[]) => alice.put(`/api/leagues/${id}/keepers`, { heroIds })

    expect((await put(active.slice(0, 4).map(option => option.heroId))).status).toBe(400)
    const retired = options.find(option => option.retired)
    if (retired) expect((await put([retired.heroId])).status).toBe(400)
    const hostOptions = ((await host.get(`/api/leagues/${id}/keepers`)).body as Keepers).options
    expect((await put([hostOptions[0]!.heroId])).status).toBe(400) // not Alice's

    const chosen = active.slice(0, 3).map(option => option.heroId)
    const saved = (await put(chosen)).body as Keepers
    expect(saved.options.filter(option => option.kept).map(option => option.heroId).sort()).toEqual([...chosen].sort())

    await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })
    expect((await put([])).status).toBe(409)
  })

  it('carry into the new season as the same heroes, in their party, out of the draft pool', async () => {
    const { id } = await offseason()
    const { options } = (await alice.get(`/api/leagues/${id}/keepers`)).body as Keepers
    const chosen = options.filter(option => !option.retired).slice(0, 3)
    await alice.put(`/api/leagues/${id}/keepers`, { heroIds: chosen.map(option => option.heroId) })
    await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })

    const party = (await PartyModel.findOne({ leagueId: id, name: 'Member 0' }))!
    const kept = await HeroModel.find({ leagueId: id, partyId: party._id }).select('+source')
    expect(kept.map(hero => hero.name).sort()).toEqual(chosen.map(option => option.name).sort())
    for (const hero of kept) {
      const option = chosen.find(entry => entry.name === hero.name)!
      expect(hero.previousHeroId?.toString()).toBe(option.heroId)
      expect(hero.level).toBe(option.level)
      // The same player behind them, and nobody else in the pool has them.
      const original = (await HeroModel.findById(option.heroId).select('+source'))!
      expect(hero.source).toMatchObject({ kind: original.source.kind, id: original.source.id })
      expect(await HeroModel.countDocuments({ leagueId: id, 'source.kind': hero.source.kind, 'source.id': hero.source.id })).toBe(1)
    }
    // Names stay unique within the league.
    const names = (await HeroModel.find({ leagueId: id }, 'name')).map(hero => hero.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('fill each party’s first picks, with last season’s worst party picking first', async () => {
    const { id, previousId } = await offseason()
    const { options } = (await alice.get(`/api/leagues/${id}/keepers`)).body as Keepers
    await alice.put(`/api/leagues/${id}/keepers`, { heroIds: options.filter(option => !option.retired).slice(0, 2).map(option => option.heroId) })
    await draft(id)

    const league = (await LeagueModel.findById(id))!
    expect(league.status).toBe('active')
    const parties = await PartyModel.find({ leagueId: id })
    for (const party of parties) expect(await HeroModel.countDocuments({ leagueId: id, partyId: party._id })).toBe(10)

    const alicePartyId = parties.find(party => party.name === 'Member 0')!.id
    const alicePicks = league.draftPicks!.filter(pick => pick.partyId.toString() === alicePartyId)
    expect(alicePicks.filter(pick => pick.keeper).map(pick => pick.round)).toEqual([1, 2])
    expect(alicePicks.find(pick => pick.round === 3)?.keeper).toBe(false)

    const standings = (await host.get(`/api/leagues/${previousId}/standings`)).body as { partyId: string }[]
    const worst = await PartyModel.findById(standings.at(-1)!.partyId)
    const first = parties.find(party => party.previousPartyId?.equals(worst!._id))!
    expect(league.draftOrder![0]!.toString()).toBe(first.id)
    expect(league.weekOneAt?.getTime()).toBe(league.draftAt!.getTime() + DAY)
  })

  it('are only for later dynasty seasons', async () => {
    const id = await createDynasty()
    expect((await alice.get(`/api/leagues/${id}/keepers`)).status).toBe(404)
  })
})

describe('experience', () => {
  it('sets tiers, a damage bonus up to +4%, and the next goal', () => {
    expect(XP_TIERS).toEqual([150, 300, 450, 600])
    expect([0, 149, 150, 449, 450, 600, 5000].map(xpTier)).toEqual([0, 0, 1, 2, 3, 4, 4])
    expect(xpMultiplier(0)).toBe(1)
    expect(xpMultiplier(600)).toBeCloseTo(1.04)
    expect(xpView(320.4)).toEqual({ xp: 320, tier: 2, bonus: 0.02, nextTierAt: 450 })
    expect(xpView(700).nextTierAt).toBeNull()
  })

  it('earns the trait a hero is closest to, never one that conflicts', () => {
    const peers = Array.from({ length: 10 }, (_, i) => ({
      sourceKind: 'player' as const,
      sourceId: `p${String(i)}`,
      heroClass: 'Mage' as const,
      ppg: 10,
      volatility: i / 10,
      ceiling: i * 3
    }))
    // Steadiest of the class but an average ceiling: Steadfast.
    expect(chooseEarnedTrait({ heroClass: 'Mage', traits: [], volatility: 0.01, ceiling: 13 }, peers)).toBe('steadfast')
    // Already Wild, so not Steadfast; the best remaining is Mighty.
    expect(chooseEarnedTrait({ heroClass: 'Mage', traits: ['wild'], volatility: 0.01, ceiling: 13 }, peers)).toBe('mighty')
    expect(chooseEarnedTrait({ heroClass: 'Mage', traits: ['steadfast', 'mighty'], volatility: 0.5, ceiling: 13 }, peers)).toBeNull()
    expect(withEarnedTrait(['mighty'], 'steadfast')).toEqual(['steadfast', 'mighty'])
    expect(withEarnedTrait(['wild'], 'steadfast')).toEqual(['wild'])
  })

  /** A finished first season, the next season opened, and Alice's best active hero from last season. */
  async function afterSeasonOne() {
    const id = await createDynasty()
    await draft(id)
    await finish(id)
    const nextId = await nextSeason(id)
    const oldParty = (await PartyModel.findOne({ leagueId: id, name: 'Member 0' }))!
    return { id, nextId, oldParty }
  }

  /** Damage a hero dealt for a party in a league's results. */
  async function damageFor(leagueId: string, heroId: string, partyId: string) {
    let total = 0
    for (const week of await WeekResultModel.find({ leagueId })) {
      for (const matchup of week.matchups) {
        for (const side of matchup.away ? [matchup.home, matchup.away] : [matchup.home]) {
          if (side.partyId.toString() !== partyId) continue
          for (const line of side.heroes) if (line.heroId.toString() === heroId) total += line.counted
        }
      }
    }
    return total
  }

  it('is the damage a hero dealt for the party, shown on the keeper screen', async () => {
    const { id, nextId, oldParty } = await afterSeasonOne()
    const { options } = (await alice.get(`/api/leagues/${nextId}/keepers`)).body as Keepers
    for (const option of options) {
      const dealt = await damageFor(id, option.heroId, oldParty.id)
      expect(option.xp.xp).toBe(Math.round(dealt))
      expect(option.xp.tier).toBe(xpTier(dealt))
    }
    expect(options.some(option => option.xp.xp > 0)).toBe(true)
  })

  it('carries into the next season with its damage bonus, and resets when a hero changes hands', async () => {
    const { id, nextId, oldParty } = await afterSeasonOne()
    const { options } = (await alice.get(`/api/leagues/${nextId}/keepers`)).body as Keepers
    const best = options.filter(option => !option.retired).sort((a, b) => b.xp.xp - a.xp.xp).slice(0, 3)
    await alice.put(`/api/leagues/${nextId}/keepers`, { heroIds: best.map(option => option.heroId) })
    await draft(nextId)

    const kept = await HeroModel.find({ leagueId: nextId, previousHeroId: trusted({ $in: best.map(option => option.heroId) }) })
    expect(kept).toHaveLength(3)
    for (const hero of kept) {
      const option = best.find(entry => entry.heroId === hero.previousHeroId!.toString())!
      expect(Math.round(hero.xp)).toBe(option.xp.xp)
      expect(Math.round(hero.xp)).toBe(Math.round(await damageFor(id, option.heroId, oldParty.id)))
    }
    // The hero list shows XP for kept heroes.
    const listed = (await alice.get(`/api/leagues/${nextId}/heroes`)).body as { id: string; xp?: { tier: number } }[]
    expect(listed.find(hero => hero.id === kept[0]!.id)?.xp?.tier).toBe(xpTier(kept[0]!.xp))

    // In battle, a kept hero's class damage includes the bonus.
    await makeWeeksDue(nextId, 1)
    await host.get(`/api/leagues/${nextId}`)
    const week = (await WeekResultModel.findOne({ leagueId: nextId, week: 1 }))!
    const lines = week.matchups.flatMap(matchup => (matchup.away ? [matchup.home, matchup.away] : [matchup.home])).flatMap(side => side.heroes)
    const boosted = kept.filter(hero => xpTier(hero.xp) > 0)
    for (const hero of boosted) {
      const line = lines.find(entry => entry.heroId.equals(hero._id))!
      if (line.slot === 'Bench' || line.resting) continue
      const classDamage = line.points * { Mage: 1, Warrior: 1.45, Ranger: 1.4, Rogue: 2.05, Paladin: 2.35 }[hero.heroClass]
      // The Champion's multiplier may apply on top; the XP bonus is always there.
      expect(line.counted / classDamage).toBeGreaterThanOrEqual(xpMultiplier(hero.xp) - 0.001)
    }

    // Dropped for a free agent: the kept hero loses their XP, and the free agent starts at 0.
    const party = (await PartyModel.findOne({ leagueId: nextId, name: 'Member 0' }))!
    const free = await HeroModel.findOne({ leagueId: nextId, partyId: null, heroClass: kept[0]!.heroClass })
    if (free) {
      expect((await alice.post(`/api/leagues/${nextId}/claims`, { heroId: free.id, dropHeroId: kept[0]!.id })).status).toBe(200)
      expect((await HeroModel.findById(kept[0]!.id))!.xp).toBe(0)
      expect((await HeroModel.findById(free.id))!.partyId?.equals(party._id)).toBe(true)
      expect((await HeroModel.findById(free.id))!.xp).toBe(0)
    }
  })

  it('only counts damage dealt for the party that keeps the hero', async () => {
    const { id, nextId, oldParty } = await afterSeasonOne()
    const before = ((await alice.get(`/api/leagues/${nextId}/keepers`)).body as Keepers).options[0]!
    // A week the hero fought for Bob before Alice claimed them: it doesn't count toward Alice's XP.
    const bobParty = (await PartyModel.findOne({ leagueId: id, name: 'Member 1' }))!
    const side = (partyId: mongoose.Types.ObjectId, counted: number) => ({
      partyId,
      total: counted,
      top: counted,
      bench: 0,
      heroes: [{ heroId: new mongoose.Types.ObjectId(before.heroId), slot: 'slot1', points: counted, resting: false, counted }]
    })
    await WeekResultModel.create({ leagueId: id, week: 15, matchups: [{ home: side(bobParty._id, 500), away: side(oldParty._id, 7), outcome: 'home' }] })
    const after = ((await alice.get(`/api/leagues/${nextId}/keepers`)).body as Keepers).options.find(option => option.heroId === before.heroId)!
    expect(after.xp.xp).toBe(Math.round(before.xp.xp + 7))
  })

  it('adds its bonus to a starter’s damage in battle', async () => {
    const { nextId } = await afterSeasonOne()
    const { options } = (await alice.get(`/api/leagues/${nextId}/keepers`)).body as Keepers
    const keeper = options.find(option => !option.retired)!
    await alice.put(`/api/leagues/${nextId}/keepers`, { heroIds: [keeper.heroId] })
    await draft(nextId)
    // Top-tier XP, starting, no Champion: their damage is exactly class damage x 1.04.
    const hero = (await HeroModel.findOne({ leagueId: nextId, previousHeroId: keeper.heroId }))!
    await HeroModel.updateOne({ _id: hero._id }, { $set: { xp: 600 } })
    const party = (await PartyModel.findOne({ leagueId: nextId, name: 'Member 0' }))!
    const lineup = party.lineup!.map(entry => ({ slot: entry.slot, heroId: entry.heroId }))
    if (!lineup.some(entry => entry.heroId.equals(hero._id))) lineup[0] = { slot: lineup[0]!.slot, heroId: hero._id }
    await PartyModel.updateOne({ _id: party._id }, { $set: { lineup, champion: null, autoSwap: false } })
    await makeWeeksDue(nextId, 1)
    await host.get(`/api/leagues/${nextId}`)
    const week = (await WeekResultModel.findOne({ leagueId: nextId, week: 1 }))!
    const line = week.matchups.flatMap(matchup => (matchup.away ? [matchup.home, matchup.away] : [matchup.home])).flatMap(entry => entry.heroes).find(entry => entry.heroId.equals(hero._id))!
    const multipliers = { Mage: 1, Warrior: 1.45, Ranger: 1.4, Rogue: 2.05, Paladin: 2.35 }
    expect(line.resting).toBe(false)
    expect(line.counted).toBeCloseTo(line.points * multipliers[hero.heroClass] * 1.04, 1)
  })

  it('earns a trait at the top tier, kept for as long as the hero is', async () => {
    const { nextId, oldParty } = await afterSeasonOne()
    const { options } = (await alice.get(`/api/leagues/${nextId}/keepers`)).body as Keepers
    // Someone who isn't already Mighty can always earn a trait.
    const veteran = options.find(option => !option.retired && !option.traits.includes('mighty'))!
    // As if they'd already built up years of XP with Alice.
    await HeroModel.updateOne({ _id: veteran.heroId }, { $set: { xp: 1000 } })
    const after = ((await alice.get(`/api/leagues/${nextId}/keepers`)).body as Keepers).options.find(option => option.heroId === veteran.heroId)!
    expect(after.xp.tier).toBe(4)
    expect(after.earnedTrait).not.toBeNull()
    expect(after.traits).toContain(after.earnedTrait)

    await alice.put(`/api/leagues/${nextId}/keepers`, { heroIds: [veteran.heroId] })
    await draft(nextId)
    const kept = (await HeroModel.findOne({ leagueId: nextId, previousHeroId: veteran.heroId }))!
    expect(kept.earnedTrait).toBe(after.earnedTrait)
    expect(kept.xp).toBeGreaterThanOrEqual(1000)
    expect(oldParty).toBeDefined()
  })
})

describe('members between seasons', () => {
  const carol = as('auth0|carol')
  const dave = as('auth0|dave')
  const pinOf = async (id: string) => (await LeagueModel.findById(id))!.pin

  /** A finished first season, the next opened, and Alice keeping two heroes. */
  async function offseasonWithKeepers() {
    const id = await createDynasty()
    await draft(id)
    await finish(id)
    const nextId = await nextSeason(id)
    const { options } = (await alice.get(`/api/leagues/${nextId}/keepers`)).body as Keepers
    const keepers = options.filter(option => !option.retired).slice(0, 2).map(option => option.heroId)
    await alice.put(`/api/leagues/${nextId}/keepers`, { heroIds: keepers })
    return { id, nextId, keepers }
  }
  const openParties = async (id: string) => ((await host.get(`/api/leagues/${id}`)).body as { openParties: { id: string; name: string }[] }).openParties

  it('opens a departing member’s party for someone to take over, keepers and all', async () => {
    const { nextId } = await offseasonWithKeepers()
    expect((await alice.post(`/api/leagues/${nextId}/leave`)).status).toBe(204)
    expect((await alice.get(`/api/leagues/${nextId}`)).status).toBe(404)
    expect((await LeagueModel.findById(nextId))?.partyCount).toBe(2)
    expect((await openParties(nextId)).map(open => open.name)).toEqual(['Member 0'])
    // The PIN preview shows it to whoever's invited.
    const preview = (await carol.get(`/api/leagues/pin/${await pinOf(nextId)}`)).body as { openParties: { name: string }[] }
    expect(preview.openParties.map(open => open.name)).toEqual(['Member 0'])
  })

  it('lets a new member take it over, renamed if they like, with its history and keepers', async () => {
    const { id, nextId, keepers } = await offseasonWithKeepers()
    await alice.post(`/api/leagues/${nextId}/leave`)
    const [open] = await openParties(nextId)
    const res = await carol.post('/api/leagues/join', { pin: await pinOf(nextId), party: { name: 'New Blood', crest }, takeOver: open!.id })
    expect(res.status).toBe(201)

    const party = (await PartyModel.findOne({ leagueId: nextId, name: 'New Blood' }))!
    const previous = (await PartyModel.findOne({ leagueId: id, name: 'Member 0' }))!
    expect(party.previousPartyId?.equals(previous._id)).toBe(true)
    expect(party.keepers?.map(String).sort()).toEqual([...keepers].sort())
    expect(await openParties(nextId)).toEqual([])
    expect((await LeagueModel.findById(nextId))?.partyCount).toBe(3)
    // Carol now manages its keepers.
    const view = (await carol.get(`/api/leagues/${nextId}/keepers`)).body as Keepers
    expect(view.options.filter(option => option.kept).map(option => option.heroId).sort()).toEqual([...keepers].sort())
    // Only once.
    const again = await dave.post('/api/leagues/join', { pin: await pinOf(nextId), party: { name: 'Late', crest }, takeOver: open!.id })
    expect(again.status).toBe(409)
    expect(again.body.error.message).toBe('That party has already been taken over')
  })

  it('keeps the open party’s place from fresh joins', async () => {
    const { nextId } = await offseasonWithKeepers()
    await LeagueModel.updateOne({ _id: nextId }, { $set: { maxParties: 3 } })
    await alice.post(`/api/leagues/${nextId}/leave`)
    const pin = await pinOf(nextId)
    expect((await dave.post('/api/leagues/join', { pin, party: { name: 'Fresh', crest } })).status).toBe(409)
    expect((await host.patch(`/api/leagues/${nextId}`, { maxParties: 2 })).status).toBe(409)
    const [open] = await openParties(nextId)
    expect((await carol.post('/api/leagues/join', { pin, party: { name: 'Member 0', crest }, takeOver: open!.id })).status).toBe(201)
  })

  it('opens a party the host removes, and one whose owner deletes their account', async () => {
    const { nextId } = await offseasonWithKeepers()
    const bobParty = (await PartyModel.findOne({ leagueId: nextId, name: 'Member 1' }))!
    expect((await host.delete(`/api/leagues/${nextId}/parties/${bobParty.id}`)).status).toBe(200)
    expect((await alice.delete('/api/account')).status).toBe(204)
    expect((await openParties(nextId)).map(open => open.name).sort()).toEqual(['Member 0', 'Member 1'])
  })

  it('lets a party new this season just leave', async () => {
    const { nextId } = await offseasonWithKeepers()
    await dave.post('/api/leagues/join', { pin: await pinOf(nextId), party: { name: 'Fresh', crest } })
    expect((await dave.post(`/api/leagues/${nextId}/leave`)).status).toBe(204)
    expect(await openParties(nextId)).toEqual([])
  })

  it('closes parties nobody took over when the draft is scheduled, returning their keepers to the pool', async () => {
    const { nextId, keepers } = await offseasonWithKeepers()
    await alice.post(`/api/leagues/${nextId}/leave`)
    expect((await host.post(`/api/leagues/${nextId}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })).status).toBe(200)
    expect(await openParties(nextId)).toEqual([])
    // Alice's keepers' players are back in the draft pool, owned by nobody.
    const originals = await HeroModel.find({ _id: trusted({ $in: keepers }) }).select('+source')
    for (const original of originals) {
      const now = await HeroModel.find({ leagueId: nextId, 'source.kind': original.source.kind, 'source.id': original.source.id })
      expect(now.length).toBeLessThanOrEqual(1)
      if (now[0]) expect(now[0].partyId).toBeNull()
    }
  })

  it('works as before in a dynasty’s first season', async () => {
    const id = await createDynasty()
    expect((await alice.post(`/api/leagues/${id}/leave`)).status).toBe(204)
    expect(await openParties(id)).toEqual([])
  })
})

describe('the dynasty summary', () => {
  interface Summary {
    seasons: number
    current: number
    history: { number: number; leagueId: string; status: string; champion: { name: string } | null }[]
    standings: { name: string; titles: number; wins: number; losses: number; seasons: number; isMine: boolean }[]
  }

  it('lists every season with its champion, and all-time standings that follow each party', async () => {
    const id = await createDynasty()
    await draft(id)
    await finish(id)
    const nextId = await nextSeason(id)
    // Alice leaves; Carol takes her party over and renames it.
    const carol = as('auth0|carol')
    await alice.post(`/api/leagues/${nextId}/leave`)
    const open = ((await host.get(`/api/leagues/${nextId}`)).body as { openParties: { id: string }[] }).openParties[0]!
    await carol.post('/api/leagues/join', { pin: (await LeagueModel.findById(nextId))!.pin, party: { name: 'Carol Reborn', crest }, takeOver: open.id })

    const summary = (await carol.get(`/api/leagues/${nextId}/dynasty`)).body as Summary
    expect(summary).toMatchObject({ seasons: 3, current: 2 })
    expect(summary.history.map(season => [season.number, season.leagueId, season.status])).toEqual([
      [1, id, 'complete'],
      [2, nextId, 'forming']
    ])
    const firstStandings = (await host.get(`/api/leagues/${id}/standings`)).body as { name: string; wins: number }[]
    expect(summary.history[0]!.champion?.name).toBe(firstStandings[0]!.name)
    expect(summary.history[1]!.champion).toBeNull()

    // Three parties all-time: Alice's line now shows as Carol's, with season one's record.
    expect(summary.standings).toHaveLength(3)
    const carolsLine = summary.standings.find(row => row.name === 'Carol Reborn')!
    const aliceSeasonOne = firstStandings.find(row => row.name === 'Member 0')!
    expect(carolsLine).toMatchObject({ wins: aliceSeasonOne.wins, seasons: 1, isMine: true })
    expect(summary.standings.reduce((sum, row) => sum + row.titles, 0)).toBe(1)
    expect(summary.standings[0]!.titles).toBe(1)
  })

  it('is only for dynasties', async () => {
    const plain = await host.post('/api/leagues', { name: 'Plain', visibility: 'private', cadence: 'daily', maxParties: 4, party: { name: 'P', crest } })
    expect((await host.get(`/api/leagues/${(plain.body as { id: string }).id}/dynasty`)).status).toBe(404)
  })
})
