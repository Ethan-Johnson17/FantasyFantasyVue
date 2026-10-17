import { beforeEach, describe, expect, it } from 'vitest'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { as, draftedLeague, host, makeWeeksDue } from './leagueHelpers.js'
import { SEEDED_SEASON, seedStats } from './statsSeed.js'

const alice = as('auth0|alice')
const bob = as('auth0|bob')
const outsider = as('auth0|outsider')

interface Finale {
  champion: { partyId: string; name: string }
  standings: { partyId: string; wins: number }[]
  myFinish: { partyId: string; rank: number } | null
  awards: (Record<string, unknown> & { kind: string })[]
}

beforeEach(async () => {
  await seedStats()
})

/** Plays a whole season and opens the league so it completes. */
async function finishedLeague() {
  const id = await draftedLeague([alice, bob])
  await makeWeeksDue(id, 14)
  await host.get(`/api/leagues/${id}`)
  return id
}

describe('GET /api/leagues/:id/finale', () => {
  it("isn't available until the season is over", async () => {
    const id = await draftedLeague([alice])
    expect((await alice.get(`/api/leagues/${id}/finale`)).status).toBe(409)
  })

  it('crowns the first-place party and shows my finish', async () => {
    const id = await finishedLeague()
    const finale = (await alice.get(`/api/leagues/${id}/finale`)).body as Finale
    const standings = (await alice.get(`/api/leagues/${id}/standings`)).body as { partyId: string }[]
    expect(finale.champion.partyId).toBe(standings[0]!.partyId)
    expect(finale.standings.map(row => row.partyId)).toEqual(standings.map(row => row.partyId))
    const mine = (await PartyModel.findOne({ leagueId: id, name: 'Member 0' }).lean())!
    expect(finale.myFinish).toEqual({ partyId: mine._id.toString(), rank: standings.findIndex(row => row.partyId === mine._id.toString()) + 1 })
  })

  it('gives awards that match the stored results, with hero damage rounded', async () => {
    const id = await finishedLeague()
    const finale = (await alice.get(`/api/leagues/${id}/finale`)).body as Finale
    const award = (kind: string) => finale.awards.find(a => a.kind === kind)!
    // Crit awards follow when anyone rolled one (covered in crits.test.ts).
    expect(finale.awards.map(a => a.kind).slice(0, 5)).toEqual(['mightiestBlow', 'heroOfTheSeason', 'greatestStrike', 'closestBattle', 'unbreakable'])

    const results = await WeekResultModel.find({ leagueId: id }).lean()
    const sides = results.flatMap(r => r.matchups.flatMap(m => (m.away ? [m.home, m.away] : [m.home])))
    expect(award('mightiestBlow').total).toBe(Math.max(...sides.map(s => s.total)))
    const lines = sides.flatMap(s => s.heroes)
    expect(award('greatestStrike').damage).toBe(Math.round(Math.max(...lines.map(l => l.counted))))

    const perHero = new Map<string, number>()
    for (const line of lines) perHero.set(line.heroId.toString(), (perHero.get(line.heroId.toString()) ?? 0) + Math.max(0, line.counted))
    expect(award('heroOfTheSeason').damage).toBe(Math.round(Math.max(...perHero.values())))

    const margins = results.flatMap(r => r.matchups.filter(m => m.away && m.outcome !== 'draw').map(m => Math.abs(m.home.total - m.away!.total)))
    expect(award('closestBattle').margin).toBeCloseTo(Math.min(...margins), 2)

    const faced = new Map<string, number>()
    for (const r of results) {
      for (const m of r.matchups) {
        const add = (partyId: string, value: number) => faced.set(partyId, (faced.get(partyId) ?? 0) + value)
        add(m.home.partyId.toString(), m.away?.total ?? m.monster?.total ?? 0)
        if (m.away) add(m.away.partyId.toString(), m.home.total)
      }
    }
    expect(award('unbreakable').damageFaced).toBeCloseTo(Math.min(...faced.values()), 2)
    for (const kind of ['heroOfTheSeason', 'greatestStrike']) expect(Number.isInteger(award(kind).damage)).toBe(true)

    // No reveal: nothing about the real season or players.
    expect(JSON.stringify(finale)).not.toMatch(new RegExp(`source|season|${String(SEEDED_SEASON)}`))
  })

  it('is hidden from outsiders of a private league', async () => {
    const id = await finishedLeague()
    expect((await outsider.get(`/api/leagues/${id}/finale`)).status).toBe(404)
  })
})
