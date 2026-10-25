import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { ApiClient } from '../src/api/client'
import { apiKey } from '../src/api/inject'
import type { CrossoverRules, GameRules, Hero, LeagueDetail, Lineup, Matchup, MatchupSide, Party, ScheduleWeek, WeekResult } from '../src/api/types'
import CrossoverResult from '../src/components/matchup/CrossoverResult.vue'
import { provideLeagueForTest } from '../src/league'
import { mySeason } from '../src/mySeason'
import HostLeagueView from '../src/views/HostLeagueView.vue'
import HowItWorksView from '../src/views/HowItWorksView.vue'
import MatchupView from '../src/views/league/MatchupView.vue'
import PartyView from '../src/views/league/PartyView.vue'
import { detail, fakeApi, mountView } from './helpers'

const crest = { emblem: 'crown', banner: 'crimson' } as const
const party = (id: string, isMine = false): Party => ({ id, name: `Party ${id}`, crest, owner: { id: `o-${id}`, displayName: `Owner ${id}` }, isMine })
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
  partyId: 'a',
  player: { name: `Player ${id}`, team: 'KC', position: 'QB' },
  ...overrides
})
const encounter = { name: 'Frost Wyrm', weak: ['Mage', 'Ranger'], resists: 'Rogue' } as const
const crossoverRules = (available: boolean): CrossoverRules => ({
  available,
  rosterSize: 14,
  slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DEF'],
  lastWeek: 17,
  minWeeks: 4,
  quest: { partySize: 5, weakMultiplier: 1.25, resistMultiplier: 0.75, natural20Multiplier: 1.25, natural1Multiplier: 0 },
  encounters: [{ ...encounter, weak: [...encounter.weak] }]
})
const rules = (available: boolean): GameRules => ({
  version: 1,
  seasonWeeks: 14,
  rosterSize: 10,
  starters: 5,
  autoSwapMultiplier: 0.5,
  classLimits: { Paladin: 2 },
  strategy: { championMultiplier: 1.25, mightyChampionMultiplier: 1.5, orderAndChaosBonus: 0.05, bulwarkFloor: 15 },
  crossover: crossoverRules(available)
})
const crossoverLeague = (overrides: Partial<LeagueDetail> = {}) =>
  detail({ mode: 'crossover', status: 'active', cadence: 'weekly', seasonWeeks: 10, resolvedWeeks: 0, parties: [party('a', true), party('b')], ...overrides })

async function mountLeague(view: Component, api: ApiClient, league: LeagueDetail, path = '/') {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: view },
      { path: '/matchup/:week?', component: view },
      { path: '/:rest(.*)*', component: { template: '<div />' } }
    ]
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(view, { global: { plugins: [router], provide: { [apiKey as symbol]: api, ...provideLeagueForTest(league, vi.fn()) } } })
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('hosting a Crossover league', () => {
  it('offers the mode only once Crossover is switched on', async () => {
    const { wrapper } = await mountView(HostLeagueView, fakeApi({ getRules: vi.fn().mockResolvedValue(rules(false)) }))
    await flushPromises()
    expect(wrapper.find('input[name="mode"]').exists()).toBe(false)
    expect(wrapper.find('input[name="cadence"]').exists()).toBe(true)
  })

  it('sends Crossover, which follows the NFL schedule instead of a cadence', async () => {
    const api = fakeApi({ getRules: vi.fn().mockResolvedValue(rules(true)), createLeague: vi.fn().mockResolvedValue(detail({ id: 'x' })) })
    const { wrapper } = await mountView(HostLeagueView, api)
    await flushPromises()
    await wrapper.find('input[name="mode"][value="crossover"]').setValue(true)
    expect(wrapper.find('input[name="cadence"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('follows the real NFL schedule')
    await wrapper.find('#league-name').setValue('Sunday Crew')
    await wrapper.find('#party-name').setValue('Gridiron Knights')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createLeague).toHaveBeenCalledWith(expect.objectContaining({ mode: 'crossover', name: 'Sunday Crew' }))
  })
})

describe('How it works', () => {
  it('explains Crossover once it is available', async () => {
    const off = await mountView(HowItWorksView, fakeApi({ getRules: vi.fn().mockResolvedValue(rules(false)) }))
    await flushPromises()
    expect(off.wrapper.find('#crossover').exists()).toBe(false)
    const on = await mountView(HowItWorksView, fakeApi({ getRules: vi.fn().mockResolvedValue(rules(true)) }))
    await flushPromises()
    const text = on.wrapper.find('#crossover').text()
    expect(text).toContain('Two boards every week')
    expect(text).toContain('a party of 5 heroes')
    expect(text).toContain('Frost Wyrm')
  })
})

describe('the Crossover Party tab', () => {
  const slots: Lineup['slots'] = [
    { key: 'qb', label: 'QB', classes: ['Mage'] },
    { key: 'te', label: 'TE', classes: ['Rogue'] }
  ]
  const lineup = (overrides: Partial<Lineup> = {}): Lineup => ({
    slots,
    lineup: { qb: 'q1', te: 't1' },
    autoSwap: false,
    champion: null,
    strategy: { championMultiplier: 1.25, mightyChampionMultiplier: 1.5, orderAndChaosBonus: 0.05, bulwarkFloor: 15 },
    roster: [
      { ...hero('q1'), restingNextWeek: false, projected: 20, kickoff: new Date(Date.now() - 60_000).toISOString(), locked: true },
      { ...hero('t1', { heroClass: 'Rogue' }), restingNextWeek: false, projected: 21, kickoff: new Date(Date.now() + 86_400_000).toISOString(), locked: false },
      { ...hero('q2'), restingNextWeek: false, projected: 15, kickoff: new Date(Date.now() + 86_400_000).toISOString(), locked: false },
      { ...hero('t2', { heroClass: 'Rogue' }), restingNextWeek: true, projected: 10, kickoff: null, locked: false },
      { ...hero('r1', { heroClass: 'Ranger' }), restingNextWeek: false, projected: 14, kickoff: new Date(Date.now() + 86_400_000).toISOString(), locked: false },
      { ...hero('w1', { heroClass: 'Warrior' }), restingNextWeek: false, projected: 12, kickoff: new Date(Date.now() + 86_400_000).toISOString(), locked: false }
    ],
    questParty: ['q1', 't1', 'q2', 't2', 'r1'],
    questPartySize: 5,
    quest: { encounter: { ...encounter, weak: [...encounter.weak] }, weakMultiplier: 1.25, resistMultiplier: 0.75, classMultipliers: { Mage: 1, Warrior: 1.45, Ranger: 1.4, Rogue: 2.05, Paladin: 2.35 } },
    nextWeek: 1,
    nextWeekAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    ...overrides
  })

  it('shows the encounter, both projections, and locks players whose game has kicked off', async () => {
    const api = fakeApi({ getLineup: vi.fn().mockResolvedValue(lineup()) })
    const { wrapper } = await mountLeague(PartyView, api, crossoverLeague())
    expect(wrapper.text()).toContain('Frost Wyrm')
    // Gridiron: 20 + 21 / 2.05 = 30.2; Quest: Mages and the Ranger are weak spots, Rogues resisted, the bye sits out.
    expect(wrapper.find('.projections').text()).toMatch(/30\s*Gridiron proj/)
    const questProjection = Math.round(20 * 1.25 + 21 * 0.75 + 15 * 1.25 + 14 * 1.25)
    expect(wrapper.find('.projections').text()).toContain(`${String(questProjection)} Quest proj`)
    const qb = wrapper.findAll('ol.list .row')[0]!
    expect(qb.attributes('disabled')).toBeDefined()
    expect(qb.text()).toContain('Kicked off · locked')
    expect(wrapper.text()).toContain('Bye this week')
  })

  it('saves a Quest party of exactly 5, and locked players can’t be toggled', async () => {
    const setQuestParty = vi.fn().mockResolvedValue(lineup({ questParty: ['q1', 't1', 'q2', 'r1', 'w1'] }))
    const api = fakeApi({ getLineup: vi.fn().mockResolvedValue(lineup()), setQuestParty })
    const { wrapper } = await mountLeague(PartyView, api, crossoverLeague())
    await wrapper.findAll('button').find(b => b.text() === 'Change party')!.trigger('click')
    const box = (name: string) => wrapper.findAll('label.choice').find(label => label.text().includes(name))!.find('input')
    expect(box('Hero q1').attributes('disabled')).toBeDefined()
    // Swap the resting tight end for the Warrior.
    await box('Hero t2').trigger('change')
    expect(wrapper.text()).toContain('4 of 5 chosen')
    const save = () => wrapper.findAll('button').find(b => b.text() === 'Save Quest party')!
    expect(save().attributes('disabled')).toBeDefined()
    await box('Hero w1').trigger('change')
    await save().trigger('click')
    await flushPromises()
    expect(setQuestParty).toHaveBeenCalledWith('l1', ['q1', 't1', 'q2', 'r1', 'w1'])
    expect(wrapper.text()).toContain('Quest party saved.')
  })

  it('names a Champion from the Quest party', async () => {
    const setChampion = vi.fn().mockResolvedValue(lineup({ champion: 't1' }))
    const api = fakeApi({ getLineup: vi.fn().mockResolvedValue(lineup()), setChampion })
    const { wrapper } = await mountLeague(PartyView, api, crossoverLeague())
    // The locked quarterback can't be named; the tight end yet to play can.
    expect(wrapper.find('button[aria-label="Name Hero q1 Champion"]').attributes('disabled')).toBeDefined()
    await wrapper.find('button[aria-label="Name Hero t1 Champion"]').trigger('click')
    await flushPromises()
    expect(setChampion).toHaveBeenCalledWith('l1', 't1')
  })

  it('leaves Classic leagues on the Classic screen', async () => {
    const api = fakeApi({ getLineup: vi.fn().mockResolvedValue({ ...lineup(), questParty: null, questPartySize: null, quest: null }) })
    const { wrapper } = await mountLeague(PartyView, api, detail({ status: 'active', parties: [party('a', true)] }))
    expect(wrapper.text()).toContain('Starting party')
    expect(wrapper.text()).not.toContain('Quest party')
  })
})

describe('the Crossover matchup', () => {
  const side = (partyId: string, name: string, overrides: Partial<MatchupSide> = {}): MatchupSide => ({
    partyId,
    name,
    crest,
    record: { wins: 1, losses: 1, draws: 0 },
    starters: [
      {
        slot: 'qb',
        label: 'QB',
        hero: { ...hero(`${partyId}-qb`), restingNextWeek: false, projected: 20, game: { kickoff: new Date().toISOString(), locked: true, final: true, points: 24.5 } }
      },
      {
        slot: 'te',
        label: 'TE',
        hero: {
          ...hero(`${partyId}-te`, { heroClass: 'Rogue' }),
          restingNextWeek: false,
          projected: 15,
          game: { kickoff: new Date(Date.now() + 86_400_000).toISOString(), locked: false, final: false, points: null }
        }
      }
    ],
    questParty: [{ ...hero(`${partyId}-q`, { heroClass: 'Ranger' }), restingNextWeek: false, projected: 18 }],
    champion: `${partyId}-q`,
    projectedTotal: 90,
    projectedGridiron: 110,
    liveTotal: 70,
    liveGridiron: 64,
    synergies: [],
    ...overrides
  })
  const matchup = (): Matchup => ({
    week: 1,
    resolvesAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    restingKnown: true,
    me: side('a', 'Party a'),
    opponent: side('b', 'Party b', { liveGridiron: 50, liveTotal: 81 }),
    monster: null,
    meetings: [],
    games: { final: 3, total: 14 },
    encounter: { ...encounter, weak: [...encounter.weak] }
  })
  const schedule: ScheduleWeek[] = [{ week: 1, nflWeek: 8, resolvesAt: null, matchups: [{ home: { partyId: 'a', name: 'Party a', crest }, away: { partyId: 'b', name: 'Party b', crest }, result: null }] }]

  it('shows the encounter, both boards live on game days, kickoffs and real points', async () => {
    const api = fakeApi({ getMatchup: vi.fn().mockResolvedValue(matchup()), getSchedule: vi.fn().mockResolvedValue(schedule) })
    const { wrapper } = await mountLeague(MatchupView, api, crossoverLeague())
    expect(wrapper.text()).toContain('Frost Wyrm')
    expect(wrapper.text()).toContain('Week 1 of 10')
    expect(wrapper.text()).toContain('NFL week 8')
    expect(wrapper.find('.when').text()).toContain('3 of 14 games final')
    const boards = wrapper.find('.boards').text()
    expect(boards).toMatch(/Gridiron\s*64\s*live\s*50\s*live/)
    expect(boards).toMatch(/Quest\s*70\s*live\s*81\s*live/)
    expect(wrapper.text()).toContain('24.5 pts')
    expect(wrapper.text()).toContain('Party a')
    // Weak spot shown for the Ranger in the Quest party.
    expect(wrapper.text()).toContain('weak spot')
  })

  it('shows projections before any game is final', async () => {
    const before = { ...matchup(), games: { final: 0, total: 14 } }
    const api = fakeApi({ getMatchup: vi.fn().mockResolvedValue(before), getSchedule: vi.fn().mockResolvedValue(schedule) })
    const { wrapper } = await mountLeague(MatchupView, api, crossoverLeague())
    expect(wrapper.find('.boards').text()).toMatch(/Gridiron\s*110\s*proj/)
  })
})

describe('Crossover results', () => {
  const line = (heroId: string, slot: string, overrides: object = {}) => ({
    heroId,
    name: `Hero ${heroId}`,
    heroClass: 'Mage' as const,
    slot,
    damage: 25,
    resting: false,
    swappedInto: null,
    crit: null,
    quest: false,
    points: 25,
    ...overrides
  })
  const result = (outcome: 'home' | 'away', gridironOutcome: 'home' | 'away'): WeekResult => ({
    week: 1,
    encounter: { ...encounter, weak: [...encounter.weak] },
    matchups: [
      {
        home: {
          partyId: 'a',
          name: 'Party a',
          crest,
          total: 90,
          gridiron: 101.3,
          champion: 'a2',
          synergies: [],
          heroes: [line('a1', 'qb', { points: 31.4 }), line('a2', 'Bench', { quest: true, damage: 40, crit: 'success' }), line('a3', 'Bench', { points: 12 })]
        },
        away: { partyId: 'b', name: 'Party b', crest, total: 80, gridiron: 120, champion: null, synergies: [], heroes: [line('b1', 'qb')] },
        monster: null,
        outcome,
        gridironOutcome
      }
    ]
  })

  it('calls a split a split and shows each board', async () => {
    setActivePinia(createPinia())
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
    const wrapper = mount(CrossoverResult, { props: { result: result('home', 'away'), myPartyId: 'a', leagueId: 'l1' }, global: { plugins: [router] } })
    expect(wrapper.find('.verdict').text()).toBe('SPLIT')
    expect(wrapper.find('.boards').text()).toMatch(/Gridiron.*101.3\s*–\s*120/s)
    expect(wrapper.find('.boards').text()).toMatch(/Quest.*90\s*–\s*80/s)
    expect(wrapper.text()).toContain('31.4 pts')
    // The Quest party member who only fought the encounter, with the Champion's crown and a natural 20.
    expect(wrapper.text()).toContain('Natural 20')
    expect(wrapper.find('.hero-cell.champion').text()).toContain('Hero a2')
    // In neither lineup: listed as sitting out.
    expect(wrapper.text()).toContain('Hero a3 · 12 pts')
  })

  it('calls a sweep a sweep', async () => {
    setActivePinia(createPinia())
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
    const wrapper = mount(CrossoverResult, { props: { result: result('home', 'home'), myPartyId: 'a', leagueId: 'l1' }, global: { plugins: [router] } })
    expect(wrapper.find('.verdict').text()).toBe('SWEEP')
  })

  it('marks each week in the season strip by boards won', () => {
    const week = (outcome: 'home' | 'away', gridironOutcome: 'home' | 'away' | 'draw'): ScheduleWeek => ({
      week: 1,
      resolvesAt: null,
      matchups: [
        {
          home: { partyId: 'a', name: 'Party a', crest },
          away: { partyId: 'b', name: 'Party b', crest },
          result: { homeTotal: 1, awayTotal: 2, outcome, monster: null, homeGridiron: 3, awayGridiron: 4, gridironOutcome }
        }
      ]
    })
    expect(mySeason([week('home', 'home')], 'a')[0]).toMatchObject({ outcome: 'win', boards: { mine: 2, theirs: 0 } })
    expect(mySeason([week('home', 'away')], 'b')[0]).toMatchObject({ outcome: 'draw', boards: { mine: 1, theirs: 1 } })
    expect(mySeason([week('away', 'draw')], 'a')[0]).toMatchObject({ outcome: 'loss', boards: { mine: 0.5, theirs: 1.5 } })
  })
})
