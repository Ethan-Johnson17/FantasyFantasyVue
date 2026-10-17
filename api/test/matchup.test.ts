import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { DefenseWeekStatModel, PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'
import { as, draftedLeague, host, makeWeeksDue, type Player } from './leagueHelpers.js'
import { SEEDED_SEASON, seedStats } from './statsSeed.js'

const alice = as('auth0|alice')
const bob = as('auth0|bob')
const outsider = as('auth0|outsider')

interface Side {
  partyId: string
  name: string
  record: { wins: number; losses: number; draws: number }
  starters: { slot: string; hero: { id: string; restingNextWeek: boolean } | null }[]
  champion: string | null
  synergies: string[]
}
interface Matchup {
  week: number
  me: Side
  opponent: Side | null
  monster: { name: string } | null
  meetings: { week: number; myTotal: number; theirTotal: number; outcome: string }[]
}

const matchupOf = async (player: Player, id: string) => (await player.get(`/api/leagues/${id}/matchup`)).body as Matchup

async function rest(heroId: string, week: number) {
  const hero = (await HeroModel.findById(heroId).select('+source').lean())!
  if (hero.source.kind === 'player') await PlayerWeekStatModel.deleteMany({ playerId: hero.source.id, season: SEEDED_SEASON, week })
  else await DefenseWeekStatModel.deleteMany({ team: hero.source.id, season: SEEDED_SEASON, week })
}

beforeEach(async () => {
  await seedStats()
})

describe('GET /api/leagues/:id/matchup', () => {
  it("shows my next battle: both lineups, Champions, and records, from my side", async () => {
    const id = await draftedLeague([alice])
    const starter = Object.values(((await alice.get(`/api/leagues/${id}/lineup`)).body as { lineup: Record<string, string> }).lineup)[0]!
    await alice.put(`/api/leagues/${id}/champion`, { heroId: starter })

    const res = await alice.get(`/api/leagues/${id}/matchup`)
    expect(res.status).toBe(200)
    const view = res.body as Matchup
    expect(view.week).toBe(1)
    expect(view.me.name).toBe('Member 0')
    expect(view.opponent?.name).toBe('Host Party')
    expect(view.monster).toBeNull()
    expect(view.me.champion).toBe(starter)
    expect(view.opponent?.champion).toBeNull()
    for (const side of [view.me, view.opponent!]) {
      expect(side.starters).toHaveLength(5)
      expect(side.starters.every(entry => entry.hero)).toBe(true)
      expect(side.record).toEqual({ wins: 0, losses: 0, draws: 0 })
    }
    expect(view.meetings).toEqual([])
    // The host sees the same battle from the other side.
    const mirrored = await matchupOf(host, id)
    expect(mirrored.me.partyId).toBe(view.opponent?.partyId)
    // Hidden-player rule.
    expect(JSON.stringify(view)).not.toMatch(new RegExp(`source|season|${String(SEEDED_SEASON)}`))
  })

  it('marks resting starters and shows the synergies each lineup would trigger', async () => {
    const id = await draftedLeague([alice])
    const lineup = ((await alice.get(`/api/leagues/${id}/lineup`)).body as { lineup: Record<string, string> }).lineup
    const [a, b, c] = Object.values(lineup)
    await HeroModel.updateOne({ _id: a }, { $set: { traits: ['steadfast'] } })
    await HeroModel.updateOne({ _id: b }, { $set: { traits: ['wild', 'mighty'] } })
    await HeroModel.updateOne({ _id: c }, { $set: { traits: ['wild'] } })
    await alice.put(`/api/leagues/${id}/champion`, { heroId: b })

    let view = await matchupOf(alice, id)
    expect(new Set(view.me.synergies)).toEqual(new Set(['orderAndChaos', 'mightyChampion', 'bulwark']))
    expect(view.opponent?.synergies).toEqual([])

    // A resting Steadfast hero won't fight, so neither Order & Chaos nor Bulwark would trigger.
    await rest(a!, 1)
    view = await matchupOf(alice, id)
    expect(view.me.starters.find(entry => entry.hero?.id === a)?.hero?.restingNextWeek).toBe(true)
    expect(view.me.synergies).toEqual(['mightyChampion'])
  })

  it('lists earlier meetings with the stored totals, and moves on to the next week', async () => {
    const id = await draftedLeague([alice])
    await makeWeeksDue(id, 1)
    const view = await matchupOf(alice, id) // resolves week 1 first
    expect(view.week).toBe(2)

    const stored = await WeekResultModel.findOne({ leagueId: id, week: 1 }).lean()
    const mine = (await PartyModel.findOne({ leagueId: id, name: 'Member 0' }).lean())!
    const played = stored!.matchups[0]!
    const mySide = played.home.partyId.equals(mine._id) ? played.home : played.away!
    const theirSide = played.home.partyId.equals(mine._id) ? played.away! : played.home
    expect(view.meetings).toHaveLength(1)
    expect(view.meetings[0]).toMatchObject({ week: 1, myTotal: mySide.total, theirTotal: theirSide.total })
    const iAmHome = played.home.partyId.equals(mine._id)
    const expected = played.outcome === 'draw' ? 'draw' : (played.outcome === 'home') === iAmHome ? 'win' : 'loss'
    expect(view.meetings[0]!.outcome).toBe(expected)
    expect(view.me.record).toEqual({ wins: expected === 'win' ? 1 : 0, losses: expected === 'loss' ? 1 : 0, draws: expected === 'draw' ? 1 : 0 })
    expect(view.opponent!.record.wins).toBe(view.me.record.losses)
  })

  it('names the dungeon monster for a party with no opponent, matching the battle', async () => {
    const id = await draftedLeague([alice, bob])
    const players = [host, alice, bob]
    const views = await Promise.all(players.map(player => matchupOf(player, id)))
    const facing = views.find(view => view.opponent === null)!
    expect(facing.monster?.name).toBeTruthy()

    await makeWeeksDue(id, 1)
    await host.get(`/api/leagues/${id}`)
    const result = await WeekResultModel.findOne({ leagueId: id, week: 1 }).lean()
    expect(result!.matchups.find(m => !m.away)?.monster?.name).toBe(facing.monster?.name)
  })

  it('previews a later week too, without revealing who rests that far ahead', async () => {
    const id = await draftedLeague([alice])
    const starter = Object.values(((await alice.get(`/api/leagues/${id}/lineup`)).body as { lineup: Record<string, string> }).lineup)[0]!
    await rest(starter, 3)

    const later = (await alice.get(`/api/leagues/${id}/matchup?week=3`)).body as Matchup & { restingKnown: boolean; resolvesAt: string }
    expect(later.week).toBe(3)
    expect(later.restingKnown).toBe(false)
    expect(later.me.starters.every(entry => entry.hero?.restingNextWeek === false)).toBe(true)
    const next = (await alice.get(`/api/leagues/${id}/matchup`)).body as Matchup & { restingKnown: boolean; resolvesAt: string }
    expect(next.restingKnown).toBe(true)
    // Daily league: week 3 resolves two days after week 1.
    expect(new Date(later.resolvesAt).getTime() - new Date(next.resolvesAt).getTime()).toBe(2 * 24 * 60 * 60 * 1000)

    // Once it's week 3's turn, its resting heroes show.
    await makeWeeksDue(id, 2)
    const now = (await alice.get(`/api/leagues/${id}/matchup?week=3`)).body as Matchup & { restingKnown: boolean }
    expect(now.restingKnown).toBe(true)
    expect(now.me.starters.find(entry => entry.hero?.id === starter)?.hero?.restingNextWeek).toBe(true)
  })

  it('rejects played, out-of-range, and malformed weeks', async () => {
    const id = await draftedLeague([alice])
    await makeWeeksDue(id, 2)
    expect((await alice.get(`/api/leagues/${id}/matchup?week=1`)).status).toBe(400)
    expect((await alice.get(`/api/leagues/${id}/matchup?week=15`)).status).toBe(400)
    expect((await alice.get(`/api/leagues/${id}/matchup?week=abc`)).status).toBe(400)
    expect((await alice.get(`/api/leagues/${id}/matchup?week=3&x=1`)).status).toBe(400)
    expect((await alice.get(`/api/leagues/${id}/matchup?week=3`)).status).toBe(200)
  })

  it('is for members only, and only while a battle is coming', async () => {
    const id = await draftedLeague([alice])
    expect((await outsider.get(`/api/leagues/${id}/matchup`)).status).toBe(404)
    await makeWeeksDue(id, 30)
    expect((await alice.get(`/api/leagues/${id}/matchup`)).status).toBe(404)
    expect((await LeagueModel.findById(id).lean())?.status).toBe('complete')
  })
})
