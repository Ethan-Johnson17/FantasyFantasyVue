import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { AccountModel } from '../src/modules/accounts/account.model.js'
import { buildTestApp, signToken } from './helpers.js'

const app = buildTestApp()

describe('authentication', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/account')
    expect(res.status).toBe(401)
    expect(res.body.error.message).toBe('Unauthorized')
  })

  it('rejects tokens signed with the wrong key', async () => {
    const token = await signToken('auth0|mallory', { secret: 'some-other-secret-that-is-32-bytes-long' })
    const res = await request(app).get('/api/account').set('Authorization', token)
    expect(res.status).toBe(401)
  })

  it('rejects tokens for a different audience', async () => {
    const token = await signToken('auth0|alice', { audience: 'https://another-api.example' })
    const res = await request(app).get('/api/account').set('Authorization', token)
    expect(res.status).toBe(401)
  })

  it('rejects expired tokens', async () => {
    const token = await signToken('auth0|alice', { expiresIn: '-1m' })
    const res = await request(app).get('/api/account').set('Authorization', token)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/account', () => {
  it('creates an account on first login and reuses it afterwards', async () => {
    const token = await signToken('auth0|alice')
    const first = await request(app).get('/api/account').set('Authorization', token)
    const second = await request(app).get('/api/account').set('Authorization', token)

    expect(first.status).toBe(200)
    expect(first.body.displayName).toBe('Adventurer')
    expect(second.body.id).toBe(first.body.id)
    expect(await AccountModel.countDocuments()).toBe(1)
  })

  it('does not create duplicates under concurrent first requests', async () => {
    const token = await signToken('auth0|bob')
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(app).get('/api/account').set('Authorization', token))
    )
    expect(responses.every(res => res.status === 200)).toBe(true)
    expect(new Set(responses.map(res => res.body.id)).size).toBe(1)
    expect(await AccountModel.countDocuments()).toBe(1)
  })

  it('never exposes the auth subject or internal fields', async () => {
    const res = await request(app).get('/api/account').set('Authorization', await signToken('auth0|alice'))
    expect(res.body).not.toHaveProperty('authSub')
    expect(res.body).not.toHaveProperty('_id')
    expect(res.body).not.toHaveProperty('__v')
  })
})

describe('PATCH /api/account', () => {
  async function patch(sub: string, body: object) {
    return request(app).patch('/api/account').set('Authorization', await signToken(sub)).send(body)
  }

  it('updates allowed fields', async () => {
    const res = await patch('auth0|alice', { displayName: '  Alaric the Bold ', picture: 'https://img.example/a.png' })
    expect(res.status).toBe(200)
    expect(res.body.displayName).toBe('Alaric the Bold')
    expect(res.body.picture).toBe('https://img.example/a.png')
  })

  it("only changes the caller's own account", async () => {
    await patch('auth0|alice', { displayName: 'Alice' })
    await patch('auth0|bob', { displayName: 'Bob' })
    const alice = await request(app).get('/api/account').set('Authorization', await signToken('auth0|alice'))
    expect(alice.body.displayName).toBe('Alice')
  })

  it.each([
    ['unknown fields', { authSub: 'auth0|someone-else' }],
    ['empty names', { displayName: '   ' }],
    ['overlong names', { displayName: 'x'.repeat(41) }],
    ['non-https pictures', { picture: 'http://img.example/a.png' }],
    ['script URLs', { picture: 'javascript:alert(1)' }],
    ['query operators', { displayName: { $gt: '' } }]
  ])('rejects %s', async (_label, body) => {
    const res = await patch('auth0|alice', body)
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('Invalid request')
  })
})
