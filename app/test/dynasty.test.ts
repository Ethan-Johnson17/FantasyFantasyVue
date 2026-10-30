import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { ApiClient } from '../src/api/client'
import { apiKey } from '../src/api/inject'
import type { DynastySummary, Hero, KeeperOption, Keepers, LeagueDetail, Party } from '../src/api/types'
import { provideLeagueForTest } from '../src/league'
import HostLeagueView from '../src/views/HostLeagueView.vue'
import JoinLeagueView from '../src/views/JoinLeagueView.vue'
import DynastyView from '../src/views/league/DynastyView.vue'
import HeroesView from '../src/views/league/HeroesView.vue'
import KeepersView from '../src/views/league/KeepersView.vue'
import LeagueHomeView from '../src/views/league/LeagueHomeView.vue'
import { detail, fakeApi, mountView, summary } from './helpers'

const crest = { emblem: 'crown', banner: 'crimson' } as const
const party = (id: string, isMine = false): Party => ({ id, name: `Party ${id}`, crest, owner: { id: `o-${id}`, displayName: `Owner ${id}` }, isMine })
const dynasty = (overrides: Partial<NonNullable<LeagueDetail['dynasty']>> = {}) => ({ seasons: 3, number: 2, previousLeagueId: 'l0', nextLeagueId: null, ...overrides })

async function mountLeague(view: Component, api: ApiClient, league: LeagueDetail) {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: view }] })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(view, { global: { plugins: [router], provide: { [apiKey as symbol]: api, ...provideLeagueForTest(league, vi.fn()) } } })
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('hosting a dynasty', () => {
  it('offers one season or a 3- or 5-season dynasty for Classic leagues', async () => {
    const api = fakeApi({ getRules: vi.fn().mockRejectedValue(new Error('offline')), createLeague: vi.fn().mockResolvedValue(detail({ id: 'd1' })) })
    const { wrapper } = await mountView(HostLeagueView, api)
    await flushPromises()
    await wrapper.find('#league-name').setValue('Long Haul')
    await wrapper.find('#party-name').setValue('Old Guard')
    await wrapper.find('input[name="length"][value="5"]').setValue(true)
    expect(wrapper.text()).toContain('A dynasty plays 5 seasons in a row')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createLeague).toHaveBeenCalledWith(expect.objectContaining({ name: 'Long Haul', dynastySeasons: 5 }))
  })

  it('sends no dynasty for a single season', async () => {
    const api = fakeApi({ getRules: vi.fn().mockRejectedValue(new Error('offline')), createLeague: vi.fn().mockResolvedValue(detail({ id: 'd1' })) })
    const { wrapper } = await mountView(HostLeagueView, api)
    await flushPromises()
    await wrapper.find('#league-name').setValue('Quick')
    await wrapper.find('#party-name').setValue('Sprinters')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createLeague).toHaveBeenCalledWith(expect.not.objectContaining({ dynastySeasons: expect.anything() as unknown }))
  })
})

describe('joining between dynasty seasons', () => {
  const preview = () =>
    summary({ name: 'Long Haul', partyCount: 3, maxParties: 4, dynasty: dynasty(), openParties: [{ id: 'open1', name: 'Old Guard', crest: { emblem: 'tower', banner: 'sapphire' } }] })

  it('lets a newcomer take over an open party, suggesting its name and crest', async () => {
    const api = fakeApi({ previewLeague: vi.fn().mockResolvedValue(preview()), joinLeague: vi.fn().mockResolvedValue(detail({ id: 'l2' })) })
    const { wrapper } = await mountView(JoinLeagueView, api, '/join?pin=K7QX4M')
    await flushPromises()
    // A new party has no room: the open party holds the last place.
    expect(wrapper.text()).toContain('This league is full')
    await wrapper.findAll('input[name="take-over"]')[1]!.setValue(true)
    expect((wrapper.find('#party-name').element as HTMLInputElement).value).toBe('Old Guard')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.joinLeague).toHaveBeenCalledWith('K7QX4M', { name: 'Old Guard', crest: { emblem: 'tower', banner: 'sapphire' } }, 'open1')
  })
})

describe('the league page in a dynasty', () => {
  it('shows the offseason: keepers and open parties', async () => {
    const league = detail({ status: 'forming', dynasty: dynasty(), parties: [party('a', true)], openParties: [{ id: 'o1', name: 'Old Guard', crest }] })
    const { wrapper } = await mountLeague(LeagueHomeView, fakeApi(), league)
    expect(wrapper.text()).toContain('Dynasty · season 2 of 3')
    expect(wrapper.find('a[href="/leagues/l1/keepers"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Open parties')
    expect(wrapper.text()).toContain('Old Guard')
    expect(wrapper.find('a[href="/leagues/l0"]').text()).toContain('Season 1')
  })

  it('lets the host start the next season once this one is over', async () => {
    const api = fakeApi({ startNextSeason: vi.fn().mockResolvedValue(detail({ id: 'l2' })) })
    const league = detail({ status: 'complete', isHost: true, resolvedWeeks: 14, dynasty: dynasty({ number: 1, previousLeagueId: null }), parties: [party('a', true)] })
    const { wrapper, router } = await mountLeague(LeagueHomeView, api, league)
    await wrapper.findAll('button').find(b => b.text() === 'Start season 2')!.trigger('click')
    await flushPromises()
    expect(api.startNextSeason).toHaveBeenCalledWith('l1')
    expect(router.currentRoute.value.fullPath).toBe('/leagues/l2')
  })

  it('links to the next season once it has started, and offers nothing after the last', async () => {
    const opened = detail({ status: 'complete', isHost: true, dynasty: dynasty({ number: 1, previousLeagueId: null, nextLeagueId: 'l2' }), parties: [party('a', true)] })
    const first = await mountLeague(LeagueHomeView, fakeApi(), opened)
    expect(first.wrapper.find('a[href="/leagues/l2"]').text()).toContain('Season 2 is open')
    expect(first.wrapper.text()).not.toContain('Start season')
    const last = detail({ status: 'complete', isHost: true, dynasty: dynasty({ number: 3 }), parties: [party('a', true)] })
    const end = await mountLeague(LeagueHomeView, fakeApi(), last)
    expect(end.wrapper.text()).not.toContain('Start season')
  })
})

describe('choosing keepers', () => {
  const option = (heroId: string, overrides: Partial<KeeperOption> = {}): KeeperOption => ({
    heroId,
    name: `Hero ${heroId}`,
    heroClass: 'Mage',
    previousLevel: 5,
    level: 7,
    traits: [],
    retired: false,
    kept: false,
    xp: { xp: 320, tier: 2, bonus: 0.02, nextTierAt: 450 },
    earnedTrait: null,
    ...overrides
  })
  const keepers = (): Keepers => ({
    limit: 3,
    options: [option('h1'), option('h2', { level: 3 }), option('h3', { earnedTrait: 'mighty', xp: { xp: 640, tier: 4, bonus: 0.04, nextTierAt: null } }), option('h4'), option('h5', { retired: true, level: null })]
  })

  it('shows each hero re-leveled with their XP, and keeps up to 3', async () => {
    const setKeepers = vi.fn().mockImplementation((_id: string, heroIds: string[]) =>
      Promise.resolve({ ...keepers(), options: keepers().options.map(entry => ({ ...entry, kept: heroIds.includes(entry.heroId) })) })
    )
    const api = fakeApi({ getKeepers: vi.fn().mockResolvedValue(keepers()), setKeepers })
    const { wrapper } = await mountLeague(KeepersView, api, detail({ status: 'forming', dynasty: dynasty(), parties: [party('a', true)] }))
    const row = (name: string) => wrapper.findAll('button.option').find(button => button.text().includes(name))!
    expect(row('Hero h1').text()).toContain('▲ 2')
    expect(row('Hero h2').text()).toContain('▼ 2')
    expect(row('Hero h1').text()).toContain('XP 320 · tier 2 · +2%')
    expect(row('Hero h3').text()).toContain('Earns mighty')
    expect(row('Hero h5').attributes('disabled')).toBeDefined()

    for (const name of ['Hero h1', 'Hero h2', 'Hero h3']) await row(name).trigger('click')
    expect(row('Hero h4').attributes('disabled')).toBeDefined() // 3 already chosen
    await wrapper.findAll('button').find(b => b.text() === 'Save keepers')!.trigger('click')
    await flushPromises()
    expect(setKeepers).toHaveBeenCalledWith('l1', ['h1', 'h2', 'h3'])
    expect(wrapper.text()).toContain('Keeping 3.')
  })

  it('locks once the draft is scheduled', async () => {
    const api = fakeApi({ getKeepers: vi.fn().mockResolvedValue(keepers()) })
    const { wrapper } = await mountLeague(KeepersView, api, detail({ status: 'drafting', dynasty: dynasty(), parties: [party('a', true)] }))
    expect(wrapper.text()).toContain('keepers are locked')
    expect(wrapper.findAll('button').some(b => b.text() === 'Save keepers')).toBe(false)
  })
})

describe('the dynasty page', () => {
  it('lists each season’s champion and the all-time standings', async () => {
    const summaryData: DynastySummary = {
      seasons: 5,
      current: 2,
      history: [
        { number: 1, leagueId: 'l0', status: 'complete', champion: { name: 'Old Guard', crest } },
        { number: 2, leagueId: 'l1', status: 'forming', champion: null }
      ],
      standings: [
        { name: 'Old Guard', crest, titles: 1, wins: 10, losses: 4, draws: 0, seasons: 1, isMine: true },
        { name: 'Upstarts', crest, titles: 0, wins: 4, losses: 10, draws: 0, seasons: 1, isMine: false }
      ]
    }
    const api = fakeApi({ getDynasty: vi.fn().mockResolvedValue(summaryData) })
    const { wrapper } = await mountLeague(DynastyView, api, detail({ status: 'forming', dynasty: dynasty({ seasons: 5 }), parties: [party('a', true)] }))
    expect(wrapper.text()).toContain('Season 2 of 5')
    expect(wrapper.find('.seasons').text()).toMatch(/Season 1.*♛ Old Guard.*Season 2.*Offseason.*Season 3 · still to come/s)
    const rows = wrapper.findAll('.standings .row')
    expect(rows[0]!.text()).toMatch(/Old Guard · you.*♛.*10–4/s)
    expect(rows[0]!.classes()).toContain('mine')
  })
})

describe('XP on the hero list', () => {
  it('shows kept heroes’ XP and bonus', async () => {
    const hero = (id: string, overrides: Partial<Hero> = {}): Hero => ({
      id,
      name: `Hero ${id}`,
      heroClass: 'Mage',
      race: 'Elf',
      gender: 'female',
      weapon: 'Staff',
      skill: 'Fireball',
      attack: 9,
      defense: 9,
      magic: 12,
      level: 5,
      levelRange: null,
      traits: [],
      partyId: null,
      ...overrides
    })
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue([hero('k1', { xp: { xp: 470, tier: 3, bonus: 0.03, nextTierAt: 600 } }), hero('n1')]),
      listMoves: vi.fn().mockResolvedValue([])
    })
    const { wrapper } = await mountLeague(HeroesView, api, detail({ status: 'active', dynasty: dynasty(), parties: [party('a', true)] }))
    expect(wrapper.findAll('.xp').map(badge => badge.text())).toEqual(['XP 470 · tier 3 · +3%'])
  })
})
