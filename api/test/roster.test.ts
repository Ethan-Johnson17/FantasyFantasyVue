import { beforeEach, describe, expect, it } from 'vitest'
import { AccountModel } from '../src/modules/accounts/account.model.js'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { claimFreeAgent } from '../src/modules/roster/roster.service.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { as, draftedLeague, host, makeWeeksDue, type Player } from './leagueHelpers.js'
import { seedStats } from './statsSeed.js'

const alice = as('auth0|alice')
const bob = as('auth0|bob')
const outsider = as('auth0|outsider')

interface Lineup {
  lineup: Record<string, string>
  champion: string | null
  roster: { id: string; partyId: string }[]
}
interface HeroView {
  id: string
  partyId: string | null
}

async function lineupOf(player: Player, id: string) {
  return (await player.get(`/api/leagues/${id}/lineup`)).body as Lineup
}
async function freeAgents(id: string) {
  return ((await host.get(`/api/leagues/${id}/heroes`)).body as HeroView[]).filter(hero => hero.partyId === null)
}

beforeEach(async () => {
  await seedStats()
})

describe('free agency', () => {
  it('claims a free agent by dropping a hero; the new hero takes the dropped starter’s slot', async () => {
    const id = await draftedLeague([alice])
    const before = await lineupOf(alice, id)
    const [slot, dropped] = Object.entries(before.lineup)[0]!
    const target = (await freeAgents(id))[0]!

    const res = await alice.post(`/api/leagues/${id}/claims`, { heroId: target.id, dropHeroId: dropped })
    expect(res.status).toBe(200)
    const after = res.body as Lineup
    expect(after.lineup[slot]).toBe(target.id)
    expect(after.roster.map(hero => hero.id)).toContain(target.id)
    expect(after.roster.map(hero => hero.id)).not.toContain(dropped)
    expect(after.roster).toHaveLength(before.roster.length)

    // The dropped hero is a free agent now, and the move is visible to the league.
    expect((await freeAgents(id)).map(hero => hero.id)).toContain(dropped)
    const moves = (await host.get(`/api/leagues/${id}/moves`)).body as { kind: string; added: { heroId: string }; dropped: { heroId: string }; effectiveWeek: number }[]
    expect(moves).toHaveLength(1)
    expect(moves[0]).toMatchObject({ kind: 'claim', added: { heroId: target.id }, dropped: { heroId: dropped }, effectiveWeek: 1 })
    expect(JSON.stringify(moves)).not.toMatch(/source|season/)
  })

  it('dropping a bench hero leaves the lineup unchanged', async () => {
    const id = await draftedLeague([alice])
    const before = await lineupOf(alice, id)
    const benched = before.roster.find(hero => !Object.values(before.lineup).includes(hero.id))!
    const target = (await freeAgents(id))[0]!
    const after = (await alice.post(`/api/leagues/${id}/claims`, { heroId: target.id, dropHeroId: benched.id })).body as Lineup
    expect(after.lineup).toEqual(before.lineup)
  })

  it('is first come, first served when two parties claim the same hero at once', async () => {
    const id = await draftedLeague([alice, bob])
    const target = (await freeAgents(id))[0]!
    const aliceDrop = (await lineupOf(alice, id)).roster[0]!.id
    const bobDrop = (await lineupOf(bob, id)).roster[0]!.id

    const results = await Promise.all([
      alice.post(`/api/leagues/${id}/claims`, { heroId: target.id, dropHeroId: aliceDrop }),
      bob.post(`/api/leagues/${id}/claims`, { heroId: target.id, dropHeroId: bobDrop })
    ])
    expect(results.map(r => r.status).sort()).toEqual([200, 409])
    // The loser keeps the hero they offered to drop, and nobody's roster changes size.
    const winner = results[0].status === 200 ? alice : bob
    const loserDrop = winner === alice ? bobDrop : aliceDrop
    expect((await HeroModel.findById(loserDrop).lean())?.partyId).not.toBeNull()
    expect((await HeroModel.findById(target.id).lean())?.partyId?.toString()).toBe((await lineupOf(winner, id)).roster[0]!.partyId)
    for (const party of await PartyModel.find({ leagueId: id })) {
      expect(await HeroModel.countDocuments({ partyId: party._id })).toBe(10)
    }
  })

  it('rejects claims that break the rules', async () => {
    const id = await draftedLeague([alice])
    const mine = (await lineupOf(alice, id)).roster
    const theirs = (await lineupOf(host, id)).roster
    const free = (await freeAgents(id))[0]!
    const claim = (player: Player, body: object) => player.post(`/api/leagues/${id}/claims`, body)

    expect((await claim(alice, { heroId: free.id, dropHeroId: theirs[0]!.id })).status).toBe(400) // not my hero
    expect((await claim(alice, { heroId: theirs[0]!.id, dropHeroId: mine[0]!.id })).status).toBe(409) // already drafted
    expect((await claim(alice, { heroId: '64b000000000000000000000', dropHeroId: mine[0]!.id })).status).toBe(404)
    expect((await claim(alice, { heroId: mine[0]!.id, dropHeroId: mine[0]!.id })).status).toBe(400)
    expect((await claim(alice, { heroId: free.id })).status).toBe(400)
    expect((await claim(alice, { heroId: free.id, dropHeroId: mine[0]!.id, extra: 1 })).status).toBe(400)
    expect((await claim(outsider, { heroId: free.id, dropHeroId: mine[0]!.id })).status).toBe(404)
    // Nothing changed.
    expect((await lineupOf(alice, id)).roster.map(hero => hero.id).sort()).toEqual(mine.map(hero => hero.id).sort())

    await makeWeeksDue(id, 30)
    expect((await claim(alice, { heroId: free.id, dropHeroId: mine[0]!.id })).status).toBe(409) // season over
  })

  it('is closed before the draft', async () => {
    const created = await host.post('/api/leagues', {
      name: 'Not drafted',
      visibility: 'private',
      cadence: 'daily',
      maxParties: 4,
      party: { name: 'Host Party', crest: { emblem: 'crown', banner: 'crimson' } }
    })
    const placeholder = '64b000000000000000000000'
    const res = await host.post(`/api/leagues/${String(created.body.id)}/claims`, { heroId: placeholder, dropHeroId: '64b000000000000000000001' })
    expect(res.status).toBe(409)
  })

  it('never changes a week that is already due', async () => {
    const id = await draftedLeague([alice])
    const before = await lineupOf(alice, id)
    const dropped = Object.values(before.lineup)[0]!
    const target = (await freeAgents(id))[0]!
    await makeWeeksDue(id, 1)

    // Week 1 is due but unresolved; this request resolves it first, with the old roster.
    expect((await alice.post(`/api/leagues/${id}/claims`, { heroId: target.id, dropHeroId: dropped })).status).toBe(200)
    const week1 = await WeekResultModel.findOne({ leagueId: id, week: 1 }).lean()
    const lines = week1!.matchups.flatMap(m => (m.away ? [m.home, m.away] : [m.home])).flatMap(side => side.heroes)
    expect(lines.some(line => line.heroId.toString() === dropped)).toBe(true)
    expect(lines.some(line => line.heroId.toString() === target.id)).toBe(false)
    const moves = (await alice.get(`/api/leagues/${id}/moves`)).body as { effectiveWeek: number }[]
    expect(moves[0]!.effectiveWeek).toBe(2)
  })

  it('refuses while a due battle is still unresolved', async () => {
    const id = await draftedLeague([alice])
    const before = await lineupOf(alice, id)
    const target = (await freeAgents(id))[0]!
    await makeWeeksDue(id, 1)
    // Called directly, skipping the route's catch-up step, as if another request were mid-resolution.
    const account = (await AccountModel.findOne({ authSub: alice.sub }))!
    await expect(claimFreeAgent(account, id, target.id, before.roster[0]!.id)).rejects.toThrow(/battle is being resolved/)
    expect((await HeroModel.findById(target.id).lean())?.partyId).toBeNull()
  })

  it('withdraws the Champion when the Champion is dropped', async () => {
    const id = await draftedLeague([alice])
    const before = await lineupOf(alice, id)
    const champion = Object.values(before.lineup)[0]!
    await alice.put(`/api/leagues/${id}/champion`, { heroId: champion })
    const target = (await freeAgents(id))[0]!
    const after = (await alice.post(`/api/leagues/${id}/claims`, { heroId: target.id, dropHeroId: champion })).body as Lineup
    expect(after.champion).toBeNull()
  })
})

describe('free agent history', () => {
  it('shows what a free agent would have dealt, rounded, then real results once claimed', async () => {
    const id = await draftedLeague([alice])
    const target = (await freeAgents(id))[0]!
    await makeWeeksDue(id, 1)
    await alice.get(`/api/leagues/${id}`)

    const detail = (await alice.get(`/api/leagues/${id}/heroes/${target.id}`)).body as {
      history: { week: number; slot: string; damage: number; resting: boolean }[]
    }
    expect(detail.history).toHaveLength(1)
    expect(detail.history[0]).toMatchObject({ week: 1, slot: 'Free agent' })
    expect(Number.isInteger(detail.history[0]!.damage)).toBe(true)

    const [slot, drop] = Object.entries((await lineupOf(alice, id)).lineup)[0]!
    await alice.post(`/api/leagues/${id}/claims`, { heroId: target.id, dropHeroId: drop })
    await makeWeeksDue(id, 2)
    await alice.get(`/api/leagues/${id}`)
    const later = (await alice.get(`/api/leagues/${id}/heroes/${target.id}`)).body as { history: { week: number; slot: string }[] }
    expect(later.history.map(entry => [entry.week, entry.slot])).toEqual([
      [1, 'Free agent'],
      [2, slot]
    ])
  })
})
