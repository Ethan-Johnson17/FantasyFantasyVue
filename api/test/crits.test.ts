import mongoose from 'mongoose'
import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { RULESET_V1 } from '../src/modules/scoring/rulesets.js'
import { critOf } from '../src/modules/season/crits.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'
import { as, draftedLeague, host, makeWeeksDue } from './leagueHelpers.js'
import { SEEDED_SEASON, seedStats } from './statsSeed.js'

const alice = as('auth0|alice')
const bob = as('auth0|bob')

describe('critOf', () => {
  const fought = (points: number) => ({ slot: 'slot1', points, resting: false, swappedInto: null })

  it('is a natural 20 at or above the class threshold, a natural 1 at or below', () => {
    // Mage: multiplier 1, success at 31, fail at 3.
    expect(critOf(fought(31), 'Mage', RULESET_V1)).toBe('success')
    expect(critOf(fought(30.9), 'Mage', RULESET_V1)).toBeNull()
    expect(critOf(fought(3), 'Mage', RULESET_V1)).toBe('fail')
    expect(critOf(fought(3.1), 'Mage', RULESET_V1)).toBeNull()
    // Judged on class damage: a Paladin's 20 points is 47 damage.
    expect(critOf(fought(20), 'Paladin', RULESET_V1)).toBe('success')
    expect(critOf(fought(-1), 'Paladin', RULESET_V1)).toBe('fail')
    expect(critOf(fought(-0.5), 'Paladin', RULESET_V1)).toBeNull()
  })

  it('only counts heroes who fought', () => {
    expect(critOf({ slot: 'slot1', points: 0, resting: true }, 'Mage', RULESET_V1)).toBeNull()
    expect(critOf({ slot: 'Bench', points: 99, resting: false, swappedInto: null }, 'Mage', RULESET_V1)).toBeNull()
    expect(critOf({ slot: 'Bench', points: 99, resting: false, swappedInto: 'slot2' }, 'Mage', RULESET_V1)).toBe('success')
  })

  it('has a threshold for every class, success above fail', () => {
    for (const heroClass of ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin'] as const) {
      expect(RULESET_V1.crits.success[heroClass]).toBeGreaterThan(RULESET_V1.crits.fail[heroClass])
    }
  })
})

describe('crits in results', () => {
  beforeEach(async () => {
    await seedStats()
  })

  /** Sets a player hero's week-1 rushing yards, so its points that week are yards / 10. */
  async function setWeekOneYards(heroId: string, rushingYards: number) {
    const hero = (await HeroModel.findById(heroId).select('+source').lean())!
    await PlayerWeekStatModel.updateOne(
      { playerId: hero.source.id, season: SEEDED_SEASON, week: 1 },
      { $set: { 'stats.rushingYards': rushingYards } }
    )
  }

  it('marks natural 20s and natural 1s on battle results and hero pages', async () => {
    const id = await draftedLeague([alice])
    const lineup = ((await alice.get(`/api/leagues/${id}/lineup`)).body as { lineup: Record<string, string> }).lineup
    const starters = await HeroModel.find({ _id: mongoose.trusted({ $in: Object.values(lineup) }) }).select('+source').lean()
    const players = starters.filter(hero => hero.source.kind === 'player')
    const [hot, cold] = players
    await setWeekOneYards(hot!._id.toString(), 900) // 90 points: far above any threshold
    await setWeekOneYards(cold!._id.toString(), 0) // 0 points: at or below every player class's fail line

    await makeWeeksDue(id, 1)
    const result = (await alice.get(`/api/leagues/${id}/results/1`)).body as {
      matchups: { home: { heroes: { heroId: string; crit: string | null }[] }; away: { heroes: { heroId: string; crit: string | null }[] } | null }[]
    }
    const lines = result.matchups.flatMap(m => (m.away ? [m.home, m.away] : [m.home])).flatMap(side => side.heroes)
    expect(lines.find(line => line.heroId === hot!._id.toString())?.crit).toBe('success')
    expect(lines.find(line => line.heroId === cold!._id.toString())?.crit).toBe('fail')

    // Every crit shown matches the rule applied to the stored line.
    const stored = (await WeekResultModel.findOne({ leagueId: id, week: 1 }).lean())!
    const heroes = new Map((await HeroModel.find({ leagueId: id }).lean()).map(hero => [hero._id.toString(), hero.heroClass]))
    for (const line of stored.matchups.flatMap(m => (m.away ? [m.home, m.away] : [m.home])).flatMap(side => side.heroes)) {
      const shown = lines.find(entry => entry.heroId === line.heroId.toString())
      expect(shown?.crit).toBe(critOf(line, heroes.get(line.heroId.toString())!, RULESET_V1))
    }

    const detail = (await alice.get(`/api/leagues/${id}/heroes/${hot!._id.toString()}`)).body as { history: { week: number; crit: string | null }[] }
    expect(detail.history[0]).toMatchObject({ week: 1, crit: 'success' })
  })

  it('gives the Natural 20 and Cursed Dice awards to the parties with the most crits', async () => {
    const id = await draftedLeague([alice, bob])
    // Give one of alice's starters a huge season and one of bob's an empty one, so both awards have a winner.
    for (const [player, yards] of [[alice, 900], [bob, 0]] as const) {
      const lineup = ((await player.get(`/api/leagues/${id}/lineup`)).body as { lineup: Record<string, string> }).lineup
      const starters = await HeroModel.find({ _id: mongoose.trusted({ $in: Object.values(lineup) }) }).select('+source').lean()
      const hero = starters.find(h => h.source.kind === 'player')!
      await PlayerWeekStatModel.updateMany({ playerId: hero.source.id, season: SEEDED_SEASON }, { $set: { 'stats.rushingYards': yards } })
    }
    await makeWeeksDue(id, 14)
    await host.get(`/api/leagues/${id}`)

    const results = await WeekResultModel.find({ leagueId: id }).lean()
    const heroes = new Map((await HeroModel.find({ leagueId: id }).lean()).map(hero => [hero._id.toString(), hero.heroClass]))
    const counts = { success: new Map<string, number>(), fail: new Map<string, number>() }
    for (const side of results.flatMap(r => r.matchups.flatMap(m => (m.away ? [m.home, m.away] : [m.home])))) {
      for (const line of side.heroes) {
        const crit = critOf(line, heroes.get(line.heroId.toString())!, RULESET_V1)
        if (crit) counts[crit].set(side.partyId.toString(), (counts[crit].get(side.partyId.toString()) ?? 0) + 1)
      }
    }
    const finale = (await alice.get(`/api/leagues/${id}/finale`)).body as { awards: { kind: string; count?: number; party?: { partyId: string } }[] }
    for (const [kind, map] of [['natural20', counts.success], ['cursedDice', counts.fail]] as const) {
      const award = finale.awards.find(a => a.kind === kind)
      const best = Math.max(0, ...map.values())
      expect(best).toBeGreaterThan(0)
      expect(award?.count).toBe(best)
      expect(map.get(award!.party!.partyId)).toBe(best)
    }
  })
})
