import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createLogger } from '../src/lib/logger.js'
import { errorHandler } from '../src/middleware/errors.js'
import { maskPins } from '../src/app.js'
import { buildTestApp } from './helpers.js'

describe('app infrastructure', () => {
  const app = buildTestApp()

  it('reports health without auth', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', db: 'up' })
  })

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/nope')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { status: 404, message: 'Not Found' } })
  })

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('only allows configured CORS origins', async () => {
    const allowed = await request(app).get('/health').set('Origin', 'http://localhost:8080')
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:8080')
    const denied = await request(app).get('/health').set('Origin', 'https://evil.example')
    expect(denied.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('errorHandler', () => {
  const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' })

  function appThatThrows(error: unknown) {
    const app = express()
    app.use(express.json({ limit: '1kb' }))
    app.all('/', () => {
      throw error
    })
    app.use(errorHandler(logger))
    return app
  }

  it('hides details of unexpected errors', async () => {
    const res = await request(appThatThrows(new Error('db password is hunter2'))).get('/')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: { status: 500, message: 'Internal Server Error' } })
  })

  it('rejects malformed JSON with 400', async () => {
    const res = await request(appThatThrows(new Error('unreachable')))
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"bad json')
    expect(res.status).toBe(400)
  })

  it('rejects oversized bodies with 413', async () => {
    const res = await request(appThatThrows(new Error('unreachable')))
      .post('/')
      .send({ big: 'x'.repeat(2048) })
    expect(res.status).toBe(413)
  })
})

describe('maskPins', () => {
  it('hides league PINs in logged URLs', () => {
    expect(maskPins('/api/leagues/pin/K7QX4M')).toBe('/api/leagues/pin/[redacted]')
    expect(maskPins('/api/leagues/pin/K7QX4M?x=1')).toBe('/api/leagues/pin/[redacted]?x=1')
    expect(maskPins('/api/leagues/mine')).toBe('/api/leagues/mine')
  })
})
