import request from 'supertest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { CADENCE_MS, LeagueModel } from '../src/modules/leagues/league.model.js'
import { buildTestApp, signToken } from './helpers.js'

/* Shared setup for tests that need a drafted, running league. */

const app = buildTestApp()

/** Requests as one signed-in account. */
export function as(sub: string) {
  const withAuth = async (req: request.Test) => req.set('Authorization', await signToken(sub))
  return {
    sub,
    get: (url: string) => withAuth(request(app).get(url)),
    post: (url: string, body: object = {}) => withAuth(request(app).post(url).send(body)),
    put: (url: string, body: object) => withAuth(request(app).put(url).send(body)),
    patch: (url: string, body: object) => withAuth(request(app).patch(url).send(body)),
    delete: (url: string) => withAuth(request(app).delete(url))
  }
}

export type Player = ReturnType<typeof as>

export const host = as('auth0|host')
export const DAY = CADENCE_MS.daily

/** A daily league hosted by `host`, with `members` joined and the draft already run. */
export async function draftedLeague(members: readonly Player[]) {
  const created = await host.post('/api/leagues', {
    name: 'Season League',
    visibility: 'private',
    cadence: 'daily',
    maxParties: 6,
    party: { name: 'Host Party', crest: { emblem: 'crown', banner: 'crimson' } }
  })
  const { id, pin } = created.body as { id: string; pin: string }
  for (const [i, member] of members.entries()) {
    await member.post('/api/leagues/join', { pin, party: { name: `Member ${String(i)}`, crest: { emblem: 'crown', banner: 'crimson' } } })
  }
  await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })
  await LeagueModel.updateOne({ _id: id }, { $set: { draftAt: new Date(Date.now() - 1000) } })
  await host.get(`/api/leagues/${id}`) // runs the draft
  // The seeded stats are identical every week, so traits would fall to id order. Start without
  // traits so base scoring is exact; strategy tests set traits explicitly.
  await HeroModel.updateMany({ leagueId: id }, { $set: { traits: [] } })
  return id
}

/** Shifts week 1's resolve time so that `weeksDue` game weeks are due now. */
export async function makeWeeksDue(leagueId: string, weeksDue: number) {
  const weekOneAt = new Date(Date.now() - (weeksDue - 1) * DAY - 60_000)
  await LeagueModel.updateOne({ _id: leagueId }, { $set: { weekOneAt } })
}
