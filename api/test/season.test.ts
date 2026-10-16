import mongoose from 'mongoose'
import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel, readLineup } from '../src/modules/leagues/party.model.js'
import { RULESET_V1 } from '../src/modules/scoring/rulesets.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { DefenseWeekStatModel, PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'
import { as, DAY, draftedLeague as draftLeague, host, makeWeeksDue } from './leagueHelpers.js'
import { SEEDED_SEASON, seedStats } from './statsSeed.js'

const alice = as('auth0|alice')
const bob = as('auth0|bob')
const outsider = as('auth0|outsider')
interface SideView {
  partyId: string
  total: number
  heroes: { heroId: string; slot: string; damage: number; resting: boolean; swappedInto: string | null }[]
}

interface LineupView {
  slots: { key: string; label: string; classes: string[] }[]
  lineup: Record<string, string> | null
  roster: { id: string; heroClass: string; restingNextWeek: boolean; partyId: string }[]
  nextWeek: number | null
}

/** The first slot that accepts a class. */
function slotFor(view: LineupView, heroClass: string): string {
  const slot = view.slots.find(s => s.classes.includes(heroClass))
  if (!slot) throw new Error(`No slot accepts ${heroClass}`)
  return slot.key
}

/** Deletes a hero's hidden NFL stats for week 1, so it rests that week. */
async function removeWeekOneStats(heroId: string) {
  const hero = (await HeroModel.findById(heroId).select('+source').lean())!
  if (hero.source.kind === 'player') {
    await PlayerWeekStatModel.deleteMany({ playerId: hero.source.id, season: SEEDED_SEASON, week: 1 })
  } else {
    await DefenseWeekStatModel.deleteMany({ team: hero.source.id, season: SEEDED_SEASON, week: 1 })
  }
}

/** A drafted league with alice as the second party. */
const draftedLeague = (members = [alice]) => draftLeague(members)

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
      expect(starters).toHaveLength(RULESET_V1.lineup.slots.length)
      expect(side.heroes).toHaveLength(10)
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

    // Recompute the total from raw stats: every seeded 2020 line is 100 rushing yards (10 points),
    // and each hero's damage is its points times its class multiplier.
    const lineup = readLineup(party.lineup)!
    let expected = 0
    for (const slot of RULESET_V1.lineup.slots) {
      const hero = heroes.find(h => h._id.toString() === lineup[slot.key])!
      const line = side.heroes.find(h => h.heroId.equals(hero._id))!
      expect(line.slot).toBe(slot.key)
      if (hero.source.kind === 'player') {
        const stat = await PlayerWeekStatModel.findOne({ playerId: hero.source.id, season: SEEDED_SEASON, week: 1 }).lean()
        expect(stat).not.toBeNull()
        expect(line.points).toBe(10)
      }
      expect(line.counted).toBeCloseTo(line.points * RULESET_V1.lineup.classMultipliers[hero.heroClass], 2)
      expected += line.counted
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

  it("shows my roster, the league's slots, my lineup, and the next week", async () => {
    const id = await draftedLeague()
    const view = await myLineup(id)
    expect(view.roster).toHaveLength(RULESET_V1.lineup.rosterSize)
    expect(view.slots.map(slot => slot.key)).toEqual(RULESET_V1.lineup.slots.map(slot => slot.key))
    expect(Object.keys(view.lineup ?? {}).sort()).toEqual(view.slots.map(slot => slot.key).sort())
    expect(view.nextWeek).toBe(1)
  })

  it('accepts a valid lineup and rejects invalid ones', async () => {
    const id = await draftedLeague()
    const view = await myLineup(id)
    const lineup = view.lineup!
    const [first, second] = view.slots
    const benchHero = view.roster.find(hero => !Object.values(lineup).includes(hero.id))!
    const slot = slotFor(view, benchHero.heroClass)
    const res = await alice.put(`/api/leagues/${id}/lineup`, { ...lineup, [slot]: benchHero.id })
    expect(res.status).toBe(200)
    expect(res.body.lineup[slot]).toBe(benchHero.id)

    const current = (await myLineup(id)).lineup!
    // Same hero twice
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...current, [second!.key]: current[first!.key] })).status).toBe(400)
    // Someone else's hero
    const hostRoster = ((await host.get(`/api/leagues/${id}/lineup`)).body as LineupView).roster
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...current, [first!.key]: hostRoster[0]!.id })).status).toBe(400)
    // Unknown slot, missing slot, non-member
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...current, Captain: benchHero.id })).status).toBe(400)
    const { [first!.key]: _removed, ...missing } = current
    expect((await alice.put(`/api/leagues/${id}/lineup`, missing)).status).toBe(400)
    expect((await outsider.put(`/api/leagues/${id}/lineup`, current)).status).toBe(404)
    // Class restrictions per slot are covered by the validateLineup unit tests (Classic slots accept any class).
  })

  it('locks at resolve time: a change after the deadline only affects later weeks', async () => {
    const id = await draftedLeague()
    const view = await myLineup(id)
    const lineup = view.lineup!
    const swap = view.roster.find(hero => !Object.values(lineup).includes(hero.id))!
    const slot = slotFor(view, swap.heroClass)
    const replaced = lineup[slot]!

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
    const view = await myLineup(id)
    const starterId = view.lineup![view.slots[0]!.key]!
    await removeWeekOneStats(starterId)

    const after = await myLineup(id)
    expect(after.roster.find(hero => hero.id === starterId)?.restingNextWeek).toBe(true)
    expect(after.roster.filter(hero => hero.restingNextWeek)).toHaveLength(1)

    await makeWeeksDue(id, 1)
    const result = (await alice.get(`/api/leagues/${id}/results/1`)).body
    const line = (result.matchups as { home: SideView; away: SideView | null }[])
      .flatMap(m => (m.away ? [m.home, m.away] : [m.home]))
      .flatMap(side => side.heroes)
      .find(hero => hero.heroId === starterId)
    expect(line).toMatchObject({ damage: 0, resting: true })
  })

  it('only allows changes while the season is running', async () => {
    const created = await host.post('/api/leagues', {
      name: 'Not drafted',
      visibility: 'private',
      cadence: 'daily',
      maxParties: 4,
      party: { name: 'Host Party', crest: { emblem: 'crown', banner: 'crimson' } }
    })
    const placeholder = '64b000000000000000000000'
    const slots = Object.fromEntries(RULESET_V1.lineup.slots.map(slot => [slot.key, placeholder]))
    expect((await host.put(`/api/leagues/${String(created.body.id)}/lineup`, slots)).status).toBe(409)

    const id = await draftedLeague()
    const { lineup } = await myLineup(id)
    await makeWeeksDue(id, 30)
    expect((await alice.put(`/api/leagues/${id}/lineup`, lineup!)).status).toBe(409)
  })
})

describe('auto-swap', () => {
  /**
   * Rests one of alice's starters for week 1 in a slot that a bench hero can fill,
   * so a swap is always possible.
   */
  async function restCoveredStarter(id: string) {
    const view = (await alice.get(`/api/leagues/${id}/lineup`)).body as LineupView
    const bench = view.roster.filter(hero => !Object.values(view.lineup!).includes(hero.id))
    const slot = slotFor(view, bench[0]!.heroClass)
    const starter = view.lineup![slot]!
    const accepts = view.slots.find(s => s.key === slot)!.classes
    await removeWeekOneStats(starter)
    return { starter, slot, benchIds: bench.filter(h => accepts.includes(h.heroClass)).map(h => h.id) }
  }

  function aliceSide(result: { matchups: { home: SideView; away: SideView | null }[] }, heroId: string) {
    return result.matchups.flatMap(m => (m.away ? [m.home, m.away] : [m.home])).find(side => side.heroes.some(h => h.heroId === heroId))!
  }

  it('is on by default and swaps a resting starter for a bench hero at 50% points', async () => {
    const id = await draftedLeague()
    expect(((await alice.get(`/api/leagues/${id}/lineup`)).body as LineupView & { autoSwap: boolean }).autoSwap).toBe(true)
    const { starter, slot, benchIds } = await restCoveredStarter(id)

    await makeWeeksDue(id, 1)
    const side = aliceSide((await alice.get(`/api/leagues/${id}/results/1`)).body, starter)
    expect(side.heroes.find(h => h.heroId === starter)).toMatchObject({ slot, resting: true, damage: 0 })
    // Seeded players score 10 a week; Paladins score from their defense line. Either way the sub counts half.
    const sub = side.heroes.find(h => h.swappedInto === slot)!
    expect(benchIds).toContain(sub.heroId)
    expect(sub.slot).toBe('Bench')
    const subRaw = await WeekResultModel.findOne({ leagueId: id, week: 1 }).lean()
    const stored = subRaw!.matchups.flatMap(m => (m.away ? [m.home, m.away] : [m.home])).flatMap(x => x.heroes).find(h => h.heroId.toString() === sub.heroId)!
    const subClass = (await HeroModel.findById(sub.heroId).lean())!.heroClass
    const { classMultipliers, autoSwapMultiplier } = RULESET_V1.lineup
    expect(stored.counted).toBeCloseTo(stored.points * classMultipliers[subClass] * autoSwapMultiplier, 2)
    // The total is the sum of the exact counted points (views round each hero, so compare stored values).
    const storedSide = subRaw!.matchups
      .flatMap(m => (m.away ? [m.home, m.away] : [m.home]))
      .find(x => x.partyId.toString() === side.partyId)!
    const exactCounted = storedSide.heroes.filter(h => h.slot !== 'Bench' || h.swappedInto).reduce((sum, h) => sum + h.counted, 0)
    expect(storedSide.total).toBeCloseTo(exactCounted, 6)
    expect(side.total).toBe(storedSide.total)
  })

  it('can be turned off per party', async () => {
    const id = await draftedLeague()
    const mine = ((await alice.get(`/api/leagues/${id}`)).body.parties as { id: string; isMine: boolean }[]).find(p => p.isMine)!
    expect((await alice.patch(`/api/parties/${mine.id}`, { autoSwap: 'yes' })).status).toBe(400)
    const res = await alice.patch(`/api/parties/${mine.id}`, { autoSwap: false })
    expect(res.status).toBe(200)
    expect(res.body.autoSwap).toBe(false)

    const { starter } = await restCoveredStarter(id)
    await makeWeeksDue(id, 1)
    const side = aliceSide((await alice.get(`/api/leagues/${id}/results/1`)).body, starter)
    expect(side.heroes.every(h => h.swappedInto === null)).toBe(true)
  })
})

describe('weekly Champion and synergies', () => {
  const { classMultipliers, autoSwapMultiplier } = RULESET_V1.lineup
  const { championMultiplier, mightyChampionMultiplier, orderAndChaosBonus, bulwarkFloor } = RULESET_V1.strategy

  async function myLineup(id: string) {
    return (await alice.get(`/api/leagues/${id}/lineup`)).body as LineupView & { champion: string | null }
  }

  /** Alice's stored side for a week, found by her party id. */
  async function storedSide(id: string, week: number, partyId: string) {
    const result = await WeekResultModel.findOne({ leagueId: id, week }).lean()
    return result!.matchups.flatMap(m => (m.away ? [m.home, m.away] : [m.home])).find(side => side.partyId.toString() === partyId)!
  }

  /** A hero's base damage that week: points times its class multiplier. */
  async function baseDamage(heroId: string, line: { points: number }) {
    const hero = (await HeroModel.findById(heroId).lean())!
    return line.points * classMultipliers[hero.heroClass]
  }

  it('names a starter, who stays Champion week after week', async () => {
    const id = await draftedLeague()
    const view = await myLineup(id)
    const partyId = view.roster[0]!.partyId
    const starter = view.lineup![view.slots[0]!.key]!
    const benched = view.roster.find(hero => !Object.values(view.lineup!).includes(hero.id))!

    expect(view.champion).toBeNull()
    expect((view as unknown as { strategy: unknown }).strategy).toEqual(RULESET_V1.strategy)
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: benched.id })).status).toBe(400)
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: 'nope' })).status).toBe(400)
    expect((await alice.put(`/api/leagues/${id}/champion`, {})).status).toBe(400)
    expect((await outsider.put(`/api/leagues/${id}/champion`, { heroId: starter })).status).toBe(404)
    const named = await alice.put(`/api/leagues/${id}/champion`, { heroId: starter.toUpperCase() })
    expect(named.status).toBe(200)
    expect(named.body.champion).toBe(starter)

    await makeWeeksDue(id, 2)
    await alice.get(`/api/leagues/${id}`)
    const week1 = await storedSide(id, 1, partyId)
    expect(week1.champion?.toString()).toBe(starter)
    const line1 = week1.heroes.find(h => h.heroId.toString() === starter)!
    expect(line1.counted).toBeCloseTo((await baseDamage(starter, line1)) * championMultiplier, 2)

    // Carries over to week 2 without being named again.
    const week2 = await storedSide(id, 2, partyId)
    expect(week2.champion?.toString()).toBe(starter)
    const line2 = week2.heroes.find(h => h.heroId.toString() === starter)!
    expect(line2.counted).toBeCloseTo((await baseDamage(starter, line2)) * championMultiplier, 2)
    expect((await myLineup(id)).champion).toBe(starter)
  })

  it('locks at resolve time: naming a Champion after the deadline only counts from the next week', async () => {
    const id = await draftedLeague()
    const view = await myLineup(id)
    const partyId = view.roster[0]!.partyId
    const starter = view.lineup![view.slots[0]!.key]!
    await makeWeeksDue(id, 1)
    // Week 1 is due but unresolved; this request resolves it first.
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: starter })).status).toBe(200)
    expect((await storedSide(id, 1, partyId)).champion).toBeNull()
    expect((await myLineup(id)).champion).toBe(starter)
  })

  it('can be withdrawn, and benching the Champion withdraws them', async () => {
    const id = await draftedLeague()
    const view = await myLineup(id)
    const slot = view.slots[0]!.key
    const starter = view.lineup![slot]!
    const benched = view.roster.find(hero => !Object.values(view.lineup!).includes(hero.id))!

    await alice.put(`/api/leagues/${id}/champion`, { heroId: starter })
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: null })).body.champion).toBeNull()

    await alice.put(`/api/leagues/${id}/champion`, { heroId: starter })
    expect((await alice.put(`/api/leagues/${id}/lineup`, { ...view.lineup, [slot]: benched.id })).status).toBe(200)
    expect((await myLineup(id)).champion).toBeNull()
  })

  it('gives a resting Champion nothing, and never boosts the hero swapped in for them', async () => {
    const id = await draftedLeague()
    const view = await myLineup(id)
    const partyId = view.roster[0]!.partyId
    const slot = view.slots[0]!.key
    const starter = view.lineup![slot]!
    await alice.put(`/api/leagues/${id}/champion`, { heroId: starter })
    await removeWeekOneStats(starter)

    await makeWeeksDue(id, 1)
    await alice.get(`/api/leagues/${id}`)
    const side = await storedSide(id, 1, partyId)
    expect(side.heroes.find(h => h.heroId.toString() === starter)).toMatchObject({ resting: true, counted: 0 })
    const sub = side.heroes.find(h => h.swappedInto === slot)!
    expect(sub.counted).toBeCloseTo((await baseDamage(sub.heroId.toString(), sub)) * autoSwapMultiplier, 2)
  })

  it('applies trait synergies and shows them with the Champion in results', async () => {
    const id = await draftedLeague()
    const view = await myLineup(id)
    const partyId = view.roster[0]!.partyId
    const steady = view.lineup![view.slots[0]!.key]!
    const champion = view.lineup![view.slots[1]!.key]!
    await HeroModel.updateOne({ _id: steady }, { $set: { traits: ['steadfast'] } })
    await HeroModel.updateOne({ _id: champion }, { $set: { traits: ['wild', 'mighty'] } })
    await alice.put(`/api/leagues/${id}/champion`, { heroId: champion })

    await makeWeeksDue(id, 1)
    await alice.get(`/api/leagues/${id}`)
    const side = await storedSide(id, 1, partyId)
    expect(new Set(side.synergies)).toEqual(new Set(['orderAndChaos', 'mightyChampion', 'bulwark']))
    const line = side.heroes.find(h => h.heroId.toString() === champion)!
    expect(line.counted).toBeCloseTo(Math.max((await baseDamage(champion, line)) * mightyChampionMultiplier, bulwarkFloor), 2)
    const fought = side.heroes.filter(h => h.slot !== 'Bench' || h.swappedInto).reduce((sum, h) => sum + h.counted, 0)
    expect(side.total).toBeCloseTo(fought * (1 + orderAndChaosBonus), 2)

    const result = (await alice.get(`/api/leagues/${id}/results/1`)).body as {
      matchups: { home: SideView & { champion: string | null; synergies: string[] }; away: (SideView & { champion: string | null; synergies: string[] }) | null }[]
    }
    const mine = result.matchups.flatMap(m => (m.away ? [m.home, m.away] : [m.home])).find(s => s.partyId === partyId)!
    expect(mine.champion).toBe(champion)
    expect(new Set(mine.synergies)).toEqual(new Set(side.synergies))
    expect(mine.total).toBe(side.total)

    const heroes = (await alice.get(`/api/leagues/${id}/heroes`)).body as { id: string; traits: string[] }[]
    expect(heroes.find(h => h.id === champion)?.traits).toEqual(['wild', 'mighty'])
  })

  it('can only be named while the season is running', async () => {
    const created = await host.post('/api/leagues', {
      name: 'Not drafted',
      visibility: 'private',
      cadence: 'daily',
      maxParties: 4,
      party: { name: 'Host Party', crest: { emblem: 'crown', banner: 'crimson' } }
    })
    const placeholder = '64b000000000000000000000'
    expect((await host.put(`/api/leagues/${String(created.body.id)}/champion`, { heroId: placeholder })).status).toBe(409)

    const id = await draftedLeague()
    const starter = Object.values((await myLineup(id)).lineup!)[0]!
    await makeWeeksDue(id, 30)
    expect((await alice.put(`/api/leagues/${id}/champion`, { heroId: starter })).status).toBe(409)
  })
})

describe('hidden-player protection in results', () => {
  it('rounds per-hero damage and never exposes sources or the season', async () => {
    const id = await draftedLeague([alice, bob])
    // Give one hero a fractional score so rounding is observable.
    const party = await PartyModel.findOne({ leagueId: id }).lean()
    const starters = await HeroModel.find({ _id: mongoose.trusted({ $in: Object.values(readLineup(party!.lineup)!) }) }).select('+source').lean()
    const target = starters.find(hero => hero.source.kind === 'player')!
    await PlayerWeekStatModel.updateOne(
      { playerId: target.source.id, season: SEEDED_SEASON, week: 1 },
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
    // 104 rushing yards + 1 passing yard = 10.44 points, times the class multiplier, shown rounded
    const expectedDamage = Math.round(10.44 * RULESET_V1.lineup.classMultipliers[target.heroClass])
    expect(heroes.find(hero => hero.heroId === target._id.toString())?.damage).toBe(expectedDamage)
  })
})

describe('league views after the draft', () => {
  it('include the draft order and every pick', async () => {
    const id = await draftedLeague([alice, bob])
    const league = (await alice.get(`/api/leagues/${id}`)).body
    expect(league.draft.order).toHaveLength(3)
    expect(league.draft.picks).toHaveLength(RULESET_V1.lineup.rosterSize * 3)
    expect(league.draft.picks[0]).toMatchObject({ round: 1, overall: 1, partyId: league.draft.order[0] })
    expect(JSON.stringify(league.draft)).not.toMatch(/source|season|seed/)
  })

  it("show my party's record and rank on My leagues once games are played", async () => {
    const id = await draftedLeague()
    const before = (await alice.get('/api/leagues/mine')).body.find((l: { id: string }) => l.id === id)
    expect(before.standing).toBeNull()

    await makeWeeksDue(id, 3)
    type Standing = { rank: number; wins: number; losses: number; draws: number }
    const after = ((await alice.get('/api/leagues/mine')).body as { id: string; standing: Standing }[]).find(l => l.id === id)!
    expect(after.standing.wins + after.standing.losses + after.standing.draws).toBe(3)
    expect([1, 2]).toContain(after.standing.rank)
  })
})

describe('GET /api/leagues/:id/heroes/:heroId', () => {
  it("returns the hero and its rounded week-by-week damage", async () => {
    const id = await draftedLeague()
    const { lineup } = (await alice.get(`/api/leagues/${id}/lineup`)).body as LineupView
    const heroId = Object.values(lineup!)[0]!
    await makeWeeksDue(id, 3)

    const res = await alice.get(`/api/leagues/${id}/heroes/${heroId}`)
    expect(res.status).toBe(200)
    expect(res.body.hero.id).toBe(heroId)
    expect(res.body.history.map((h: { week: number }) => h.week)).toEqual([1, 2, 3])
    for (const week of res.body.history as { damage: number }[]) expect(Number.isInteger(week.damage)).toBe(true)
    expect(res.text).not.toMatch(/"source"|"season"|Real |QB-\d/)
  })

  it('hides heroes from outsiders of private leagues and from other leagues', async () => {
    const id = await draftedLeague()
    const other = await draftedLeague([bob])
    const { lineup } = (await alice.get(`/api/leagues/${id}/lineup`)).body as LineupView
    const heroId = Object.values(lineup!)[0]!
    expect((await outsider.get(`/api/leagues/${id}/heroes/${heroId}`)).status).toBe(404)
    expect((await bob.get(`/api/leagues/${other}/heroes/${heroId}`)).status).toBe(404)
  })
})
