import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '../src/lib/logger.js'
import { createServerlessApp } from '../src/serverless.js'

const deps = (connect: () => Promise<unknown>) => ({
  env: { CORS_ORIGINS: ['http://localhost:8080'], TRUST_PROXY_HOPS: 1 },
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  authenticate: vi.fn((_req, _res, next: () => void) => {
    next()
  }),
  connect
})

describe('serverless app', () => {
  it('connects on the first request and reuses the connection after that', async () => {
    const connect = vi.fn().mockResolvedValue(undefined)
    const app = createServerlessApp(deps(connect))
    expect(connect).not.toHaveBeenCalled()
    for (let i = 0; i < 3; i++) expect((await request(app).get('/health')).status).toBe(200)
    expect(connect).toHaveBeenCalledOnce()
  })

  it('answers 503 when the database is unreachable, and retries on the next request', async () => {
    const connect = vi.fn().mockRejectedValueOnce(new Error('connection refused at 10.0.0.1')).mockResolvedValue(undefined)
    const app = createServerlessApp(deps(connect))
    const failed = await request(app).get('/health')
    expect(failed.status).toBe(503)
    expect(failed.body).toEqual({ error: { status: 503, message: 'The server is having trouble reaching its database. Please try again shortly.' } })
    // No internal details leak.
    expect(failed.text).not.toContain('10.0.0.1')
    expect((await request(app).get('/health')).status).toBe(200)
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('keeps the API behaviour: JSON 404s and no X-Powered-By', async () => {
    const app = createServerlessApp(deps(vi.fn().mockResolvedValue(undefined)))
    const res = await request(app).get('/nope')
    expect(res.status).toBe(404)
    expect(res.body.error.status).toBe(404)
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})
