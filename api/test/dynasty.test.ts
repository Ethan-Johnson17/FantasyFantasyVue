import mongoose from 'mongoose'
import { beforeEach, describe, expect, it } from 'vitest'
import { createRng } from '../src/lib/random.js'
import { LAST_LEAGUE_SEASON, pickSeason } from '../src/modules/draft/candidates.js'
import { DYNASTY_KEEPERS } from '../src/modules/dynasty/dynasty.service.js'
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
  options: { heroId: string; name: string; heroClass: string; previousLevel: number | null; level: number | null; retired: boolean; kept: boolean }[]
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
