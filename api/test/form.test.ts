import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { RULESET_V1 } from '../src/modules/scoring/rulesets.js'
import { levelForDamage, PLAYING_LIKE_MIN_BATTLES } from '../src/modules/season/form.service.js'
import { PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'
import { as, draftedLeague, makeWeeksDue } from './leagueHelpers.js'
import { SEEDED_SEASON, seedStats } from './statsSeed.js'

const alice = as('auth0|alice')

interface ListedHero {
  id: string
  partyId: string | null
  heroClass: 'Mage' | 'Warrior' | 'Ranger' | 'Rogue' | 'Paladin'
  form: { average: number | null; recent: number | null; played: number; playingLike: number | null }
}

const heroesOf = async (id: string) => (await alice.get(`/api/leagues/${id}/heroes`)).body as ListedHero[]

/** A player hero (drafted or free) whose weekly points we control. */
async function playerHero(id: string, drafted: boolean) {
  const heroes = await HeroModel.find({ leagueId: id }).select('+source').lean()
  return heroes.find(hero => hero.source.kind === 'player' && hero.level !== null && (hero.partyId !== null) === drafted)!
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
    for (const hero of await heroesOf(id)) expect(hero.form).toEqual({ average: null, recent: null, played: 0, playingLike: null })
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
      played: 4,
      playingLike: null // veterans have a Level
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
    expect(listed.form).toEqual({ average: Math.round(25 * RULESET_V1.lineup.classMultipliers[listed.heroClass]), recent: Math.round(25 * RULESET_V1.lineup.classMultipliers[listed.heroClass]), played: 1, playingLike: null })
    expect(heroes.every(hero => Number.isInteger(hero.form.average ?? 0))).toBe(true)
    // Same guard as the draft's hidden-player test: no "season" or "source" key, and no season year.
    expect(JSON.stringify(heroes)).not.toMatch(new RegExp(`"season"|"source"|${String(SEEDED_SEASON)}`))
  })
})

describe('rookies: playing like', () => {
  it('maps damage to the highest Level it matches', () => {
    const table = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]
    expect(levelForDamage(5, table)).toBe(1)
    expect(levelForDamage(14, table)).toBe(3)
    expect(levelForDamage(23.9, table)).toBe(7)
    expect(levelForDamage(40, table)).toBe(10)
  })

  it('shows for a mystery recruit once they have fought enough battles', async () => {
    const id = await draftedLeague([alice])
    const rookie = (await HeroModel.find({ leagueId: id, level: null }).select('+source').lean()).find(hero => hero.source.kind === 'player')!
    // 30 points a battle: well above every class's Level 10 line once multiplied.
    const weeks = Object.fromEntries(Array.from({ length: PLAYING_LIKE_MIN_BATTLES }, (_, i) => [i + 1, 300]))
    await setWeeks(rookie.source.id, weeks)

    await makeWeeksDue(id, PLAYING_LIKE_MIN_BATTLES - 1)
    await alice.get(`/api/leagues/${id}`)
    const early = (await heroesOf(id)).find(hero => hero.id === rookie._id.toString())!
    expect(early.form.playingLike).toBeNull()

    await makeWeeksDue(id, PLAYING_LIKE_MIN_BATTLES)
    await alice.get(`/api/leagues/${id}`)
    const later = (await heroesOf(id)).find(hero => hero.id === rookie._id.toString())!
    expect(later.form.playingLike).toBe(levelForDamage(30 * RULESET_V1.lineup.classMultipliers[later.heroClass], RULESET_V1.levelDamage[later.heroClass]))
    expect(later.form.playingLike).toBe(10)

    const detail = (await alice.get(`/api/leagues/${id}/heroes/${rookie._id.toString()}`)).body as { hero: { form: { playingLike: number | null } } }
    expect(detail.hero.form.playingLike).toBe(10)
  })
})
