import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { ApiClient } from '../src/api/client'
import { apiKey } from '../src/api/inject'
import type { Campaign, CampaignChapter, GameRules, HeroClass, LeagueDetail, Lineup, Party, SoloFinale, SoloHero, SoloRules, SoloRun, WeekResult } from '../src/api/types'
import { weekStory } from '../src/campaign'
import { provideLeagueForTest } from '../src/league'
import { filterPool, pickProblem, sortPool, swapProblem } from '../src/solo'
import { pickSpotlight } from '../src/spotlight'
import HowItWorksView from '../src/views/HowItWorksView.vue'
import LeaguesView from '../src/views/LeaguesView.vue'
import SoloStartView from '../src/views/SoloStartView.vue'
import FinaleView from '../src/views/league/FinaleView.vue'
import LeagueHomeView from '../src/views/league/LeagueHomeView.vue'
import LeagueLayout from '../src/views/league/LeagueLayout.vue'
import PartyView from '../src/views/league/PartyView.vue'
import QuestView from '../src/views/league/QuestView.vue'
import SoloRunView from '../src/views/league/SoloRunView.vue'
import { detail, fakeApi, mountView, myLeague } from './helpers'

vi.mock('@auth0/auth0-vue', () => ({ useAuth0: () => ({ logout: vi.fn(), user: ref(null) }) }))

/* Solo in the app (docs/SOLO_SPEC.md): starting a run, building the party under the cap, swaps, and the run's boards. */

const crest = { emblem: 'crown', banner: 'crimson' } as const
const COSTS = [1, 4, 9, 16, 25, 36, 49, 64, 81, 100]
const me: Party = { id: 'p1', name: 'Lone Wolves', crest, owner: { id: 'a1', displayName: 'Ethan' }, isMine: true }

const hero = (id: string, level: number, heroClass: HeroClass, position: string, overrides: Partial<SoloHero> = {}): SoloHero => ({
  id,
  name: `Hero ${id}`,
  heroClass,
  race: 'Elf',
  gender: 'female',
  weapon: 'Bow',
  skill: 'Volley',
  attack: 5,
  defense: 5,
  magic: 5,
  level,
  levelRange: null,
  traits: [],
  partyId: null,
  player: { name: `Player ${id}`, team: position === 'DEF' ? `T${id}` : 'KC', position },
  cost: COSTS[level - 1] ?? 1,
  price: null,
  projected: level * 2,
  kickoff: null,
  locked: false,
  ...overrides
})

/** A star, seven cheap heroes, a mid-priced defense and two cheap ones */
const pool = (): SoloHero[] => [
  hero('star', 10, 'Mage', 'QB'),
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => hero(id, 1, id < 'd' ? 'Ranger' : 'Warrior', id < 'd' ? 'WR' : 'RB')),
  hero('mid', 5, 'Paladin', 'DEF'),
  hero('def1', 1, 'Paladin', 'DEF'),
  hero('def2', 1, 'Paladin', 'DEF'),
  hero('def3', 1, 'Paladin', 'DEF')
]

const run = (overrides: Partial<SoloRun> = {}): SoloRun => ({
  status: 'forming',
  confirmed: false,
  rosterSize: 8,
  partySize: 5,
  cap: 116,
  costs: COSTS,
  paladinLimit: 2,
  spent: 0,
  swapsPerWeek: 2,
  swapsLeft: null,
  poolWeek: 3,
  start: { firstWeek: 4, weeks: 14, windows: [3, 3, 3, 3, 2] },
  startProblem: null,
  monsters: [
    { name: 'The Lich', weak: ['Paladin', 'Warrior'], resists: 'Mage', boss: false },
    { name: 'Swamp Hag', weak: ['Mage', 'Rogue'], resists: 'Paladin', boss: false },
    { name: 'Ogre', weak: ['Ranger', 'Mage'], resists: 'Warrior', boss: false },
    { name: 'Wyvern', weak: ['Ranger', 'Rogue'], resists: 'Paladin', boss: false },
    { name: 'The Dragon Tyrant', weak: ['Warrior', 'Paladin'], resists: 'Rogue', boss: true }
  ],
  pool: pool(),
  ...overrides
})

/** A run under way: the star and seven cheap heroes signed, 107 gold spent */
const activeRun = (overrides: Partial<SoloRun> = {}): SoloRun => {
  const signed = new Set(['star', 'a', 'b', 'c', 'd', 'e', 'f', 'g'])
  return run({
    status: 'active',
    confirmed: true,
    spent: 107,
    swapsLeft: 2,
    start: null,
    pool: pool().map(entry => (signed.has(entry.id) ? { ...entry, partyId: 'p1', price: entry.cost } : entry)),
    ...overrides
  })
}

const soloRules = (available = true): SoloRules => ({
  available,
  version: 4,
  rosterSize: 8,
  partySize: 5,
  classLimits: { Paladin: 2 },
  costs: COSTS,
  cap: 116,
  swapsPerWeek: 2,
  firstWeek: 2,
  lastWeek: 17,
  minWeeks: 8,
  chapters: 5,
  lives: 3,
  weakMultiplier: 1.25,
  resistMultiplier: 0.75,
  boss: 'The Dragon Tyrant'
})
const rules = (available = true): GameRules => ({
  version: 1,
  seasonWeeks: 14,
  rosterSize: 10,
  starters: 5,
  autoSwapMultiplier: 0.5,
  classLimits: { Paladin: 2 },
  strategy: { championMultiplier: 1.25, mightyChampionMultiplier: 1.5, orderAndChaosBonus: 0.05, bulwarkFloor: 15 },
  solo: soloRules(available)
})

/** A run has no PIN to show */
function soloLeague(overrides: Partial<LeagueDetail> = {}): LeagueDetail {
  const league = detail({ name: 'Solo run', mode: 'solo', status: 'forming', isHost: true, maxParties: 1, partyCount: 1, playoffs: null, parties: [me] })
  delete league.pin
  return { ...league, ...overrides }
}

const chapter = (number: number, overrides: Partial<CampaignChapter> = {}): CampaignChapter => ({
  chapter: number,
  name: `Monster ${String(number)}`,
  weak: ['Mage', 'Ranger'],
  resists: 'Rogue',
  boss: number === 5,
  hp: 300,
  deadline: [3, 6, 9, 12, 14][number - 1] ?? 14,
  status: 'upcoming',
  hpLeft: 300,
  endedWeek: null,
  ...overrides
})
const campaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  abandoned: false,
  lives: 3,
  livesLeft: 3,
  outcome: 'ongoing',
  chapter: 1,
  chapters: [chapter(1, { status: 'active', hpLeft: 120.4 }), chapter(2), chapter(3), chapter(4), chapter(5, { name: 'The Dragon Tyrant' })],
  lastWeek: 1,
  nextWeek: { week: 2, at: '2026-11-17T12:00:00.000Z' },
  contributions: [{ partyId: 'p1', name: 'Lone Wolves', crest, lastWeek: 180, chapter: 180, total: 180 }],
  myParty: { partyId: 'p1', hasChampion: true },
  ...overrides
})
const weekResult = (week: number): WeekResult => ({
  week,
  matchups: [],
  sides: [{ partyId: 'p1', name: 'Lone Wolves', crest, total: 179.6, champion: 'star', synergies: [], heroes: [
    { heroId: 'star', name: 'Hero star', heroClass: 'Mage', slot: 'Quest', damage: 80.2, resting: false, swappedInto: null, crit: null, quest: true, points: 24 }
  ] }],
  campaign: {
    chapter: 1,
    monster: 'Monster 1',
    hpBefore: 300,
    dealt: 179.6,
    fallen: [],
    failed: null,
    failedHpLeft: null,
    state: { chapter: 1, hpLeft: 120.4, livesLeft: 3, outcome: 'ongoing' }
  }
})
const lineup = (overrides: Partial<Lineup> = {}): Lineup => {
  const roster = activeRun().pool.filter(entry => entry.partyId).map(entry => ({ ...entry, restingNextWeek: entry.id === 'g', kickoff: '2026-11-15T18:00:00.000Z', locked: entry.id === 'a' }))
  return {
    slots: [],
    lineup: null,
    autoSwap: false,
    champion: 'star',
    strategy: { championMultiplier: 1.25, mightyChampionMultiplier: 1.5, orderAndChaosBonus: 0.05, bulwarkFloor: 15 },
    roster,
    nextWeek: 2,
    nextWeekAt: '2026-11-17T12:00:00.000Z',
    questParty: ['star', 'a', 'b', 'c', 'd'],
    questPartySize: 5,
    quest: { encounter: { name: 'Monster 1', weak: ['Mage', 'Ranger'], resists: 'Rogue' }, weakMultiplier: 1.25, resistMultiplier: 0.75, classMultipliers: { Mage: 1, Warrior: 1, Ranger: 1, Rogue: 1, Paladin: 1 } },
    ...overrides
  }
}

async function mountLeague(view: Component, api: ApiClient, league: LeagueDetail, path = '/') {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: view },
      { path: '/quest/:week?', component: view },
      { path: '/:rest(.*)*', component: { template: '<div />' } }
    ]
  })
  await router.push(path)
  await router.isReady()
  const reload = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(view, { global: { plugins: [router], provide: { [apiKey as symbol]: api, ...provideLeagueForTest(league, reload) } } })
  await flushPromises()
  return { wrapper, router, reload }
}

const button = (wrapper: ReturnType<typeof mount>, label: string) => {
  const found = wrapper.find(`button[aria-label="${label}"]`)
  if (!found.exists()) throw new Error(`No button "${label}"`)
  return found
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the pool and the budget', () => {
  it('filters by position, class and a search of player, hero or team', () => {
    const all = pool()
    expect(filterPool(all, { position: 'DEF', heroClass: null, query: '' }).map(entry => entry.id)).toEqual(['mid', 'def1', 'def2', 'def3'])
    expect(filterPool(all, { position: null, heroClass: 'Ranger', query: '' }).map(entry => entry.id)).toEqual(['a', 'b', 'c'])
    expect(filterPool(all, { position: null, heroClass: null, query: ' player STAR ' }).map(entry => entry.id)).toEqual(['star'])
    expect(filterPool(all, { position: null, heroClass: null, query: 'tdef2' }).map(entry => entry.id)).toEqual(['def2'])
  })

  it('sorts by Level, projection, price or name', () => {
    const all = pool()
    expect(sortPool(all, 'level')[0]?.id).toBe('star')
    expect(sortPool(all, 'cost').at(-1)?.id).toBe('star')
    expect(sortPool(all, 'projected').slice(0, 2).map(entry => entry.id)).toEqual(['star', 'mid'])
    expect(sortPool(all, 'name').map(entry => entry.player?.name).slice(0, 2)).toEqual(['Player a', 'Player b'])
  })

  it('stops a pick at the roster size, the cap and the Paladin limit', () => {
    const all = pool()
    const byId = (id: string) => all.find(entry => entry.id === id) ?? all[0]!
    const value = run()
    expect(pickProblem(value, [byId('star')], byId('mid'))).toBe('Costs 25 gold: 16 gold left')
    expect(pickProblem(value, [byId('star')], byId('a'))).toBeNull()
    // 106 + 1 = 107: exactly the cap is allowed
    expect(pickProblem({ ...value, cap: 107 }, [byId('star'), ...'abcdef'.split('').map(byId)], byId('g'))).toBeNull()
    expect(pickProblem({ ...value, cap: 106 }, [byId('star'), ...'abcdef'.split('').map(byId)], byId('g'))).toBe('Costs 1 gold: 0 gold left')
    expect(pickProblem(value, ['star', 'a', 'b', 'c', 'd', 'e', 'f', 'g'].map(byId), byId('def1'))).toBe('Your party has its 8 heroes')
    expect(pickProblem(value, [byId('def1'), byId('def2')], byId('def3'))).toBe('At most 2 Paladins')
    expect(pickProblem(value, [byId('def1')], byId('def2'))).toBeNull()
  })

  it('checks a swap against the swaps left, locks, the cap at prices paid and the Paladin limit', () => {
    const value = activeRun()
    const byId = (id: string) => value.pool.find(entry => entry.id === id) ?? value.pool[0]!
    // Releasing a 1-gold hero leaves 116 - 107 + 1 = 10 to spend
    expect(swapProblem(value, byId('a'), byId('mid'))).toBe('Costs 25 gold: 10 gold to spend')
    expect(swapProblem(value, byId('a'), byId('def1'))).toBeNull()
    // Releasing the star frees what was paid for them
    expect(swapProblem(value, byId('star'), byId('mid'))).toBeNull()
    expect(swapProblem({ ...value, swapsLeft: 0 }, byId('a'), byId('def1'))).toBe('No swaps left this week')
    expect(swapProblem(value, { ...byId('a'), locked: true }, byId('def1'))).toBe('Hero a has kicked off')
    expect(swapProblem(value, byId('a'), { ...byId('def1'), locked: true })).toBe('Hero def1 has kicked off')
    const twoPaladins = { ...value, pool: value.pool.map(entry => (entry.id === 'def1' || entry.id === 'def2' ? { ...entry, partyId: 'p1' } : entry)) }
    expect(swapProblem(twoPaladins, byId('a'), byId('def3'))).toBe('At most 2 Paladins')
    // Swapping one Paladin for another keeps the count
    expect(swapProblem(twoPaladins, { ...byId('def1'), partyId: 'p1', price: 1 }, byId('def3'))).toBeNull()
  })
})

describe('building the party', () => {
  it('shows the budget, when the run would start, and the monsters with their weaknesses', async () => {
    const api = fakeApi({ getSolo: vi.fn().mockResolvedValue(run()) })
    const { wrapper } = await mountLeague(SoloRunView, api, soloLeague())
    expect(api.getSolo).toHaveBeenCalledWith('l1')
    expect(wrapper.find('h1').text()).toBe('Build your party')
    expect(wrapper.find('.budget').text()).toContain('116 gold left of 116')
    expect(wrapper.text()).toContain('starts with NFL week 4: 14 weeks')
    expect(wrapper.text()).toContain('3 weeks, 3 weeks, 3 weeks, 3 weeks, 2 weeks')
    const monsters = wrapper.findAll('.monster')
    expect(monsters).toHaveLength(5)
    expect(monsters[0]?.text()).toContain('The Lich')
    expect(monsters[0]?.text()).toContain('Weak to Paladins and Warriors')
    expect(monsters[4]?.text()).toContain('Boss raid')
    expect(wrapper.find('.confirm .btn-primary').attributes('disabled')).toBeDefined()
  })

  it('sends the first five signed into the Quest party, keeps the cap, and confirms the party with its Champion', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = fakeApi({ getSolo: vi.fn().mockResolvedValue(run()), confirmSolo: vi.fn().mockResolvedValue(activeRun()) })
    const { wrapper, router, reload } = await mountLeague(SoloRunView, api, soloLeague())
    for (const id of ['star', 'a', 'b', 'c', 'd', 'e', 'f']) await button(wrapper, `Sign Hero ${id}`).trigger('click')
    expect(wrapper.find('.budget').text()).toContain('10 gold left')
    // 10 gold left: the 25-gold defense is out of reach, a 1-gold hero isn't
    expect(button(wrapper, 'Sign Hero mid').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Costs 25 gold: 10 gold left')
    await button(wrapper, 'Sign Hero g').trigger('click')
    const picks = wrapper.findAll('.pick')
    expect(picks.map(row => row.text().includes('Quest party'))).toEqual([true, true, true, true, true, false, false, false])
    // A full party: every other Sign is disabled
    expect(button(wrapper, 'Sign Hero def1').attributes('disabled')).toBeDefined()
    // Only a Quest party hero can be Champion
    expect(button(wrapper, 'Name Hero e Champion').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Name Hero star Champion').trigger('click')
    // Swap a fighter for a bench hero
    await button(wrapper, 'Move Hero d to the bench').trigger('click')
    await button(wrapper, 'Move Hero e to the Quest party').trigger('click')
    await wrapper.find('.confirm .btn-primary').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('It starts with NFL week 4'))
    expect(api.confirmSolo).toHaveBeenCalledWith('l1', {
      heroIds: ['star', 'a', 'b', 'c', 'd', 'e', 'f', 'g'],
      questParty: ['star', 'a', 'b', 'c', 'e'],
      champion: 'star'
    })
    expect(reload).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/leagues/l1/quest')
  })

  it('withdraws the Champion with the hero, and confirms nothing when the player says no', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const api = fakeApi({ getSolo: vi.fn().mockResolvedValue(run()) })
    const { wrapper } = await mountLeague(SoloRunView, api, soloLeague())
    for (const id of ['star', 'a', 'b', 'c', 'd', 'e', 'f', 'g']) await button(wrapper, `Sign Hero ${id}`).trigger('click')
    await button(wrapper, 'Name Hero a Champion').trigger('click')
    await button(wrapper, 'Move Hero a to the bench').trigger('click')
    expect(wrapper.find('.pick.champion').exists()).toBe(false)
    await button(wrapper, 'Remove Hero b').trigger('click')
    expect(wrapper.find('.confirm').text()).toContain('Pick 1 more of your 8 heroes')
    await button(wrapper, 'Sign Hero b').trigger('click')
    await button(wrapper, 'Move Hero a to the Quest party').trigger('click')
    expect(wrapper.find('.confirm').text()).toContain('Name a Champion')
    await wrapper.find('.confirm .btn-primary').trigger('click')
    await flushPromises()
    expect(api.confirmSolo).not.toHaveBeenCalled()
  })

  it('leads back to My leagues, and cancels the run from the build page once the player agrees', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const api = fakeApi({ getSolo: vi.fn().mockResolvedValue(run()), cancelLeague: vi.fn().mockResolvedValue(soloLeague({ status: 'canceled' })) })
    const { wrapper, router } = await mountLeague(SoloRunView, api, soloLeague())
    expect(wrapper.find('a.back-link').attributes('href')).toBe('/leagues')
    const cancel = wrapper.find('.danger-zone button')
    expect(cancel.text()).toBe('Cancel run')
    await cancel.trigger('click')
    await flushPromises()
    expect(api.cancelLeague).not.toHaveBeenCalled()
    await cancel.trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('Nothing has been played'))
    expect(api.cancelLeague).toHaveBeenCalledWith('l1')
    expect(router.currentRoute.value.path).toBe('/leagues')
  })

  it('explains why a run can’t start now, and won’t confirm', async () => {
    const problem = 'Too little of the NFL season is left: Solo runs start by NFL week 10, so they open again next season'
    const api = fakeApi({ getSolo: vi.fn().mockResolvedValue(run({ start: null, startProblem: problem })) })
    const { wrapper } = await mountLeague(SoloRunView, api, soloLeague())
    expect(wrapper.find('.warning').text()).toBe(problem)
    for (const id of ['star', 'a', 'b', 'c', 'd', 'e', 'f', 'g']) await button(wrapper, `Sign Hero ${id}`).trigger('click')
    expect(wrapper.find('.confirm .btn-primary').attributes('disabled')).toBeDefined()
  })

  it('filters the pool by position and class', async () => {
    const api = fakeApi({ getSolo: vi.fn().mockResolvedValue(run()) })
    const { wrapper } = await mountLeague(SoloRunView, api, soloLeague())
    expect(wrapper.findAll('.pool .hero')).toHaveLength(12)
    const def = wrapper.findAll('.positions .chip').find(chip => chip.text() === 'DEF')
    await def?.trigger('click')
    expect(wrapper.findAll('.pool .hero')).toHaveLength(4)
    await def?.trigger('click')
    await wrapper.find('select[aria-label="Class"]').setValue('Ranger')
    expect(wrapper.findAll('.pool .hero .name').map(name => name.text())).toEqual(['Hero a', 'Hero b', 'Hero c'])
  })
})

describe('swaps', () => {
  it('releases a hero and signs another from the pool, and warns when the party has no Champion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const after = activeRun({ swapsLeft: 1 })
    const api = fakeApi({
      getSolo: vi.fn().mockResolvedValue(activeRun()),
      swapSolo: vi.fn().mockResolvedValue(after),
      getLineup: vi.fn().mockResolvedValue(lineup({ champion: null }))
    })
    const { wrapper } = await mountLeague(SoloRunView, api, soloLeague({ status: 'active' }))
    expect(wrapper.find('h1').text()).toBe('The market')
    expect(wrapper.find('.budget').text()).toContain('2 of 2 swaps left this week')
    expect(wrapper.find('.budget').text()).toContain('9 gold to spend')
    // Nothing can be signed before choosing who leaves
    expect(button(wrapper, 'Sign Hero def1').attributes('disabled')).toBeDefined()
    const release = wrapper.findAll('.release').find(row => row.text().includes('Hero a'))
    await release?.trigger('click')
    expect(button(wrapper, 'Sign Hero mid').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Sign Hero def1').trigger('click')
    await flushPromises()
    expect(api.swapSolo).toHaveBeenCalledWith('l1', { releaseHeroId: 'a', signHeroId: 'def1' })
    expect(wrapper.text()).toContain('Hero def1 joined your party, taking Hero a’s place.')
    expect(wrapper.text()).toContain('Your party has no Champion')
  })

  it('locks the market once the week’s swaps are used, and heroes who have kicked off', async () => {
    const value = activeRun({ swapsLeft: 0 })
    const api = fakeApi({ getSolo: vi.fn().mockResolvedValue(value) })
    const { wrapper } = await mountLeague(SoloRunView, api, soloLeague({ status: 'active' }))
    expect(wrapper.text()).toContain('No swaps left this week')
    expect(wrapper.findAll('.release').every(row => row.attributes('disabled') !== undefined)).toBe(true)

    const locked = activeRun({ pool: activeRun().pool.map(entry => (entry.id === 'a' ? { ...entry, locked: true } : entry)) })
    const second = await mountLeague(SoloRunView, fakeApi({ getSolo: vi.fn().mockResolvedValue(locked) }), soloLeague({ status: 'active' }))
    const row = second.wrapper.findAll('.release').find(entry => entry.text().includes('Hero a'))
    expect(row?.attributes('disabled')).toBeDefined()
    expect(row?.text()).toContain('kicked off')
  })
})

describe('Solo elsewhere in a run', () => {
  it('has Run, Party, Quest and Market tabs: no matchup, heroes or chat', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/leagues/:id', component: LeagueLayout, children: [{ path: ':rest(.*)*', component: { template: '<div />' } }] }]
    })
    await router.push('/leagues/l1')
    await router.isReady()
    const api = fakeApi({ getLeague: vi.fn().mockResolvedValue(soloLeague({ status: 'active' })) })
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router], provide: { [apiKey as symbol]: api } } })
    await flushPromises()
    expect(wrapper.findAll('.tabs a').map(tab => [tab.text(), tab.attributes('href')])).toEqual([
      ['Run', '/leagues/l1'],
      ['Party', '/leagues/l1/party'],
      ['Quest', '/leagues/l1/quest'],
      ['Market', '/leagues/l1/solo']
    ])
    expect(api.getChatUnread).not.toHaveBeenCalled()
  })

  it('asks to build the party on the run’s home, with no PIN, draft, parties or chat, and cancels it', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = fakeApi({ cancelLeague: vi.fn().mockResolvedValue(soloLeague({ status: 'canceled' })) })
    const { wrapper, reload } = await mountLeague(LeagueHomeView, api, soloLeague({ pin: 'K7QX4M' }))
    expect(wrapper.find('.mode-chip').text()).toBe('Solo')
    expect(wrapper.text()).toContain('Building your party')
    expect(wrapper.find('a.btn-primary').attributes('href')).toBe('/leagues/l1/solo')
    expect(wrapper.find('.pin').exists()).toBe(false)
    expect(wrapper.find('#draft-at').exists()).toBe(false)
    expect(wrapper.find('.parties').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('League chat')
    const cancel = wrapper.find('.danger-zone button')
    expect(cancel.text()).toBe('Cancel run')
    await cancel.trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Nothing has been played'))
    expect(api.cancelLeague).toHaveBeenCalledWith('l1')
    expect(reload).toHaveBeenCalled()
  })

  it('shows the campaign on an active run’s home, and abandoning it is a loss', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const api = fakeApi({ getCampaign: vi.fn().mockResolvedValue(campaign()) })
    const { wrapper } = await mountLeague(LeagueHomeView, api, soloLeague({ status: 'active', resolvedWeeks: 1, seasonWeeks: 14 }))
    expect(wrapper.text()).toContain('Week 2 of 14 · follows the NFL schedule')
    expect(wrapper.find('[aria-label="The campaign"]').exists()).toBe(true)
    expect(api.getStandings).not.toHaveBeenCalled()
    expect(wrapper.find('.standings').exists()).toBe(false)
    await wrapper.find('.danger-zone button').trigger('click')
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('ends now as a loss'))
    expect(api.cancelLeague).not.toHaveBeenCalled()
  })

  it('reads an abandoned run on its home, and offers a new one', async () => {
    const api = fakeApi({ getCampaign: vi.fn().mockResolvedValue(campaign({ outcome: 'lost', abandoned: true, nextWeek: null })) })
    const { wrapper } = await mountLeague(LeagueHomeView, api, soloLeague({ status: 'complete' }))
    expect(wrapper.text()).toContain('Run abandoned')
    expect(wrapper.find('.finale-banner').text()).toContain('Run abandoned')
    expect(wrapper.find('.board').text()).toContain('The run was abandoned at chapter 1.')
    expect(wrapper.find('a.new-run').attributes('href')).toBe('/solo/new')
  })

  it('hides a finished run from My leagues, and offers nothing to hide while it’s being built', async () => {
    const api = fakeApi({ getCampaign: vi.fn().mockResolvedValue(campaign({ outcome: 'lost', abandoned: true, nextWeek: null })) })
    const { wrapper, router } = await mountLeague(LeagueHomeView, api, soloLeague({ status: 'complete' }))
    const hide = wrapper.findAll('button').find(button => button.text() === 'Hide from my leagues')
    await hide!.trigger('click')
    await flushPromises()
    expect(api.setLeagueHidden).toHaveBeenCalledWith('l1', true)
    expect(router.currentRoute.value.path).toBe('/leagues')

    const forming = await mountLeague(LeagueHomeView, fakeApi(), soloLeague())
    expect(forming.wrapper.text()).not.toContain('Hide from my leagues')
  })

  it('shows the quest board for one party: the party’s damage, this week’s kickoffs, and no ranking', async () => {
    const api = fakeApi({
      getCampaign: vi.fn().mockResolvedValue(campaign()),
      getRules: vi.fn().mockResolvedValue(rules()),
      getWeekResult: vi.fn().mockResolvedValue(weekResult(1)),
      getLineup: vi.fn().mockResolvedValue(lineup())
    })
    const { wrapper } = await mountLeague(QuestView, api, soloLeague({ status: 'active', resolvedWeeks: 1 }))
    expect(wrapper.find('.story').text()).toBe('Your party dealt 180 damage to Monster 1.')
    expect(wrapper.find('.helpers').exists()).toBe(false)
    expect(wrapper.find('.sides').exists()).toBe(false)
    expect(wrapper.text()).toContain('Your Quest party\'s damage counts')
    const week = wrapper.findAll('.week-hero')
    expect(week).toHaveLength(5)
    expect(week[0]?.text()).toContain('♛')
    expect(week[1]?.text()).toContain('Kicked off · locked')
    expect(api.getMatchup).not.toHaveBeenCalled()
  })

  it('waits for the party before the quest begins', async () => {
    const api = fakeApi({ getRules: vi.fn().mockResolvedValue(rules()) })
    const { wrapper } = await mountLeague(QuestView, api, soloLeague())
    expect(wrapper.text()).toContain('The run begins once you confirm your party.')
    expect(api.getCampaign).not.toHaveBeenCalled()
  })

  it('tells a Solo week’s story as the party’s', () => {
    const result = weekResult(1)
    const won = { ...result, campaign: result.campaign ? { ...result.campaign, fallen: [1], state: { ...result.campaign.state, outcome: 'won' as const } } : null }
    expect(weekStory(won, campaign().chapters, true)).toBe('Your party dealt 180 damage to Monster 1. Monster 1 fell! The run is won!')
  })

  it('shows the Quest party alone on the Party tab, with the bench and the swaps left', async () => {
    const api = fakeApi({ getLineup: vi.fn().mockResolvedValue(lineup()), getSolo: vi.fn().mockResolvedValue(activeRun({ swapsLeft: 1 })) })
    const { wrapper } = await mountLeague(PartyView, api, soloLeague({ status: 'active' }))
    expect(wrapper.text()).not.toContain('Football lineup')
    expect(wrapper.text()).not.toContain('Gridiron')
    expect(wrapper.find('.swaps').text()).toContain('1 of 2 swaps left this week · 9 gold to spend')
    expect(wrapper.find('.swaps').attributes('href')).toBe('/leagues/l1/solo')
    expect(wrapper.find('a.matchup-link').attributes('href')).toBe('/leagues/l1/quest')
    expect(wrapper.findAll('.quest-member')).toHaveLength(5)
    expect(wrapper.find('.sub-title').text()).toBe('Bench')
    expect(wrapper.text()).toContain('Bye this week')
  })

  it('shows a Solo finale: abandoned, every chapter, the run’s damage and its best moments', async () => {
    const finale: SoloFinale = {
      mode: 'solo',
      outcome: 'lost',
      abandoned: true,
      lives: 3,
      livesLeft: 2,
      chapters: [chapter(1, { status: 'fallen', hpLeft: 0, endedWeek: 2 }), chapter(2, { status: 'active', hpLeft: 80.2 }), chapter(3), chapter(4), chapter(5)],
      weeksPlayed: 3,
      total: 512.4,
      awards: [
        { kind: 'biggestWeek', week: 2, damage: 220.6 },
        { kind: 'topHero', hero: { heroId: 'star', name: 'Hero star', heroClass: 'Mage', player: { name: 'Player star', team: 'KC', position: 'QB' } }, damage: 240 },
        { kind: 'natural20', count: 2, hero: { heroId: 'a', name: 'Hero a', heroClass: 'Ranger', player: null } }
      ]
    }
    const api = fakeApi({ getFinale: vi.fn().mockResolvedValue(finale) })
    const { wrapper } = await mountLeague(FinaleView, api, soloLeague({ status: 'complete' }))
    expect(api.getPlayoffs).not.toHaveBeenCalled()
    expect(wrapper.find('.eyebrow').text()).toBe('Run complete')
    expect(wrapper.find('.headline').text()).toBe('Abandoned')
    expect(wrapper.find('.outcome').text()).toContain('1 of 5 fell')
    expect(wrapper.find('.outcome').text()).toContain('512 damage in 3 weeks')
    expect(wrapper.findAll('.chapter .chapter-status').map(status => status.text())).toEqual(['Fallen', 'Unfinished', 'Never reached', 'Never reached', 'Never reached'])
    const awards = wrapper.findAll('.award')
    expect(awards[0]?.text()).toContain('Week 2')
    expect(awards[0]?.text()).toContain('221')
    expect(awards[1]?.text()).toContain('Hero star · Player star')
    expect(awards[2]?.text()).toContain('2 rolled')
    expect(wrapper.find('a[href="/solo/new"]').exists()).toBe(true)
  })
})

describe('Solo on My Leagues', () => {
  it('tags the run, sends a run being built to its party, and hides the start while one is in progress', async () => {
    const run = myLeague({ name: 'Solo run', mode: 'solo', status: 'forming', isHost: true, maxParties: 1, partyCount: 1 })
    delete run.pin
    const api = fakeApi({ listMyLeagues: vi.fn().mockResolvedValue([run]), getRules: vi.fn().mockResolvedValue(rules()) })
    const { wrapper } = await mountView(LeaguesView, api)
    await flushPromises()
    expect(wrapper.find('.mode-tag').text()).toBe('· Solo')
    expect(wrapper.find('.league').attributes('href')).toBe('/leagues/l1/solo')
    expect(wrapper.find('.callout').text()).toBe('Build your party ›')
    expect(wrapper.find('.slots').exists()).toBe(false)
    const spotlight = wrapper.find('.spotlight')
    expect(spotlight.text()).toContain('Build your party')
    expect(spotlight.find('.btn-primary').attributes('href')).toBe('/leagues/l1/solo')
    expect(wrapper.find('a[href="/solo/new"]').exists()).toBe(false)
  })

  it('offers a Solo run only once it’s switched on', async () => {
    const off = await mountView(LeaguesView, fakeApi({ getRules: vi.fn().mockResolvedValue(rules(false)) }))
    await flushPromises()
    expect(off.wrapper.find('a[href="/solo/new"]').exists()).toBe(false)
    const on = await mountView(LeaguesView, fakeApi({ getRules: vi.fn().mockResolvedValue(rules()) }))
    await flushPromises()
    expect(on.wrapper.find('a[href="/solo/new"]').text()).toBe('Start a Solo run')
  })

  it('shows the campaign on an active run’s card, and the quest board from the spotlight', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-10T12:00:00.000Z'), toFake: ['Date'] })
    const run = myLeague({
      name: 'Solo run',
      mode: 'solo',
      status: 'active',
      resolvedWeeks: 1,
      outlook: {
        ranking: null,
        nextBattle: { week: 2, at: '2026-11-17T12:00:00.000Z', opponent: null, monster: 'Monster 1', noChampion: false, restingStarters: 0 },
        lastBattle: null,
        campaign: { chapter: 1, monster: 'Monster 1', hp: 300, hpLeft: 120.4, deadline: 3, livesLeft: 3, outcome: 'ongoing', myLastWeek: 180 }
      }
    })
    const { wrapper } = await mountView(LeaguesView, fakeApi({ listMyLeagues: vi.fn().mockResolvedValue([run]) }))
    await flushPromises()
    expect(wrapper.find('.league-record').text()).toContain('Monster 1 · 121 of 300 HP · 3 lives left')
    expect(wrapper.find('.spotlight .btn-primary').attributes('href')).toBe('/leagues/l1/quest')
  })

  it('never asks to share a run’s PIN', () => {
    const run = myLeague({ id: 'r', mode: 'solo', status: 'forming', isHost: true })
    const hosted = myLeague({ id: 'h', mode: 'classic', status: 'forming', isHost: true })
    expect(pickSpotlight([run, hosted])).toMatchObject({ kind: 'build', league: { id: 'r' } })
    expect(pickSpotlight([{ ...run, status: 'canceled' }, hosted])).toMatchObject({ kind: 'gather', league: { id: 'h' } })
  })
})

describe('starting a run', () => {
  it('names the party and goes to build it', async () => {
    const api = fakeApi({ getRules: vi.fn().mockResolvedValue(rules()), startSolo: vi.fn().mockResolvedValue(soloLeague({ id: 'r1' })) })
    const { wrapper, router } = await mountView(SoloStartView, api)
    await flushPromises()
    expect(wrapper.text()).toContain('Sign 8 heroes under a budget of 116 gold')
    await wrapper.find('#party-name').setValue('Lone Wolves')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.startSolo).toHaveBeenCalledWith({ name: 'Lone Wolves', crest: expect.any(Object) })
    expect(router.currentRoute.value.path).toBe('/leagues/r1/solo')
  })

  it('shows why the API refused to start a run', async () => {
    const { ApiError } = await import('../src/api/client')
    const api = fakeApi({
      getRules: vi.fn().mockResolvedValue(rules()),
      startSolo: vi.fn().mockRejectedValue(new ApiError(409, 'You already have a Solo run in progress: finish or abandon it first'))
    })
    const { wrapper } = await mountView(SoloStartView, api)
    await wrapper.find('#party-name').setValue('Lone Wolves')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('You already have a Solo run in progress')
  })
})

describe('How it works', () => {
  it('explains Solo once it’s switched on', async () => {
    const on = await mountView(HowItWorksView, fakeApi({ getRules: vi.fn().mockResolvedValue(rules()) }))
    await flushPromises()
    expect(on.wrapper.find('a[href="#solo"]').exists()).toBe(true)
    const section = on.wrapper.find('#solo')
    expect(section.text()).toContain('1 gold at Level 1, 100 at Level 10')
    expect(section.text()).toContain('the cap is 116 gold')
    expect(section.text()).toContain('2 swaps a week.')
    expect(section.text()).toContain('4 monsters, then a boss raid against The Dragon Tyrant')
    const off = await mountView(HowItWorksView, fakeApi({ getRules: vi.fn().mockResolvedValue(rules(false)) }))
    await flushPromises()
    expect(off.wrapper.find('#solo').exists()).toBe(false)
  })
})
