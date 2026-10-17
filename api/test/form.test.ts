import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { RULESET_V1 } from '../src/modules/scoring/rulesets.js'
import { PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'
import { as, draftedLeague, makeWeeksDue } from './leagueHelpers.js'
import { SEEDED_SEASON, seedStats } from './statsSeed.js'

const alice = as('auth0|alice')

interface ListedHero {
  id: string
  partyId: string | null
  heroClass: 'Mage' | 'Warrior' | 'Ranger' | 'Rogue' | 'Paladin'
  form: { average: number | null; recent: number | null; played: number }
}

const heroesOf = async (id: string) => (await alice.get(`/api/leagues/${id}/heroes`)).body as ListedHero[]

/** A player hero (drafted or free) whose weekly points we control. */
async function playerHero(id: string, drafted: boolean) {
  const heroes = await HeroModel.find({ leagueId: id }).select('+source').lean()
  return heroes.find(hero => hero.source.kind === 'player' && (hero.partyId !== null) === drafted)!
}

/** Sets a player's rushing yards per week (10 yards = 1 point); null means they didn't play. */
async function setWeeks(playerId: string, yardsByWeek: Record<number, number | null>) {
  for (const [week, yards] of Object.entries(yardsByWeek)) {
    const filter = { playerId, season: SEEDED_SEASON, week: Number(week) }
    if (yards === null) await PlayerWeekStatModel.deleteMany(filter)
    else await PlayerWeekStatModel.updateOne(filter, { $set: { 'stats.rushingYards': yards } })
  }
}

beforeEach(async () => {
  await seedStats()
})

describe('hero form', () => {
  it('is empty before any battle', async () => {
    const id = await draftedLeague([alice])
    for (const hero of await heroesOf(id)) expect(hero.form).toEqual({ average: null, recent: null, played: 0 })
  })

  it('averages class damage over played weeks: the whole season and the latest three', async () => {
    const id = await draftedLeague([alice])
    const hero = await playerHero(id, true)
    // 10, 20, (rests), 30, 40 points over weeks 1-5
    await setWeeks(hero.source.id, { 1: 100, 2: 200, 3: null, 4: 300, 5: 400 })
    await makeWeeksDue(id, 5)
    await alice.get(`/api/leagues/${id}`)

    const listed = (await heroesOf(id)).find(entry => entry.id === hero._id.toString())!
    const m = RULESET_V1.lineup.classMultipliers[listed.heroClass]
    expect(listed.form).toEqual({
      average: Math.round(((10 + 20 + 30 + 40) / 4) * m),
      recent: Math.round(((20 + 30 + 40) / 3) * m),
      played: 4
    })
    // Only resolved weeks count: week 6 hasn't been played.
    await setWeeks(hero.source.id, { 6: 900 })
    expect((await heroesOf(id)).find(entry => entry.id === hero._id.toString())!.form.played).toBe(4)
  })

  it('covers free agents the same way, without revealing anything hidden', async () => {
    const id = await draftedLeague([alice])
    const free = await playerHero(id, false)
    await setWeeks(free.source.id, { 1: 250 })
    await makeWeeksDue(id, 1)
    await alice.get(`/api/leagues/${id}`)

    const heroes = await heroesOf(id)
    const listed = heroes.find(entry => entry.id === free._id.toString())!
    expect(listed.partyId).toBeNull()
    expect(listed.form).toEqual({ average: Math.round(25 * RULESET_V1.lineup.classMultipliers[listed.heroClass]), recent: Math.round(25 * RULESET_V1.lineup.classMultipliers[listed.heroClass]), played: 1 })
    expect(heroes.every(hero => Number.isInteger(hero.form.average ?? 0))).toBe(true)
    // Same guard as the draft's hidden-player test: no "season" or "source" key, and no season year.
    expect(JSON.stringify(heroes)).not.toMatch(new RegExp(`"season"|"source"|${String(SEEDED_SEASON)}`))
  })
})
