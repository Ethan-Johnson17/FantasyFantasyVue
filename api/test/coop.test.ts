import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { COOP_V1 } from '../src/modules/scoring/rulesets.js'
import { BOSS_NAME } from '../src/modules/season/campaign.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { buildTestApp, signToken } from './helpers.js'
import { as, draftedLeague, host, makeWeeksDue } from './leagueHelpers.js'
import { seedStats } from './statsSeed.js'

const alice = as('auth0|alice')
const bob = as('auth0|bob')
const outsider = as('auth0|outsider')

interface Chapter {
  chapter: number
  name: string
  weak: string[]
  resists: string
  boss: boolean
  hp: number
  deadline: number
  status: string
  hpLeft: number
  endedWeek: number | null
}
interface Campaign {
  lives: number
  livesLeft: number
  outcome: string
  chapter: number
  chapters: Chapter[]
  lastWeek: number | null
  nextWeek: { week: number } | null
  contributions: { partyId: string; name: string; lastWeek: number; chapter: number; total: number }[]
  myParty: { partyId: string; hasChampion: boolean } | null
}

const newParty = (name: string) => ({ name, crest: { emblem: 'crown', banner: 'crimson' } })
const coopLeague = () => draftedLeague([alice, bob], { mode: 'coop' })
const campaignOf = async (id: string) => (await alice.get(`/api/leagues/${id}/campaign`)).body as Campaign
/** Sets every chapter monster's HP (the draft sets them from the seed). */
const setHp = (id: string, hp: readonly number[]) =>
  LeagueModel.updateOne({ _id: id }, { $set: Object.fromEntries(hp.map((value, index) => [`campaign.monsters.${String(index)}.hp`, value])) })
/** Plays `weeks` game weeks and opens the league so they resolve. */
async function play(id: string, weeks: number) {
  await makeWeeksDue(id, weeks)
  await host.get(`/api/leagues/${id}`)
}

beforeEach(async () => {
  await seedStats()
})

describe('creating a Co-op league', () => {
  const body = { name: 'Raid', visibility: 'private', cadence: 'daily', maxParties: 6, mode: 'coop', party: newParty('Host Party') }

  it('is refused until Co-op is switched on (COOP_ENABLED)', async () => {
    const off = buildTestApp({ coopEnabled: false })
    const res = await request(off).post('/api/leagues').set('Authorization', await signToken('auth0|host')).send(body)
    expect(res.status).toBe(409)
    expect(await LeagueModel.countDocuments({ mode: 'coop' })).toBe(0)
  })

  it('records the mode and the Co-op ruleset, and never has playoffs', async () => {
    const res = await host.post('/api/leagues', { ...body, playoffs: true })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ mode: 'coop', rulesetVersion: COOP_V1.version, playoffs: null })
    expect((await LeagueModel.findById(res.body.id as string))?.playoffs).toBe(false)
  })

  it('is not available as a dynasty yet', async () => {
    expect((await host.post('/api/leagues', { ...body, dynastySeasons: 3 })).status).toBe(400)
  })
})

describe('the campaign after the draft', () => {
  it('has five monsters with the spec deadlines, the boss last, and nothing played yet', async () => {
    const id = await coopLeague()
    const campaign = await campaignOf(id)
    expect(campaign).toMatchObject({ lives: 3, livesLeft: 3, outcome: 'ongoing', chapter: 1, lastWeek: null, nextWeek: { week: 1 } })
    expect(campaign.chapters.map(chapter => chapter.deadline)).toEqual([3, 6, 9, 12, 14])
    expect(campaign.chapters.map(chapter => chapter.status)).toEqual(['active', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
    expect(campaign.chapters[4]).toMatchObject({ boss: true, name: BOSS_NAME })
    for (const chapter of campaign.chapters) expect(chapter.hpLeft).toBe(chapter.hp)
    expect(campaign.contributions).toHaveLength(3)
    expect(campaign.myParty).toMatchObject({ hasChampion: false })
  })

  it('has no matchups, schedule or standings', async () => {
    const id = await coopLeague()
    expect((await alice.get(`/api/leagues/${id}/schedule`)).body).toEqual([])
    expect((await alice.get(`/api/leagues/${id}/matchup`)).status).toBe(409)
    expect((await alice.get(`/api/leagues/${id}/standings`)).status).toBe(409)
  })

  it('is only for Co-op leagues, and only for those who can see the league', async () => {
    const classic = await draftedLeague([alice])
    expect((await alice.get(`/api/leagues/${classic}/campaign`)).status).toBe(409)
    const id = await coopLeague()
    expect((await outsider.get(`/api/leagues/${id}/campaign`)).status).toBe(404)
  })
})

describe('a Co-op game week', () => {
  it('adds every party’s damage together and deals it to the chapter monster', async () => {
    const id = await coopLeague()
    const before = await campaignOf(id)
    await play(id, 1)

    const week = (await alice.get(`/api/leagues/${id}/results/1`)).body
    expect(week.matchups).toEqual([])
    expect(week.sides).toHaveLength(3)
    const totals = (week.sides as { total: number }[]).map(side => side.total)
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
    const dealt = totals.reduce((sum, total) => sum + total, 0)
    expect(week.campaign.dealt).toBeCloseTo(dealt, 2)
    expect(week.campaign).toMatchObject({ chapter: 1, monster: before.chapters[0]?.name, hpBefore: before.chapters[0]?.hp })

    const after = await campaignOf(id)
    expect(after.lastWeek).toBe(1)
    expect(after.chapters[0]?.hpLeft).toBeCloseTo((before.chapters[0]?.hp ?? 0) - dealt, 2)
    // Parties are listed by this chapter's damage, highest first.
    const chapterDamage = after.contributions.map(row => row.chapter)
    expect(chapterDamage).toEqual([...chapterDamage].sort((a, b) => b - a))
    expect(after.contributions.reduce((sum, row) => sum + row.lastWeek, 0)).toBeCloseTo(dealt, 2)
  })

  it('applies the monster’s weaknesses and resistance to each hero’s class damage', async () => {
    const id = await coopLeague()
    await play(id, 1)
    const league = (await LeagueModel.findById(id).lean())!
    const monster = league.campaign!.monsters[0]!
    const result = (await WeekResultModel.findOne({ leagueId: id, week: 1 }).lean())!
    const heroes = new Map((await HeroModel.find({ leagueId: id }).lean()).map(hero => [hero._id.toString(), hero]))
    const { classMultipliers } = COOP_V1.lineup
    let checked = 0
    for (const side of result.sides ?? []) {
      for (const line of side.heroes) {
        if (line.slot === 'Bench' || line.resting) continue
        const heroClass = heroes.get(line.heroId.toString())!.heroClass
        const modifier = monster.weak.includes(heroClass) ? 1.25 : monster.resists === heroClass ? 0.75 : 1
        // Stored to the hundredth, as the engine rounds each hero's damage
        expect(line.counted).toBe(Math.round(line.points * classMultipliers[heroClass] * modifier * 100) / 100)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('carries overkill into the next chapter when a monster falls early', async () => {
    const id = await coopLeague()
    const before = await campaignOf(id)
    await setHp(id, [1])
    await play(id, 1)
    const week = (await alice.get(`/api/leagues/${id}/results/1`)).body
    const campaign = await campaignOf(id)
    expect(campaign.chapter).toBe(2)
    expect(campaign.chapters[0]).toMatchObject({ status: 'fallen', hpLeft: 0, endedWeek: 1 })
    expect(campaign.chapters[1]).toMatchObject({ status: 'active', deadline: 6 })
    expect(campaign.chapters[1]?.hpLeft).toBeCloseTo((before.chapters[1]?.hp ?? 0) - (week.campaign.dealt - 1), 2)
  })

  it('loses a life at each missed deadline and ends the league when the last one goes', async () => {
    const id = await coopLeague()
    await setHp(id, [1e9, 1e9, 1e9, 1e9, 1e9])
    await play(id, 14)
    const league = (await LeagueModel.findById(id).lean())!
    expect(league).toMatchObject({ status: 'complete', resolvedWeeks: 9 })
    expect(league.endedAt).toBeInstanceOf(Date)
    const campaign = await campaignOf(id)
    expect(campaign).toMatchObject({ outcome: 'lost', livesLeft: 0, chapter: 3, nextWeek: null })
    expect(campaign.chapters.map(chapter => [chapter.status, chapter.endedWeek])).toEqual([
      ['failed', 3],
      ['failed', 6],
      ['failed', 9],
      ['upcoming', null],
      ['upcoming', null]
    ])
    expect(campaign.chapters[0]?.hpLeft).toBeLessThan(1e9)
    expect(await WeekResultModel.countDocuments({ leagueId: id })).toBe(9)

    const finale = (await alice.get(`/api/leagues/${id}/finale`)).body
    expect(finale).toMatchObject({ mode: 'coop', outcome: 'lost', livesLeft: 0 })
    expect(finale.awards.filter((award: { kind: string }) => award.kind === 'finalBlow')).toEqual([])
  })

  it('wins the campaign when the boss falls, and ends the league at once', async () => {
    const id = await coopLeague()
    await setHp(id, [1, 1, 1, 1, 1])
    await play(id, 3)
    expect(await LeagueModel.findById(id).lean()).toMatchObject({ status: 'complete', resolvedWeeks: 1 })
    const campaign = await campaignOf(id)
    expect(campaign).toMatchObject({ outcome: 'won', livesLeft: 3 })
    expect(campaign.chapters.every(chapter => chapter.status === 'fallen' && chapter.endedWeek === 1)).toBe(true)

    const finale = (await alice.get(`/api/leagues/${id}/finale`)).body
    expect(finale).toMatchObject({ mode: 'coop', outcome: 'won', lives: 3, livesLeft: 3 })
    const totals = (finale.contributions as { partyId: string; total: number }[]).map(row => row.total)
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
    const slayer = finale.awards.find((award: { kind: string }) => award.kind === 'monsterSlayer')
    expect(slayer).toMatchObject({ party: { partyId: finale.contributions[0].partyId }, damage: totals[0] })
    const blows = finale.awards.filter((award: { kind: string }) => award.kind === 'finalBlow')
    expect(blows.map((blow: { chapter: number }) => blow.chapter)).toEqual([1, 2, 3, 4, 5])
    expect(blows[4]).toMatchObject({ monster: BOSS_NAME, week: 1, party: { partyId: finale.contributions[0].partyId } })
  })

  it('has no finale until the campaign is over', async () => {
    const id = await coopLeague()
    await play(id, 1)
    expect((await alice.get(`/api/leagues/${id}/finale`)).status).toBe(409)
  })
})

describe('Co-op on My leagues', () => {
  it('shows the campaign and the next monster instead of a standing, and reminds a party without a Champion', async () => {
    const id = await coopLeague()
    await play(id, 1)
    const mine = ((await alice.get('/api/leagues/mine')).body as { id: string; standing: unknown; outlook: Record<string, unknown> }[]).find(
      league => league.id === id
    )!
    const campaign = await campaignOf(id)
    expect(mine.standing).toBeNull()
    expect(mine.outlook.lastBattle).toBeNull()
    expect(mine.outlook.campaign).toMatchObject({ chapter: 1, monster: campaign.chapters[0]?.name, livesLeft: 3, outcome: 'ongoing' })
    expect((mine.outlook.campaign as { myLastWeek: number }).myLastWeek).toBeCloseTo(
      campaign.contributions.find(row => row.partyId === campaign.myParty?.partyId)?.lastWeek ?? -1,
      2
    )
    expect(mine.outlook.nextBattle).toMatchObject({ week: 2, opponent: null, monster: campaign.chapters[0]?.name, noChampion: true })
  })
})

describe('hidden players in Co-op', () => {
  it('never sends the season, exact points or player sources', async () => {
    const id = await coopLeague()
    await setHp(id, [1e9, 1e9, 1e9, 1e9, 1e9])
    await play(id, 9)
    const heroId = ((await alice.get(`/api/leagues/${id}/heroes`)).body as { id: string; partyId: string | null }[]).find(hero => hero.partyId)!.id
    const bodies = await Promise.all(
      [`/campaign`, `/results/1`, `/finale`, `/heroes/${heroId}`, ''].map(async path => JSON.stringify((await alice.get(`/api/leagues/${id}${path}`)).body))
    )
    for (const body of bodies) {
      expect(body).not.toContain('"season"')
      expect(body).not.toContain('"points"')
      expect(body).not.toContain('"source"')
      expect(body).not.toContain('seasonFactor')
    }
  })

  it('rounds each hero’s damage in results, and keeps the hero’s history', async () => {
    const id = await coopLeague()
    await play(id, 1)
    const week = (await alice.get(`/api/leagues/${id}/results/1`)).body
    const lines = (week.sides as { heroes: { heroId: string; slot: string; damage: number }[] }[]).flatMap(side => side.heroes)
    for (const line of lines) expect(Number.isInteger(line.damage)).toBe(true)
    // The week the hero fought for their party, not a free agent's "would have dealt"
    const line = lines.find(entry => entry.slot !== 'Bench')!
    const detail = (await alice.get(`/api/leagues/${id}/heroes/${line.heroId}`)).body
    expect(detail.history).toEqual([expect.objectContaining({ week: 1, slot: line.slot, damage: line.damage })])
  })
})

describe('Co-op rules', () => {
  it('are public, with whether Co-op leagues can be created', async () => {
    const rules = (await request(buildTestApp()).get('/api/rules')).body
    expect(rules.coop).toEqual({ available: true, version: COOP_V1.version, deadlines: [3, 6, 9, 12, 14], lives: 3, weakMultiplier: 1.25, resistMultiplier: 0.75, boss: BOSS_NAME })
    expect((await request(buildTestApp({ coopEnabled: false })).get('/api/rules')).body.coop.available).toBe(false)
  })
})
