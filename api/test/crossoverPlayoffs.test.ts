import { beforeEach, describe, expect, it } from 'vitest'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { gameWinner } from '../src/modules/season/bracket.js'
import { leaguePlayoffs } from '../src/modules/season/calendar.js'
import { schedulePlayoffWeek, seasonChampion } from '../src/modules/season/season.service.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { draftedCrossover } from './crossoverLeague.js'
import { seedCrossover } from './crossoverSeed.js'
import { host } from './leagueHelpers.js'

/* Crossover playoffs (docs/CROSSOVER_SPEC.md, "Playoffs"): the bracket fills the league's last NFL weeks. */

type Outcome = 'home' | 'away' | 'draw'

const crossover = (partyCount: number, weeks: number, playoffs = true) => ({
  mode: 'crossover' as const,
  playoffs,
  partyCount,
  nflWeeks: Array.from({ length: weeks }, () => ({}))
})

describe('the Crossover bracket', () => {
  it('ends in the league’s last week, with the regular season before it', () => {
    // From NFL week 1 through 17: the full bracket in NFL weeks 15-17.
    expect(leaguePlayoffs(crossover(8, 17))).toEqual({ spots: 6, rounds: 3, regularWeeks: 14 })
    // Smaller leagues need fewer rounds, so their regular season runs longer.
    expect(leaguePlayoffs(crossover(5, 17))).toEqual({ spots: 4, rounds: 2, regularWeeks: 15 })
    expect(leaguePlayoffs(crossover(2, 10))).toEqual({ spots: 2, rounds: 1, regularWeeks: 9 })
  })

  it('shrinks to keep a 4-week regular season, and drops out when even a final won’t fit', () => {
    expect(leaguePlayoffs(crossover(8, 6))).toEqual({ spots: 4, rounds: 2, regularWeeks: 4 })
    expect(leaguePlayoffs(crossover(8, 5))).toEqual({ spots: 2, rounds: 1, regularWeeks: 4 })
    expect(leaguePlayoffs(crossover(8, 4))).toBeNull()
    expect(leaguePlayoffs(crossover(8, 17, false))).toBeNull()
    // Before the draft sets the calendar, there's nothing to plan yet.
    expect(leaguePlayoffs(crossover(8, 0))).toBeNull()
  })

  it('decides a game by boards won, a 1-1 split by the Quest board, and two draws for the higher seed', () => {
    const game = { high: 'high', low: 'low' }
    const cases: [Outcome, Outcome, string][] = [
      ['home', 'home', 'high'],
      ['away', 'away', 'low'],
      ['away', 'home', 'low'], // split: the Quest board decides
      ['home', 'away', 'high'],
      ['draw', 'away', 'low'], // 1½-½
      ['draw', 'home', 'high'],
      ['away', 'draw', 'low'],
      ['draw', 'draw', 'high']
    ]
    for (const [quest, gridiron, winner] of cases) expect(gameWinner(game, quest, gridiron), `${quest}/${gridiron}`).toBe(winner)
  })
})

describe('a Crossover final', () => {
  beforeEach(async () => {
    await seedCrossover()
  })

  const side = (partyId: string, total: number, gridiron: number) => ({
    partyId,
    total,
    top: total,
    bench: 0,
    heroes: [],
    gridiron: { total: gridiron, top: gridiron, bench: 0 }
  })

  /** A drafted two-party league (NFL weeks 8-17) whose host swept week 1, so the host is the top seed. */
  async function seeded() {
    const id = await draftedCrossover({ playoffs: true })
    const parties = await PartyModel.find({ leagueId: id }).lean()
    const hostParty = parties.find(party => party.name === 'Host Party')!._id.toString()
    const aliceParty = parties.find(party => party.name === 'Alice Party')!._id.toString()
    await WeekResultModel.create({
      leagueId: id,
      week: 1,
      matchups: [{ home: side(hostParty, 90, 120), away: side(aliceParty, 60, 80), monster: null, outcome: 'home', gridironOutcome: 'home' }]
    })
    return { id, hostParty, aliceParty }
  }

  it('plays the regular season round robin, then the final in NFL week 17', async () => {
    const id = await draftedCrossover({ playoffs: true })
    const detail = (await host.get(`/api/leagues/${id}`)).body as { seasonWeeks: number; playoffs: unknown }
    expect(detail).toMatchObject({ seasonWeeks: 10, playoffs: { spots: 2, rounds: 1, regularWeeks: 9 } })
    const league = (await LeagueModel.findById(id).lean())!
    expect(league.schedule?.map(entry => entry.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(league.nflWeeks?.at(-1)?.nflWeek).toBe(17)
  })

  it('keeps today’s rules without playoffs', async () => {
    const id = await draftedCrossover()
    expect(((await host.get(`/api/leagues/${id}`)).body as { playoffs: unknown }).playoffs).toBeNull()
    expect((await LeagueModel.findById(id).lean())!.schedule).toHaveLength(10)
    expect((await host.get(`/api/leagues/${id}/playoffs`)).status).toBe(404)
  })

  it('seeds the final from board wins, and the Quest board breaks a split', async () => {
    const { id, hostParty, aliceParty } = await seeded()
    const league = (await LeagueModel.findById(id))!
    await schedulePlayoffWeek(league, 10)
    const final = (await LeagueModel.findById(id).lean())!.schedule!.find(entry => entry.week === 10)!
    expect(final.matchups.map(m => [m.home.toString(), m.away?.toString(), m.kind])).toEqual([[hostParty, aliceParty, 'playoff']])

    // Alice wins the Quest board, the host the Gridiron: the Quest board decides.
    await WeekResultModel.create({
      leagueId: id,
      week: 10,
      matchups: [{ home: side(hostParty, 50, 140), away: side(aliceParty, 70, 100), monster: null, outcome: 'away', gridironOutcome: 'home', kind: 'playoff' }]
    })
    expect((await seasonChampion(league))?.partyId).toBe(aliceParty)
    const bracket = (await host.get(`/api/leagues/${id}/playoffs`)).body as { rounds: { week: number; name: string; games: object[] }[]; champion: { partyId: string } }
    expect(bracket.rounds).toEqual([
      expect.objectContaining({
        week: 10,
        name: 'Final',
        games: [
          expect.objectContaining({
            high: expect.objectContaining({ partyId: hostParty, total: 50, gridiron: 140 }),
            low: expect.objectContaining({ partyId: aliceParty, total: 70, gridiron: 100 }),
            winner: aliceParty
          })
        ]
      })
    ])
    expect(bracket.champion.partyId).toBe(aliceParty)

    // The other way round, the host takes it.
    await WeekResultModel.updateOne({ leagueId: id, week: 10 }, { $set: { 'matchups.0.outcome': 'home', 'matchups.0.gridironOutcome': 'away' } })
    expect((await seasonChampion(league))?.partyId).toBe(hostParty)
    // The final doesn't count in the standings: one regular-season week, both boards.
    const standings = (await host.get(`/api/leagues/${id}/standings`)).body as { partyId: string; wins: number; losses: number }[]
    expect(standings.find(row => row.partyId === aliceParty)).toMatchObject({ wins: 0, losses: 2 })
  })
})

describe('a late Crossover league', () => {
  it('fits a final after a 4-week regular season', async () => {
    await seedCrossover({ nextWeek: 13 })
    const id = await draftedCrossover({ playoffs: true })
    expect(((await host.get(`/api/leagues/${id}`)).body as { playoffs: unknown }).playoffs).toEqual({ spots: 2, rounds: 1, regularWeeks: 4 })
    expect((await LeagueModel.findById(id).lean())!.schedule).toHaveLength(4)
  })

  it('plays without playoffs when only 4 weeks are left', async () => {
    await seedCrossover({ nextWeek: 14 })
    const id = await draftedCrossover({ playoffs: true })
    expect(((await host.get(`/api/leagues/${id}`)).body as { playoffs: unknown }).playoffs).toBeNull()
    expect((await LeagueModel.findById(id).lean())!.schedule).toHaveLength(4)
  })
})
