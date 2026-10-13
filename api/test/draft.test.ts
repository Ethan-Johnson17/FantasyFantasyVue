import mongoose from 'mongoose'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { CADENCE_MS, LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel, readLineup } from '../src/modules/leagues/party.model.js'
import { RULESET_V1 } from '../src/modules/scoring/rulesets.js'
import { buildTestApp, signToken } from './helpers.js'
import { EXCLUDED_IDS, SEEDED_SEASON, seedStats } from './statsSeed.js'

const app = buildTestApp()
const ROSTER_SIZE = RULESET_V1.lineup.rosterSize

function as(sub: string) {
  const withAuth = async (req: request.Test) => req.set('Authorization', await signToken(sub))
  return {
    get: (url: string) => withAuth(request(app).get(url)),
    post: (url: string, body: object = {}) => withAuth(request(app).post(url).send(body)),
    put: (url: string, body: object) => withAuth(request(app).put(url).send(body))
  }
}

const host = as('auth0|host')
const alice = as('auth0|alice')
const bob = as('auth0|bob')
const outsider = as('auth0|outsider')

interface HeroView {
  id: string
  name: string
  heroClass: string
  level: number | null
  levelRange: { min: number; max: number } | null
  partyId: string | null
}

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

/** A league with host + alice (+ bob), ready to schedule. */
async function leagueWithMembers(members = [alice], cadence = 'daily') {
  const created = await host.post('/api/leagues', {
    name: 'Draft League',
    visibility: 'private',
    cadence,
    maxParties: 4,
    party: { name: 'Host Party', color: '#111111' }
  })
  const { id, pin } = created.body as { id: string; pin: string }
  for (const [i, member] of members.entries()) {
    await member.post('/api/leagues/join', { pin, party: { name: `Member ${String(i)}`, color: '#222222' } })
  }
  return { id, pin }
}

/** Moves the draft time into the past, as if the scheduled time had arrived. */
async function makeDraftDue(leagueId: string) {
  const draftAt = new Date(Date.now() - 1000)
  await LeagueModel.updateOne({ _id: leagueId }, { $set: { draftAt } })
  return draftAt
}

beforeEach(async () => {
  await seedStats()
})

describe('scheduling the draft', () => {
  it('builds a hidden hero pool and locks membership', async () => {
    const league = await leagueWithMembers()
    const res = await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('drafting')
    expect(res.body.draftAt).toBeTruthy()

    const heroes = (await alice.get(`/api/leagues/${league.id}/heroes`)).body as HeroView[]
    expect(heroes).toHaveLength(23 * 2)

    // Membership is locked
    const late = await bob.post('/api/leagues/join', { pin: league.pin, party: { name: 'Late', color: '#333333' } })
    expect(late.status).toBe(409)
    expect((await alice.post(`/api/leagues/${league.id}/leave`)).status).toBe(409)
  })

  it('picks the hidden season server-side and never sends it, the seed, or player identities', async () => {
    const league = await leagueWithMembers()
    await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })

    const stored = await LeagueModel.findById(league.id).select('+season +seed').lean()
    expect(stored?.season).toBe(SEEDED_SEASON)
    expect(stored?.seed).toMatch(/^[0-9a-f]{32}$/)

    const responses = [
      await alice.get(`/api/leagues/${league.id}`),
      await alice.get(`/api/leagues/${league.id}/heroes`),
      await alice.get('/api/leagues/mine')
    ]
    for (const res of responses) {
      expect(res.status).toBe(200)
      expect(res.text).not.toMatch(/"season"|"seed"|"source"|Real |QB-\d|T\d+"/)
      expect(res.text).not.toContain(String(stored?.seed))
    }
  })

  it('builds the pool from the documented rules', async () => {
    const league = await leagueWithMembers()
    await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })
    const heroes = await HeroModel.find({ leagueId: league.id }).select('+source').lean()
    const sources = heroes.map(hero => hero.source.id)

    for (const excluded of Object.values(EXCLUDED_IDS)) expect(sources).not.toContain(excluded)

    const mages = heroes.filter(hero => hero.heroClass === 'Mage')
    expect(mages).toHaveLength(8)
    // 20% of 8 rounds down to 1 mystery recruit: the earliest draft pick
    const recruits = mages.filter(hero => hero.level === null)
    expect(recruits.map(hero => hero.source.id)).toEqual(['QB-rookie-0'])
    expect(recruits[0]?.levelRange).toEqual({ min: 1, max: 4 })
    // The rest are the best veterans by last season's points per game
    expect(
      mages
        .filter(hero => hero.level !== null)
        .map(hero => hero.source.id)
        .sort()
    ).toEqual(['QB-0', 'QB-1', 'QB-2', 'QB-3', 'QB-4', 'QB-5', 'QB-6'])
    expect(mages.find(hero => hero.source.id === 'QB-0')?.level).toBe(10)
  })

  it('only lets the host schedule, with 2+ parties, within the allowed window', async () => {
    const solo = await leagueWithMembers([])
    expect((await host.post(`/api/leagues/${solo.id}/draft`, { draftAt: inMinutes(60) })).status).toBe(409)

    const league = await leagueWithMembers()
    expect((await alice.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })).status).toBe(403)
    expect((await outsider.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })).status).toBe(404)
    expect((await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(5) })).status).toBe(400)
    expect((await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(15 * 24 * 60) })).status).toBe(400)
    expect((await host.post(`/api/leagues/${league.id}/draft`, { draftAt: 'tomorrow' })).status).toBe(400)
    expect(await HeroModel.countDocuments()).toBe(0)
  })

  it('lets the host reschedule until the draft runs', async () => {
    const league = await leagueWithMembers()
    await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })
    const later = inMinutes(120)
    const res = await host.post(`/api/leagues/${league.id}/draft`, { draftAt: later })
    expect(res.status).toBe(200)
    expect(new Date(res.body.draftAt as string).toISOString()).toBe(later)
    expect(await HeroModel.countDocuments({ leagueId: league.id })).toBe(46) // pool not rebuilt

    await makeDraftDue(league.id)
    expect((await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })).status).toBe(409)
  })
})

describe('rankings', () => {
  it('saves and returns a member ranking', async () => {
    const league = await leagueWithMembers()
    await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })
    const heroes = (await alice.get(`/api/leagues/${league.id}/heroes`)).body as HeroView[]
    const ranking = heroes.slice(0, 5).map(hero => hero.id)

    expect((await alice.put(`/api/leagues/${league.id}/rankings`, { heroIds: ranking })).status).toBe(200)
    expect((await alice.get(`/api/leagues/${league.id}/rankings`)).body).toEqual({ heroIds: ranking })
    // Rankings are private per party
    expect((await host.get(`/api/leagues/${league.id}/rankings`)).body).toEqual({ heroIds: [] })
  })

  it('rejects duplicates, foreign heroes, non-members, and changes outside the drafting window', async () => {
    const league = await leagueWithMembers()
    const other = await leagueWithMembers([bob])
    expect((await alice.put(`/api/leagues/${league.id}/rankings`, { heroIds: [] })).status).toBe(409) // not scheduled yet

    await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })
    await host.post(`/api/leagues/${other.id}/draft`, { draftAt: inMinutes(60) })
    const mine = (await alice.get(`/api/leagues/${league.id}/heroes`)).body as HeroView[]
    const theirs = (await bob.get(`/api/leagues/${other.id}/heroes`)).body as HeroView[]

    expect((await alice.put(`/api/leagues/${league.id}/rankings`, { heroIds: [mine[0]?.id, mine[0]?.id] })).status).toBe(400)
    expect((await alice.put(`/api/leagues/${league.id}/rankings`, { heroIds: [theirs[0]?.id] })).status).toBe(400)
    expect((await outsider.put(`/api/leagues/${league.id}/rankings`, { heroIds: [] })).status).toBe(404)

    await makeDraftDue(league.id)
    expect((await alice.put(`/api/leagues/${league.id}/rankings`, { heroIds: [mine[0]?.id] })).status).toBe(409)
  })
})

describe('running the draft', () => {
  it('runs when the league is next opened: full rosters, valid lineups, week 1 one cadence later', async () => {
    const league = await leagueWithMembers([alice, bob], 'weekly')
    await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })
    const draftAt = await makeDraftDue(league.id)

    const res = await alice.get(`/api/leagues/${league.id}`)
    expect(res.body.status).toBe('active')
    expect(new Date(res.body.weekOneAt as string).getTime()).toBe(draftAt.getTime() + CADENCE_MS.weekly)

    const parties = await PartyModel.find({ leagueId: league.id }).lean()
    const heroes = await HeroModel.find({ leagueId: league.id }).lean()
    for (const party of parties) {
      const roster = heroes.filter(hero => hero.partyId?.equals(party._id))
      expect(roster).toHaveLength(ROSTER_SIZE)
      const byId = new Map(roster.map(hero => [hero._id.toString(), hero]))
      const lineup = readLineup(party.lineup)!
      for (const slot of RULESET_V1.lineup.slots) {
        expect(slot.classes).toContain(byId.get(lineup[slot.key]!)?.heroClass)
      }
    }
    expect(heroes.filter(hero => hero.partyId)).toHaveLength(ROSTER_SIZE * 3)
  })

  it("honors a member's ranking", async () => {
    const league = await leagueWithMembers()
    await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })
    const heroes = (await alice.get(`/api/leagues/${league.id}/heroes`)).body as HeroView[]
    // The lowest-level Mage: nobody would take it early by default.
    const sleeper = heroes.filter(hero => hero.heroClass === 'Mage' && hero.level !== null).at(-1)
    await alice.put(`/api/leagues/${league.id}/rankings`, { heroIds: [sleeper?.id] })

    await makeDraftDue(league.id)
    const after = (await alice.get(`/api/leagues/${league.id}/heroes`)).body as HeroView[]
    const alicesParty = (await alice.get(`/api/leagues/${league.id}`)).body.parties.find((p: { isMine: boolean }) => p.isMine)
    expect(after.find(hero => hero.id === sleeper?.id)?.partyId).toBe(alicesParty.id)
  })

  // The draft is fully determined by the league seed, so concurrent runs could only ever write the
  // same result; the atomic status claim additionally keeps it to one run. This checks the outcome.
  it('gives every concurrent request the same single, complete draft', async () => {
    const league = await leagueWithMembers([alice, bob])
    await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })
    await makeDraftDue(league.id)

    const results = await Promise.all([host, alice, bob, host, alice, bob].map(user => user.get(`/api/leagues/${league.id}`)))
    expect(results.every(res => res.status === 200 && res.body.status === 'active')).toBe(true)
    const stored = await LeagueModel.findById(league.id).lean()
    expect(stored?.draftPicks).toHaveLength(ROSTER_SIZE * 3)
    expect(await HeroModel.countDocuments({ leagueId: league.id, partyId: mongoose.trusted({ $ne: null }) })).toBe(ROSTER_SIZE * 3)
  })

  it('still allows the host to cancel during the drafting phase', async () => {
    const league = await leagueWithMembers()
    await host.post(`/api/leagues/${league.id}/draft`, { draftAt: inMinutes(60) })
    expect((await host.post(`/api/leagues/${league.id}/cancel`)).body.status).toBe('canceled')
  })
})
