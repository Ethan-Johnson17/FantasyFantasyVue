import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { LeagueModel, MAX_PARTIES } from '../src/modules/leagues/league.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { RULESET_V1 } from '../src/modules/scoring/rulesets.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { as, host, makeWeeksDue } from './leagueHelpers.js'
import { seedStats } from './statsSeed.js'

/** A daily league of `size` parties (host plus members), with the draft run. */
async function bigLeague(size: number) {
  const created = await host.post('/api/leagues', {
    name: 'Big League',
    visibility: 'private',
    cadence: 'daily',
    maxParties: size,
    party: { name: 'Host Party', crest: { emblem: 'crown', banner: 'crimson' } }
  })
  expect(created.status).toBe(201)
  const { id, pin } = created.body as { id: string; pin: string }
  for (let i = 1; i < size; i++) {
    const res = await as(`auth0|member${String(i)}`).post('/api/leagues/join', {
      pin,
      party: { name: `Party ${String(i)}`, crest: { emblem: 'oak', banner: 'emerald' } }
    })
    expect(res.status).toBe(201)
  }
  expect((await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })).status).toBe(200)
  await LeagueModel.updateOne({ _id: id }, { $set: { draftAt: new Date(Date.now() - 1000) } })
  await host.get(`/api/leagues/${id}`) // runs the draft
  return id
}

beforeEach(async () => {
  // Deep enough for a 12-party pool (it needs at least 15 heroes per party).
  await seedStats({ depth: 40 })
})

describe('12-party leagues', () => {
  it('allows up to 12 parties', () => {
    expect(MAX_PARTIES).toBe(12)
  })

  it('drafts a full league: every party gets a full roster from a capped pool', async () => {
    const id = await bigLeague(12)
    const league = (await LeagueModel.findById(id).lean())!
    expect(league.status).toBe('active')

    const heroes = await HeroModel.find({ leagueId: id }).lean()
    expect(heroes.length).toBeGreaterThanOrEqual(RULESET_V1.pool.minPerParty * 12)
    // Paladins are capped at the 16 seeded defenses (12 parties would want 36).
    expect(heroes.filter(hero => hero.heroClass === 'Paladin')).toHaveLength(16)
    for (const party of await PartyModel.find({ leagueId: id }).lean()) {
      expect(heroes.filter(hero => hero.partyId?.equals(party._id))).toHaveLength(RULESET_V1.lineup.rosterSize)
      expect(party.lineup).toHaveLength(RULESET_V1.lineup.slots.length)
    }
    expect(new Set(heroes.map(hero => hero.name)).size).toBe(heroes.length)

    // 14 weeks of six head-to-head battles, no monster.
    expect(league.schedule).toHaveLength(14)
    for (const week of league.schedule!) {
      expect(week.matchups).toHaveLength(6)
      expect(week.matchups.every(m => m.away)).toBe(true)
    }

    await makeWeeksDue(id, 1)
    await host.get(`/api/leagues/${id}`)
    expect((await WeekResultModel.findOne({ leagueId: id, week: 1 }).lean())?.matchups).toHaveLength(6)
  })

  it('gives an 11-party league a monster battle each week', async () => {
    const id = await bigLeague(11)
    const league = (await LeagueModel.findById(id).lean())!
    for (const week of league.schedule!) {
      expect(week.matchups).toHaveLength(6)
      expect(week.matchups.filter(m => !m.away)).toHaveLength(1)
    }
  })
})
