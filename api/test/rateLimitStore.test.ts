import mongoose from 'mongoose'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { MongoRateLimitStore } from '../src/lib/rateLimitStore.js'
import { PIN_ATTEMPTS_PER_MINUTE } from '../src/modules/leagues/league.routes.js'
import { buildTestApp, signToken } from './helpers.js'

const options = (windowMs: number) => ({ windowMs }) as Parameters<MongoRateLimitStore['init']>[0]

describe('MongoRateLimitStore', () => {
  it('counts hits within a window and starts over once it passes', async () => {
    const store = new MongoRateLimitStore('t:')
    store.init(options(200))
    expect((await store.increment('a')).totalHits).toBe(1)
    const second = await store.increment('a')
    expect(second.totalHits).toBe(2)
    expect(second.resetTime!.getTime()).toBeGreaterThan(Date.now())
    expect(await store.get('a')).toMatchObject({ totalHits: 2 })

    await new Promise(resolve => setTimeout(resolve, 250))
    expect(await store.get('a')).toBeUndefined()
    expect((await store.increment('a')).totalHits).toBe(1)
  })

  it('shares counts between instances, but not between prefixes or keys', async () => {
    const one = new MongoRateLimitStore('pin:')
    const two = new MongoRateLimitStore('pin:')
    const other = new MongoRateLimitStore('ip:')
    for (const store of [one, two, other]) store.init(options(60_000))
    await one.increment('alice')
    await two.increment('alice')
    expect((await one.increment('alice')).totalHits).toBe(3)
    expect((await other.increment('alice')).totalHits).toBe(1)
    expect((await one.increment('bob')).totalHits).toBe(1)
  })

  it('decrements and resets', async () => {
    const store = new MongoRateLimitStore('t:')
    store.init(options(60_000))
    await store.increment('a')
    await store.increment('a')
    await store.decrement('a')
    expect(await store.get('a')).toMatchObject({ totalHits: 1 })
    await store.resetKey('a')
    expect(await store.get('a')).toBeUndefined()
    await store.decrement('missing') // no error, no negative counters
    expect(await store.get('missing')).toBeUndefined()
  })

  it('lets MongoDB expire old windows', async () => {
    new MongoRateLimitStore('t:').init(options(60_000))
    await new Promise(resolve => setTimeout(resolve, 100))
    const indexes = await mongoose.connection.collection('ratelimits').indexes()
    expect(indexes.find(index => index.key.resetAt === 1)?.expireAfterSeconds).toBe(0)
  })
})

describe('rate limits across API instances', () => {
  it('stops PIN guessing even when attempts are spread across instances', async () => {
    // Two separate app instances, as on a serverless host, sharing one database.
    const instances = [buildTestApp(), buildTestApp()]
    const token = await signToken('auth0|guesser')
    const guess = (index: number) =>
      request(instances[index % 2]!).get('/api/leagues/pin/ZZZZZZ').set('Authorization', token)

    for (let i = 0; i < PIN_ATTEMPTS_PER_MINUTE; i++) expect((await guess(i)).status).toBe(404)
    expect((await guess(PIN_ATTEMPTS_PER_MINUTE)).status).toBe(429)
    expect((await guess(PIN_ATTEMPTS_PER_MINUTE + 1)).status).toBe(429)
  })
})
