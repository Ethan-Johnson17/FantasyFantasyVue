import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env.js'

const valid = {
  MONGODB_URI: 'mongodb+srv://user:supersecret@cluster.example.net/fantasyfantasy-dev',
  AUTH0_DOMAIN: 'example.us.auth0.com',
  AUTH0_AUDIENCE: 'https://api.example'
}

describe('loadEnv', () => {
  it('applies defaults and parses lists', () => {
    const env = loadEnv({ ...valid, CORS_ORIGINS: 'http://a.test, http://b.test,' })
    expect(env.PORT).toBe(3000)
    expect(env.NODE_ENV).toBe('development')
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test'])
  })

  it('names missing variables', () => {
    expect(() => loadEnv({})).toThrow(/MONGODB_URI[\s\S]*AUTH0_DOMAIN[\s\S]*AUTH0_AUDIENCE/)
  })

  it('never echoes secret values in the error', () => {
    const run = () => loadEnv({ ...valid, MONGODB_URI: 'postgres://user:supersecret@host/db' })
    expect(run).toThrow(/MONGODB_URI/)
    expect(run).not.toThrow(/supersecret/)
  })
})
