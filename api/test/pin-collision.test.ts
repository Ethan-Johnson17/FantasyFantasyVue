import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { buildTestApp, signToken } from './helpers.js'

// Force a PIN collision: the first two generated PINs are identical.
const pins = vi.hoisted(() => ['AAAAAA', 'AAAAAA', 'BBBBBB'])
vi.mock('../src/modules/leagues/pin.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/modules/leagues/pin.js')>()),
  generatePin: () => pins.shift() ?? 'CCCCCC'
}))

describe('league PIN collisions', () => {
  it('retries with a new PIN instead of failing', async () => {
    const app = buildTestApp()
    const create = async () =>
      request(app)
        .post('/api/leagues')
        .set('Authorization', await signToken('auth0|host'))
        .send({ name: 'L', visibility: 'private', cadence: 'weekly', maxParties: 4, party: { name: 'P', color: '#000000' } })

    expect((await create()).body.pin).toBe('AAAAAA')
    const second = await create()
    expect(second.status).toBe(201)
    expect(second.body.pin).toBe('BBBBBB')
    expect(await LeagueModel.countDocuments()).toBe(2)
  })
})
