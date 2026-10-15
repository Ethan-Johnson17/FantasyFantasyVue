import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { PIN_ATTEMPTS_PER_MINUTE } from '../src/modules/leagues/league.routes.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { buildTestApp, signToken } from './helpers.js'

const app = buildTestApp()

/** Requests authenticated as the given Auth0 subject. */
function as(sub: string) {
  const withAuth = async (req: request.Test) => req.set('Authorization', await signToken(sub))
  return {
    get: (url: string) => withAuth(request(app).get(url)),
    post: (url: string, body: object = {}) => withAuth(request(app).post(url).send(body)),
    patch: (url: string, body: object) => withAuth(request(app).patch(url).send(body)),
    delete: (url: string) => withAuth(request(app).delete(url))
  }
}

const host = as('auth0|host')
const alice = as('auth0|alice')
const bob = as('auth0|bob')
const outsider = as('auth0|outsider')

const crest = (emblem = 'crown', banner = 'crimson') => ({ emblem, banner })
const party = (name: string, partyCrest: object = crest()) => ({ name, crest: partyCrest })

async function createLeague(overrides: object = {}) {
  const res = await host.post('/api/leagues', {
    name: 'Knights of the Gridiron',
    visibility: 'private',
    cadence: 'weekly',
    maxParties: 4,
    party: party('The Host Party'),
    ...overrides
  })
  expect(res.status).toBe(201)
  return res.body as { id: string; pin: string }
}

describe('creating a league', () => {
  it("creates the league with the host's party", async () => {
    const res = await host.post('/api/leagues', {
      name: '  Knights of the Gridiron ',
      visibility: 'private',
      cadence: 'daily',
      maxParties: 6,
      party: party('Dragon Slayers', crest('tower', 'sapphire'))
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      name: 'Knights of the Gridiron',
      status: 'forming',
      visibility: 'private',
      cadence: 'daily',
      maxParties: 6,
      partyCount: 1,
      rulesetVersion: 1,
      isHost: true,
      host: { displayName: 'Adventurer' }
    })
    expect(res.body.pin).toMatch(/^[2-9A-HJKMNP-Z]{6}$/)
    expect(res.body.parties[0].crest).toEqual({ emblem: 'tower', banner: 'sapphire' })
    expect(res.body.parties).toEqual([
      expect.objectContaining({ name: 'Dragon Slayers', crest: { emblem: 'tower', banner: 'sapphire' }, isMine: true })
    ])
  })

  it.each([
    ['too few parties', { maxParties: 1 }],
    ['too many parties', { maxParties: 7 }],
    ['an unknown cadence', { cadence: 'hourly' }],
    ['an unknown crest emblem', { party: party('X', crest('unicorn')) }],
    ['an unknown banner color', { party: party('X', crest('crown', '#ff0000')) }],
    ['a missing crest', { party: { name: 'X' } }],
    ['a blank name', { name: '  ' }],
    ['a client-chosen host', { hostId: '64b000000000000000000000' }],
    ['a client-chosen PIN', { pin: 'AAAAAA' }],
    ['a client-chosen status', { status: 'active' }]
  ])('rejects %s', async (_label, overrides) => {
    const res = await host.post('/api/leagues', {
      name: 'L',
      visibility: 'private',
      cadence: 'weekly',
      maxParties: 4,
      party: party('P'),
      ...overrides
    })
    expect(res.status).toBe(400)
    expect(await LeagueModel.countDocuments()).toBe(0)
  })
})

describe('joining by PIN', () => {
  it('adds a party and shows the member the league', async () => {
    const league = await createLeague()
    const res = await alice.post('/api/leagues/join', { pin: ` ${league.pin.toLowerCase()} `, party: party('Elf Squad') })
    expect(res.status).toBe(201)
    expect(res.body.partyCount).toBe(2)
    expect(res.body.isHost).toBe(false)
    expect(res.body.pin).toBe(league.pin)
    expect(res.body.parties.map((p: { name: string }) => p.name)).toEqual(['The Host Party', 'Elf Squad'])
  })

  it('rejects unknown PINs', async () => {
    const res = await alice.post('/api/leagues/join', { pin: 'ZZZZZZ', party: party('Elf Squad') })
    expect(res.status).toBe(404)
    expect(res.body.error.message).toBe('No league found with that PIN')
  })

  it('allows one party per user per league, including the host', async () => {
    const league = await createLeague()
    await alice.post('/api/leagues/join', { pin: league.pin, party: party('Elf Squad') })
    const again = await alice.post('/api/leagues/join', { pin: league.pin, party: party('Second Squad') })
    expect(again.status).toBe(409)
    expect(again.body.error.message).toBe('You already have a party in this league')
    const hostAgain = await host.post('/api/leagues/join', { pin: league.pin, party: party('Another') })
    expect(hostAgain.status).toBe(409)
  })

  it('rejects duplicate party names (ignoring case) and rolls back the claimed slot', async () => {
    const league = await createLeague()
    const res = await alice.post('/api/leagues/join', { pin: league.pin, party: party('the host PARTY') })
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('That party name is taken in this league')
    expect((await LeagueModel.findById(league.id))?.partyCount).toBe(1)
  })

  it('rejects joins when the league is full', async () => {
    const league = await createLeague({ maxParties: 2 })
    await alice.post('/api/leagues/join', { pin: league.pin, party: party('Elf Squad') })
    const res = await bob.post('/api/leagues/join', { pin: league.pin, party: party('Dwarf Squad') })
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('This league is full')
  })

  it('never overfills a league when users join at the same moment', async () => {
    const league = await createLeague({ maxParties: 3 })
    const joiners = Array.from({ length: 6 }, (_, i) => as(`auth0|racer${String(i)}`))
    const results = await Promise.all(
      joiners.map((user, i) => user.post('/api/leagues/join', { pin: league.pin, party: party(`Racers ${String(i)}`) }))
    )
    expect(results.filter(res => res.status === 201)).toHaveLength(2)
    expect(results.filter(res => res.status === 409)).toHaveLength(4)
    expect((await LeagueModel.findById(league.id))?.partyCount).toBe(3)
    expect(await PartyModel.countDocuments({ leagueId: league.id })).toBe(3)
  })

  it('rejects joins once the league is canceled', async () => {
    const league = await createLeague()
    await host.post(`/api/leagues/${league.id}/cancel`)
    const res = await alice.post('/api/leagues/join', { pin: league.pin, party: party('Elf Squad') })
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('This league is no longer accepting parties')
  })

  it('previews a league by PIN without listing its parties', async () => {
    const league = await createLeague()
    const res = await alice.get(`/api/leagues/pin/${league.pin}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Knights of the Gridiron', partyCount: 1, maxParties: 4 })
    expect(res.body).not.toHaveProperty('parties')
  })

  it('rate-limits PIN attempts per account', async () => {
    for (let i = 0; i < PIN_ATTEMPTS_PER_MINUTE; i++) {
      expect((await outsider.get('/api/leagues/pin/ZZZZZZ')).status).toBe(404)
    }
    const blocked = await outsider.get('/api/leagues/pin/ZZZZZZ')
    expect(blocked.status).toBe(429)
    // Other accounts are unaffected.
    expect((await alice.get('/api/leagues/pin/ZZZZZZ')).status).toBe(404)
  })
})

describe('viewing leagues', () => {
  it('hides private leagues from non-members', async () => {
    const league = await createLeague()
    expect((await outsider.get(`/api/leagues/${league.id}`)).status).toBe(404)
  })

  it('shows public leagues, including the PIN, to anyone signed in', async () => {
    const league = await createLeague({ visibility: 'public' })
    const res = await outsider.get(`/api/leagues/${league.id}`)
    expect(res.status).toBe(200)
    expect(res.body.pin).toBe(league.pin)
  })

  it('treats malformed and unknown ids as not found', async () => {
    expect((await host.get('/api/leagues/not-an-id')).status).toBe(404)
    expect((await host.get('/api/leagues/64b000000000000000000000')).status).toBe(404)
  })

  it('lists public leagues that still have room', async () => {
    await createLeague({ name: 'Private one' })
    const full = await createLeague({ name: 'Full public', visibility: 'public', maxParties: 2 })
    await alice.post('/api/leagues/join', { pin: full.pin, party: party('Elf Squad') })
    await createLeague({ name: 'Open public', visibility: 'public' })

    const res = await outsider.get('/api/leagues/public')
    expect(res.status).toBe(200)
    expect(res.body.map((l: { name: string }) => l.name)).toEqual(['Open public'])
    expect((await outsider.get('/api/leagues/public?page=0')).status).toBe(400)
  })

  it("lists the leagues I'm in, with my party", async () => {
    const hosted = await createLeague({ name: 'Hosted by host' })
    await alice.post('/api/leagues/join', { pin: hosted.pin, party: party('Elf Squad') })
    await createLeague({ name: 'Alice is not in this one' })

    const res = await alice.get('/api/leagues/mine')
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ name: 'Hosted by host', isHost: false, myParty: { name: 'Elf Squad' } })
  })
})

describe('host controls', () => {
  it('lets the host edit settings while forming', async () => {
    const league = await createLeague()
    const res = await host.patch(`/api/leagues/${league.id}`, { name: 'Renamed', cadence: 'daily' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Renamed', cadence: 'daily' })
  })

  it('will not shrink max parties below the current party count', async () => {
    const league = await createLeague({ maxParties: 4 })
    await alice.post('/api/leagues/join', { pin: league.pin, party: party('Elf Squad') })
    await bob.post('/api/leagues/join', { pin: league.pin, party: party('Dwarf Squad') })
    expect((await host.patch(`/api/leagues/${league.id}`, { maxParties: 2 })).status).toBe(409)
    expect((await host.patch(`/api/leagues/${league.id}`, { maxParties: 3 })).status).toBe(200)
  })

  it('rejects edits from members (403), outsiders (404), and empty or protected fields (400)', async () => {
    const league = await createLeague()
    await alice.post('/api/leagues/join', { pin: league.pin, party: party('Elf Squad') })
    expect((await alice.patch(`/api/leagues/${league.id}`, { name: 'Mine now' })).status).toBe(403)
    expect((await outsider.patch(`/api/leagues/${league.id}`, { name: 'Mine now' })).status).toBe(404)
    expect((await host.patch(`/api/leagues/${league.id}`, {})).status).toBe(400)
    expect((await host.patch(`/api/leagues/${league.id}`, { status: 'complete' })).status).toBe(400)
  })

  it('lets only the host cancel, once', async () => {
    const league = await createLeague()
    await alice.post('/api/leagues/join', { pin: league.pin, party: party('Elf Squad') })
    expect((await alice.post(`/api/leagues/${league.id}/cancel`)).status).toBe(403)
    const res = await host.post(`/api/leagues/${league.id}/cancel`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('canceled')
    expect((await host.post(`/api/leagues/${league.id}/cancel`)).status).toBe(409)
    expect((await host.patch(`/api/leagues/${league.id}`, { name: 'Too late' })).status).toBe(409)
  })

  it('lets the host remove members but not their own party', async () => {
    const league = await createLeague()
    const joined = await alice.post('/api/leagues/join', { pin: league.pin, party: party('Elf Squad') })
    const parties = joined.body.parties as { id: string; isMine: boolean }[]
    const alicesParty = parties.find(p => p.isMine)
    const hostsParty = parties.find(p => !p.isMine)

    expect((await alice.delete(`/api/leagues/${league.id}/parties/${String(hostsParty?.id)}`)).status).toBe(403)
    expect((await host.delete(`/api/leagues/${league.id}/parties/${String(hostsParty?.id)}`)).status).toBe(409)
    const res = await host.delete(`/api/leagues/${league.id}/parties/${String(alicesParty?.id)}`)
    expect(res.status).toBe(200)
    expect(res.body.partyCount).toBe(1)
    expect((await alice.get(`/api/leagues/${league.id}`)).status).toBe(404)
  })
})

describe('leaving a league', () => {
  it('removes the member and frees their slot', async () => {
    const league = await createLeague()
    await alice.post('/api/leagues/join', { pin: league.pin, party: party('Elf Squad') })
    expect((await alice.post(`/api/leagues/${league.id}/leave`)).status).toBe(204)
    expect((await LeagueModel.findById(league.id))?.partyCount).toBe(1)
    expect(await PartyModel.countDocuments({ leagueId: league.id })).toBe(1)
  })

  it('does not let the host leave, or non-members leave', async () => {
    const league = await createLeague()
    expect((await host.post(`/api/leagues/${league.id}/leave`)).status).toBe(409)
    expect((await outsider.post(`/api/leagues/${league.id}/leave`)).status).toBe(404)
  })

  it('only allows leaving while the league is forming', async () => {
    const league = await createLeague()
    await alice.post('/api/leagues/join', { pin: league.pin, party: party('Elf Squad') })
    await host.post(`/api/leagues/${league.id}/cancel`)
    expect((await alice.post(`/api/leagues/${league.id}/leave`)).status).toBe(409)
    expect(await PartyModel.countDocuments({ leagueId: league.id })).toBe(2)
  })
})

describe('editing a party', () => {
  it('lets the owner rename it and change its crest', async () => {
    const league = await createLeague()
    const joined = await alice.post('/api/leagues/join', { pin: league.pin, party: party('Elf Squad') })
    const mine = (joined.body.parties as { id: string; isMine: boolean }[]).find(p => p.isMine)
    const res = await alice.patch(`/api/parties/${String(mine?.id)}`, { name: 'Elf Legion', crest: crest('moon', 'emerald') })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Elf Legion', crest: { emblem: 'moon', banner: 'emerald' }, isMine: true })
    expect((await alice.patch(`/api/parties/${String(mine?.id)}`, { crest: crest('moon', 'neon') })).status).toBe(400)
  })

  it("hides other users' parties and rejects taken names", async () => {
    const league = await createLeague()
    const joined = await alice.post('/api/leagues/join', { pin: league.pin, party: party('Elf Squad') })
    const mine = (joined.body.parties as { id: string; isMine: boolean }[]).find(p => p.isMine)
    expect((await bob.patch(`/api/parties/${String(mine?.id)}`, { name: 'Stolen' })).status).toBe(404)
    const taken = await alice.patch(`/api/parties/${String(mine?.id)}`, { name: 'THE HOST PARTY' })
    expect(taken.status).toBe(409)
  })
})
