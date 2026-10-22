import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { ApiClient } from '../src/api/client'
import { apiKey } from '../src/api/inject'
import type { LeagueDetail, LeagueSummary, MyLeague } from '../src/api/types'

export function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getAccount: vi.fn(),
    updateAccount: vi.fn(),
    listMyLeagues: vi.fn().mockResolvedValue([]),
    getLeague: vi.fn(),
    createLeague: vi.fn(),
    previewLeague: vi.fn(),
    listPublicLeagues: vi.fn().mockResolvedValue([]),
    joinLeague: vi.fn(),
    scheduleDraft: vi.fn(),
    cancelLeague: vi.fn(),
    leaveLeague: vi.fn(),
    removeParty: vi.fn(),
    updateParty: vi.fn(),
    listHeroes: vi.fn().mockResolvedValue([]),
    getHero: vi.fn(),
    getRankings: vi.fn().mockResolvedValue({ heroIds: [] }),
    setRankings: vi.fn(),
    getLineup: vi.fn(),
    setLineup: vi.fn(),
    setChampion: vi.fn(),
    claimHero: vi.fn(),
    listMoves: vi.fn().mockResolvedValue([]),
    getSchedule: vi.fn().mockResolvedValue([]),
    getMatchup: vi.fn(),
    getRules: vi.fn(),
    getWeekResult: vi.fn(),
    getStandings: vi.fn().mockResolvedValue([]),
    getFinale: vi.fn(),
    getChat: vi.fn().mockResolvedValue({ messages: [], hasMore: false, canModerate: false, readOnly: false }),
    postChat: vi.fn(),
    deleteChat: vi.fn(),
    reportChat: vi.fn(),
    ...overrides
  }
}

/** Mounts a view with a real router (memory history), Pinia, and the given API. */
export async function mountView(view: Component, api: ApiClient, path = '/') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: view },
      { path: '/:rest(.*)*', component: { template: '<div>elsewhere</div>' } }
    ]
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(view, { global: { plugins: [router, pinia], provide: { [apiKey as symbol]: api } } })
  return { wrapper, router }
}

export const summary = (overrides: Partial<LeagueSummary> = {}): LeagueSummary => ({
  id: 'l1',
  name: 'Knights of the Gridiron',
  status: 'forming',
  visibility: 'private',
  cadence: 'daily',
  maxParties: 6,
  partyCount: 3,
  host: { id: 'a1', displayName: 'Ethan' },
  isHost: false,
  pin: 'K7QX4M',
  draftAt: null,
  weekOneAt: null,
  resolvedWeeks: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides
})

export const myLeague = (overrides: Partial<MyLeague> = {}): MyLeague => ({
  ...summary(),
  myParty: { id: 'p1', name: 'Dragon Slayers', crest: { emblem: 'crown', banner: 'crimson' } },
  standing: null,
  outlook: { ranking: null, nextBattle: null, lastBattle: null },
  ...overrides
})

export const detail = (overrides: Partial<LeagueDetail> = {}): LeagueDetail => ({
  ...summary(),
  rulesetVersion: 1,
  parties: [],
  draft: null,
  ...overrides
})
