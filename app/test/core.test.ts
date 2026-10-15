import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'
import { ApiError, createApiClient } from '../src/api/client'
import { loadConfig } from '../src/config'
import { BANNERS, crestName, EMBLEMS } from '../src/crests'
import { normalizePin } from '../src/pin'
import { authGuard } from '../src/router'
import { DEFAULT_DISPLAY_NAME, useSessionStore } from '../src/stores/session'
import { nextBattleAt, timeUntil } from '../src/time'
import { fakeApi } from './helpers'

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('createApiClient', () => {
  it('sends the bearer token and JSON body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(201, { id: 'l1' }))
    const api = createApiClient('http://api.test', () => Promise.resolve('tok'), fetchImpl)
    await api.joinLeague('K7QX4M', { name: 'Elves', crest: { emblem: 'moon', banner: 'sapphire' } })

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/api/leagues/join')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init.body))).toEqual({ pin: 'K7QX4M', party: { name: 'Elves', crest: { emblem: 'moon', banner: 'sapphire' } } })
  })

  it('surfaces the server message and field issues as an ApiError', async () => {
    const body = { error: { status: 400, message: 'Invalid request', issues: [{ path: 'name', message: 'Too short' }] } }
    const api = createApiClient('', () => Promise.resolve('t'), vi.fn().mockResolvedValue(json(400, body)))
    const error = await api.getAccount().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, message: 'Invalid request', issues: [{ path: 'name', message: 'Too short' }] })
  })

  it('falls back to a friendly message when the body is not JSON', async () => {
    const api = createApiClient('', () => Promise.resolve('t'), vi.fn().mockResolvedValue(new Response('oops', { status: 502 })))
    await expect(api.getAccount()).rejects.toMatchObject({ status: 502, message: 'Something went wrong. Please try again.' })
  })

  it('encodes path segments', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, {}))
    await createApiClient('', () => Promise.resolve('t'), fetchImpl).previewLeague('a/b?c')
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/leagues/pin/a%2Fb%3Fc')
  })
})

describe('crests', () => {
  it('match the keys the API accepts', () => {
    const source = readFileSync(path.join(import.meta.dirname, '../../api/src/modules/leagues/crests.ts'), 'utf8')
    const list = (name: string) =>
      [...(new RegExp(`${name} = \\[([^\\]]*)\\]`).exec(source)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map(match => match[1])
    expect(EMBLEMS.map(emblem => emblem.key)).toEqual(list('CREST_EMBLEMS'))
    expect(BANNERS.map(banner => banner.key)).toEqual(list('CREST_BANNERS'))
  })

  it('names crests by banner and emblem', () => {
    expect(crestName({ emblem: 'lightning', banner: 'emerald' })).toBe('Emerald Storm')
  })
})

describe('normalizePin', () => {
  it('uppercases, strips separators, and caps at six characters', () => {
    expect(normalizePin(' k7q-x4m ')).toBe('K7QX4M')
    expect(normalizePin('k7qx4m99')).toBe('K7QX4M')
  })
})

describe('time', () => {
  const now = new Date('2026-10-14T12:00:00Z')
  const later = (ms: number) => new Date(now.getTime() + ms)
  it.each([
    [-1000, 'now'],
    [30_000, 'in 1m'],
    [45 * 60_000, 'in 45m'],
    [(6 * 60 + 12) * 60_000, 'in 6h 12m'],
    [(28 * 60) * 60_000, 'in 1 day 4 hours'],
    [48 * 3_600_000, 'in 2 days'],
    [5 * 86_400_000 + 3_600_000, 'in 5 days']
  ])('formats %i ms as %s', (ms, text) => {
    expect(timeUntil(later(ms), now)).toBe(text)
  })

  it('finds the next battle from week 1 and weeks played', () => {
    expect(nextBattleAt('2026-10-01T19:00:00.000Z', 3, 'daily').toISOString()).toBe('2026-10-04T19:00:00.000Z')
    expect(nextBattleAt('2026-10-01T19:00:00.000Z', 1, 'weekly').toISOString()).toBe('2026-10-08T19:00:00.000Z')
  })
})

describe('loadConfig', () => {
  it('requires the Auth0 settings and defaults the API URL', () => {
    expect(() => loadConfig({} as ImportMetaEnv)).toThrow(/VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, VITE_AUTH0_AUDIENCE/)
    const env = { VITE_AUTH0_DOMAIN: 'd', VITE_AUTH0_CLIENT_ID: 'c', VITE_AUTH0_AUDIENCE: 'a' } as ImportMetaEnv
    expect(loadConfig(env).apiUrl).toBe('http://localhost:3000')
  })
})

describe('authGuard', () => {
  const route = (meta: Record<string, unknown>, fullPath = '/leagues') => ({ meta, fullPath }) as unknown as RouteLocationNormalized

  it('sends signed-out visitors to sign-in, remembering where they were going', async () => {
    const guard = authGuard({ isLoading: ref(false), isAuthenticated: ref(false) })
    expect(await guard(route({ auth: true }, '/join?pin=K7QX4M'))).toEqual({ name: 'sign-in', query: { next: '/join?pin=K7QX4M' } })
    expect(await guard(route({ guestOnly: true }))).toBe(true)
  })

  it('keeps signed-in users out of sign-in', async () => {
    const guard = authGuard({ isLoading: ref(false), isAuthenticated: ref(true) })
    expect(await guard(route({ guestOnly: true }))).toEqual({ name: 'leagues' })
    expect(await guard(route({ auth: true }))).toBe(true)
  })

  it('waits for Auth0 to finish loading before deciding', async () => {
    const isLoading = ref(true)
    const isAuthenticated = ref(false)
    const decision = authGuard({ isLoading, isAuthenticated })(route({ auth: true }))
    isAuthenticated.value = true
    isLoading.value = false
    expect(await decision).toBe(true)
  })
})

describe('session store', () => {
  it('replaces the placeholder name with the identity provider name on first sign-in', async () => {
    setActivePinia(createPinia())
    const api = fakeApi({
      getAccount: vi.fn().mockResolvedValue({ id: 'a1', displayName: DEFAULT_DISPLAY_NAME }),
      updateAccount: vi.fn().mockResolvedValue({ id: 'a1', displayName: 'Ethan' })
    })
    const account = await useSessionStore().load(api, '  Ethan ')
    expect(api.updateAccount).toHaveBeenCalledWith({ displayName: 'Ethan' })
    expect(account.displayName).toBe('Ethan')
  })

  it('leaves a name the player already chose alone', async () => {
    setActivePinia(createPinia())
    const api = fakeApi({ getAccount: vi.fn().mockResolvedValue({ id: 'a1', displayName: 'Alaric' }) })
    await useSessionStore().load(api, 'Ethan')
    expect(api.updateAccount).not.toHaveBeenCalled()
  })
})
