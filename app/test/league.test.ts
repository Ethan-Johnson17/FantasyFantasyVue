import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError, type ApiClient } from '../src/api/client'
import { apiKey } from '../src/api/inject'
import type { Hero, LeagueDetail, Lineup, Matchup, MatchupSide, Party, WeekResult } from '../src/api/types'
import { provideLeagueForTest } from '../src/league'
import BattleResultView from '../src/views/league/BattleResultView.vue'
import BattlesView from '../src/views/league/BattlesView.vue'
import DraftRecapView from '../src/views/league/DraftRecapView.vue'
import HeroDetailView from '../src/views/league/HeroDetailView.vue'
import HeroesView from '../src/views/league/HeroesView.vue'
import LeagueHomeView from '../src/views/league/LeagueHomeView.vue'
import MatchupView from '../src/views/league/MatchupView.vue'
import PartyView from '../src/views/league/PartyView.vue'
import { detail, fakeApi } from './helpers'

const crest = { emblem: 'crown', banner: 'crimson' } as const
const party = (id: string, isMine = false): Party => ({
  id,
  name: `Party ${id}`,
  crest,
  owner: { id: `owner-${id}`, displayName: `Owner ${id}` },
  isMine
})
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

/** Mounts a league tab with a fixed league in context. */
async function mountLeague(view: Component, api: ApiClient, league: LeagueDetail, path = '/', reload = vi.fn().mockResolvedValue(undefined)) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: view },
      { path: '/battles/:week', component: view },
      { path: '/heroes/:heroId', component: view },
      { path: '/:rest(.*)*', component: { template: '<div>elsewhere</div>' } }
    ]
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(view, {
    global: { plugins: [router], provide: { [apiKey as symbol]: api, ...provideLeagueForTest(league, reload) } }
  })
  await flushPromises()
  return { wrapper, router, reload }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('League tab', () => {
  it('lets the host schedule the draft once 2+ parties have joined', async () => {
    const api = fakeApi({ scheduleDraft: vi.fn().mockResolvedValue(detail()) })
    const solo = detail({ isHost: true, partyCount: 1, parties: [party('a', true)] })
    const { wrapper: lonely } = await mountLeague(LeagueHomeView, api, solo)
    const button = lonely.findAll('button').find(b => b.text() === 'Schedule draft')!
    expect(button.attributes('disabled')).toBeDefined()
    expect(lonely.text()).toContain('At least 2 parties are needed')

    const ready = detail({ isHost: true, partyCount: 2, parties: [party('a', true), party('b')] })
    const { wrapper, reload } = await mountLeague(LeagueHomeView, api, ready)
    await wrapper.find('#draft-at').setValue('2030-01-02T19:30')
    await wrapper.findAll('button').find(b => b.text() === 'Schedule draft')!.trigger('click')
    await flushPromises()
    expect(api.scheduleDraft).toHaveBeenCalledWith('l1', new Date('2030-01-02T19:30'))
    expect(reload).toHaveBeenCalled()
  })

  it('lets a member leave a forming league after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = fakeApi({ leaveLeague: vi.fn().mockResolvedValue(undefined) })
    const { wrapper, router } = await mountLeague(LeagueHomeView, api, detail({ parties: [party('a'), party('b', true)] }))
    await wrapper.findAll('button').find(b => b.text() === 'Leave league')!.trigger('click')
    await flushPromises()
    expect(api.leaveLeague).toHaveBeenCalledWith('l1')
    expect(router.currentRoute.value.fullPath).toBe('/leagues')
  })

  it('shows standings with my party highlighted and the monster battle', async () => {
    const league = detail({ status: 'active', resolvedWeeks: 2, weekOneAt: new Date().toISOString(), parties: [party('a', true), party('b'), party('c')] })
    const api = fakeApi({
      getStandings: vi.fn().mockResolvedValue([
        { partyId: 'a', name: 'Party a', crest, wins: 2, losses: 0, draws: 0, totalDamage: 210.4 },
        { partyId: 'b', name: 'Party b', crest, wins: 1, losses: 1, draws: 0, totalDamage: 190 },
        { partyId: 'c', name: 'Party c', crest, wins: 0, losses: 2, draws: 0, totalDamage: 150 }
      ]),
      getSchedule: vi.fn().mockResolvedValue([
        {
          week: 3,
          resolvesAt: null,
          matchups: [
            { home: { partyId: 'a', name: 'Party a', crest }, away: { partyId: 'b', name: 'Party b', crest }, result: null },
            { home: { partyId: 'c', name: 'Party c', crest }, away: null, result: null }
          ]
        }
      ])
    })
    const { wrapper } = await mountLeague(LeagueHomeView, api, league)
    const mine = wrapper.find('tr.mine')
    expect(mine.text()).toContain('Party a')
    expect(mine.text()).toContain('2–0')
    expect(mine.text()).toContain('210')
    expect(wrapper.text()).toContain('Dungeon monster')
  })
})

describe('Party tab', () => {
  const lineupData = (): Lineup => ({
    slots: [1, 2].map(n => ({ key: `slot${String(n)}`, label: `Hero ${String(n)}`, classes: ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin'] })),
    lineup: { slot1: 'h1', slot2: 'h2' },
    autoSwap: true,
    roster: [
      { ...hero('h1'), restingNextWeek: true },
      { ...hero('h2', { heroClass: 'Rogue' }), restingNextWeek: false },
      { ...hero('h3', { heroClass: 'Paladin', level: 7 }), restingNextWeek: false }
    ],
    champion: null,
    strategy: { championMultiplier: 1.25, mightyChampionMultiplier: 1.5, orderAndChaosBonus: 0.05, bulwarkFloor: 15 },
    nextWeek: 3,
    nextWeekAt: new Date(Date.now() + 3_600_000).toISOString()
  })

  it('swaps a starter for a bench hero in two taps and saves the lineup', async () => {
    const api = fakeApi({
      getLineup: vi.fn().mockResolvedValue(lineupData()),
      setLineup: vi.fn().mockImplementation((_id: string, lineup: Record<string, string>) => Promise.resolve({ ...lineupData(), lineup }))
    })
    const league = detail({ status: 'active', parties: [party('p1', true)] })
    const { wrapper } = await mountLeague(PartyView, api, league)

    expect(wrapper.text()).toContain('Resting this week · auto-swap ready')
    await wrapper.find('.starters .hero-row').trigger('click')
    await wrapper.find('.bench-hero').trigger('click')
    await wrapper.findAll('button').find(b => b.text() === 'Save lineup')!.trigger('click')
    await flushPromises()
    expect(api.setLineup).toHaveBeenCalledWith('l1', { slot1: 'h3', slot2: 'h2' })
    expect(wrapper.text()).toContain('Lineup saved.')
  })

  it('toggles auto-swap for my party', async () => {
    const api = fakeApi({ getLineup: vi.fn().mockResolvedValue(lineupData()), updateParty: vi.fn().mockResolvedValue(party('p1', true)) })
    const { wrapper } = await mountLeague(PartyView, api, detail({ status: 'active', parties: [party('p1', true)] }))
    await wrapper.find('.toggle input').setValue(false)
    await flushPromises()
    expect(api.updateParty).toHaveBeenCalledWith('p1', { autoSwap: false })
  })

  it('names a Champion with the crown, and taps again to withdraw', async () => {
    const api = fakeApi({
      getLineup: vi.fn().mockResolvedValue(lineupData()),
      setChampion: vi.fn().mockImplementation((_id: string, heroId: string | null) => Promise.resolve({ ...lineupData(), champion: heroId }))
    })
    const { wrapper } = await mountLeague(PartyView, api, detail({ status: 'active', parties: [party('p1', true)] }))
    expect(wrapper.find('.champion-card').text()).toContain('No Champion yet')
    expect(wrapper.find('.champion-card').text()).toContain('1.25×')

    await wrapper.find('button[aria-label="Name Hero h2 Champion"]').trigger('click')
    await flushPromises()
    expect(api.setChampion).toHaveBeenCalledWith('l1', 'h2')
    expect(wrapper.find('.champion-card').text()).toContain('Hero h2 leads your party')
    expect(wrapper.find('button[aria-label="Withdraw Hero h2 as Champion"]').attributes('aria-pressed')).toBe('true')

    await wrapper.find('button[aria-label="Withdraw Hero h2 as Champion"]').trigger('click')
    await flushPromises()
    expect(api.setChampion).toHaveBeenLastCalledWith('l1', null)
    expect(wrapper.text()).toContain('Champion withdrawn.')
  })

  it("can't name a Champion while lineup changes are unsaved", async () => {
    const api = fakeApi({ getLineup: vi.fn().mockResolvedValue(lineupData()) })
    const { wrapper } = await mountLeague(PartyView, api, detail({ status: 'active', parties: [party('p1', true)] }))
    await wrapper.find('.starters .hero-row').trigger('click')
    await wrapper.find('.bench-hero').trigger('click')
    expect(wrapper.find('button[aria-label="Name Hero h2 Champion"]').attributes('disabled')).toBeDefined()
  })

  it('previews synergies from the lineup on screen, leaving out resting heroes', async () => {
    const data = lineupData()
    data.roster = [
      { ...hero('h1', { traits: ['steadfast'] }), restingNextWeek: true },
      { ...hero('h2', { heroClass: 'Rogue', traits: ['wild'] }), restingNextWeek: false },
      { ...hero('h3', { heroClass: 'Paladin', level: 7, traits: ['steadfast'] }), restingNextWeek: false }
    ]
    const api = fakeApi({ getLineup: vi.fn().mockResolvedValue(data) })
    const { wrapper } = await mountLeague(PartyView, api, detail({ status: 'active', parties: [party('p1', true)] }))
    const orderAndChaos = () => wrapper.findAll('.synergy').find(row => row.text().includes('Order & Chaos'))!
    // The Steadfast starter is resting, so they won't fight.
    expect(orderAndChaos().classes()).not.toContain('active')
    expect(orderAndChaos().text()).toContain('+5%')

    await wrapper.find('.starters .hero-row').trigger('click')
    await wrapper.find('.bench-hero').trigger('click')
    expect(orderAndChaos().classes()).toContain('active')
    expect(wrapper.text()).toContain('Steadfast')
  })
})

describe('Battle result', () => {
  it('reads from my side even when I was the away party, and explains auto-swaps', async () => {
    const result: WeekResult = {
      week: 3,
      matchups: [
        {
          home: { partyId: 'b', name: 'Ember Wolves', crest, total: 98, champion: null, synergies: [], heroes: [{ heroId: 'x', name: 'Wolf', heroClass: 'Warrior', slot: 'slot1', damage: 98, resting: false, swappedInto: null }] },
          away: {
            partyId: 'a',
            name: 'Dragon Slayers',
            crest,
            total: 112,
            champion: 'h1',
            synergies: ['mightyChampion'],
            heroes: [
              { heroId: 'h1', name: 'Kael', heroClass: 'Rogue', slot: 'slot1', damage: 103, resting: false, swappedInto: null },
              { heroId: 'h2', name: 'Lyra', heroClass: 'Ranger', slot: 'slot2', damage: 0, resting: true, swappedInto: null },
              { heroId: 'h3', name: 'Freya', heroClass: 'Warrior', slot: 'Bench', damage: 9, resting: false, swappedInto: 'slot2' }
            ]
          },
          monster: null,
          outcome: 'away'
        }
      ]
    }
    const api = fakeApi({ getWeekResult: vi.fn().mockResolvedValue(result) })
    const { wrapper } = await mountLeague(BattleResultView, api, detail({ status: 'active', parties: [party('a', true), party('b')] }), '/battles/3')
    expect(api.getWeekResult).toHaveBeenCalledWith('l1', 3)
    expect(wrapper.find('.verdict').text()).toBe('VICTORY')
    expect(wrapper.find('.scores').text()).toMatch(/Dragon Slayers\s*112.*Ember Wolves\s*98/s)
    expect(wrapper.text()).toContain('Lyra was resting this week, so Freya stepped in from the bench at half damage.')
    expect(wrapper.find('.champion-tag').exists()).toBe(true)
    expect(wrapper.findAll('.fighter')[0]!.text()).toContain('♛ Kael')
    expect(wrapper.find('.synergies').text()).toContain('Mighty Champion')
  })

  it('explains a missing or resting Champion', async () => {
    const side = (champion: string | null) => ({
      partyId: 'a',
      name: 'Dragon Slayers',
      crest,
      total: 50,
      champion,
      synergies: [],
      heroes: [{ heroId: 'h2', name: 'Lyra', heroClass: 'Ranger' as const, slot: 'slot1', damage: 0, resting: true, swappedInto: null }]
    })
    const result = (champion: string | null): WeekResult => ({
      week: 2,
      matchups: [{ home: side(champion), away: null, monster: { name: 'Grimjaw', total: 60 }, outcome: 'away' }]
    })
    const league = detail({ status: 'active', parties: [party('a', true)] })

    const none = await mountLeague(BattleResultView, fakeApi({ getWeekResult: vi.fn().mockResolvedValue(result(null)) }), league, '/battles/2')
    expect(none.wrapper.text()).toContain('No Champion was named for this battle.')
    const resting = await mountLeague(BattleResultView, fakeApi({ getWeekResult: vi.fn().mockResolvedValue(result('h2')) }), league, '/battles/2')
    expect(resting.wrapper.text()).toContain('Lyra was named Champion but was resting, so the bonus was lost.')
  })
})

describe('Heroes tab', () => {
  it('builds and saves a ranking before the draft', async () => {
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue([hero('h1', { level: 9 }), hero('h2', { level: 3 }), hero('h3', { level: null, levelRange: { min: 1, max: 4 } })]),
      getRankings: vi.fn().mockResolvedValue({ heroIds: ['h2'] }),
      setRankings: vi.fn().mockImplementation((_id: string, heroIds: string[]) => Promise.resolve({ heroIds }))
    })
    const { wrapper } = await mountLeague(HeroesView, api, detail({ status: 'drafting', draftAt: new Date(Date.now() + 86_400_000).toISOString() }))

    await wrapper.find('button[aria-label="Rank Hero h1"]').trigger('click')
    await wrapper.find('button[aria-label="Move Hero h1 up"]').trigger('click')
    await wrapper.find('button[aria-label="Rank Hero h3"]').trigger('click')
    await wrapper.find('button[aria-label="Remove Hero h2 from your ranking"]').trigger('click')
    expect(wrapper.text()).toContain('Lv 1–4')
    await wrapper.findAll('button').find(b => b.text() === 'Save ranking')!.trigger('click')
    await flushPromises()
    expect(api.setRankings).toHaveBeenCalledWith('l1', ['h1', 'h3'])
    expect(wrapper.text()).toContain('Ranking saved.')
  })
})

describe('Free agency', () => {
  const myLineup = (): Lineup => ({
    slots: [{ key: 'slot1', label: 'Hero 1', classes: ['Mage', 'Warrior', 'Ranger', 'Rogue', 'Paladin'] }],
    lineup: { slot1: 'h1' },
    autoSwap: true,
    champion: 'h1',
    strategy: { championMultiplier: 1.25, mightyChampionMultiplier: 1.5, orderAndChaosBonus: 0.05, bulwarkFloor: 15 },
    roster: [
      { ...hero('h1', { partyId: 'p1' }), restingNextWeek: false },
      { ...hero('h2', { partyId: 'p1', heroClass: 'Rogue' }), restingNextWeek: false }
    ],
    nextWeek: 2,
    nextWeekAt: new Date(Date.now() + 3_600_000).toISOString()
  })
  const pool = () => [hero('h1', { partyId: 'p1' }), hero('h2', { partyId: 'p1' }), hero('f1', { traits: ['wild'] })]
  const league = () => detail({ status: 'active', parties: [party('p1', true)] })

  it('claims a free agent by choosing a hero to drop', async () => {
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValueOnce(pool()).mockResolvedValue([hero('h1', { partyId: 'p1' }), hero('h2'), hero('f1', { partyId: 'p1' })]),
      getLineup: vi.fn().mockResolvedValue(myLineup()),
      claimHero: vi.fn().mockResolvedValue(myLineup()),
      listMoves: vi.fn().mockResolvedValue([])
    })
    const { wrapper } = await mountLeague(HeroesView, api, league())
    expect(wrapper.text()).toContain('Free agents')
    expect(wrapper.findAll('button').filter(b => b.text() === 'Claim')).toHaveLength(1)

    await wrapper.find('button[aria-label="Claim Hero f1"]').trigger('click')
    await flushPromises()
    const panel = wrapper.find('[role="dialog"]')
    expect(panel.text()).toContain('Claim Hero f1')
    // The Champion and starters are labeled, and nothing is dropped until a hero is chosen.
    expect(panel.text()).toContain('starting · ♛ Champion')
    const confirm = () => wrapper.findAll('[role="dialog"] button').find(b => b.text().startsWith('Drop') || b.text() === 'Choose a hero')!
    expect(confirm().attributes('disabled')).toBeDefined()

    await panel.find('input[value="h2"]').setValue(true)
    expect(confirm().text()).toBe('Drop Hero h2')
    await confirm().trigger('click')
    await flushPromises()
    expect(api.claimHero).toHaveBeenCalledWith('l1', 'f1', 'h2')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Hero f1 joined your party.')
    expect(api.listHeroes).toHaveBeenCalledTimes(2)
  })

  it('explains a lost race and refreshes the pool', async () => {
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue(pool()),
      getLineup: vi.fn().mockResolvedValue(myLineup()),
      claimHero: vi.fn().mockRejectedValue(new ApiError(409, 'That hero is no longer a free agent')),
      listMoves: vi.fn().mockResolvedValue([])
    })
    const { wrapper } = await mountLeague(HeroesView, api, league())
    await wrapper.find('button[aria-label="Claim Hero f1"]').trigger('click')
    await flushPromises()
    await wrapper.find('[role="dialog"] input[value="h2"]').setValue(true)
    await wrapper.findAll('[role="dialog"] button').find(b => b.text() === 'Drop Hero h2')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').text()).toContain('That hero is no longer a free agent')
    expect(api.listHeroes).toHaveBeenCalledTimes(2)
  })

  it('lists recent moves, and hides Claim from non-members', async () => {
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue(pool()),
      listMoves: vi.fn().mockResolvedValue([
        {
          kind: 'claim',
          party: { partyId: 'p2', name: 'Ember Wolves' },
          added: { heroId: 'x', name: 'Freya', heroClass: 'Warrior' },
          dropped: { heroId: 'y', name: 'Lyra', heroClass: 'Ranger' },
          effectiveWeek: 3,
          at: new Date().toISOString()
        }
      ])
    })
    const { wrapper } = await mountLeague(HeroesView, api, detail({ status: 'active', parties: [party('p2')] }))
    expect(wrapper.find('.moves').text()).toContain('Ember Wolves claimed Freya, dropped Lyra')
    expect(wrapper.find('.moves').text()).toContain('from battle 3')
    expect(wrapper.find('button[aria-label="Claim Hero f1"]').exists()).toBe(false)
  })
})

describe('Matchup', () => {
  const side = (partyId: string, name: string, heroes: Hero[], champion: string | null = null): MatchupSide => ({
    partyId,
    name,
    crest,
    record: { wins: 2, losses: 1, draws: 0 },
    starters: heroes.map((h, index) => ({ slot: `slot${String(index + 1)}`, label: `Hero ${String(index + 1)}`, hero: { ...h, restingNextWeek: h.id === 'm2' } })),
    champion,
    synergies: champion ? ['mightyChampion'] : []
  })
  const base = (): Matchup => ({
    week: 4,
    resolvesAt: new Date(Date.now() + 3_600_000).toISOString(),
    me: side('a', 'Dragon Slayers', [hero('m1', { name: 'Kael', traits: ['mighty'] }), hero('m2', { name: 'Lyra' })], 'm1'),
    opponent: side('b', 'Ember Wolves', [hero('t1', { name: 'Wolf' }), hero('t2', { name: 'Fang' })]),
    monster: null,
    meetings: [
      { week: 1, myTotal: 112.4, theirTotal: 98, outcome: 'win' },
      { week: 3, myTotal: 90, theirTotal: 101, outcome: 'loss' }
    ]
  })
  const league = () => detail({ status: 'active', resolvedWeeks: 3, parties: [party('a', true), party('b')] })

  it('puts my lineup beside my opponent’s, with Champions, resting heroes, and the series', async () => {
    const api = fakeApi({ getMatchup: vi.fn().mockResolvedValue(base()) })
    const { wrapper } = await mountLeague(MatchupView, api, league())
    expect(api.getMatchup).toHaveBeenCalledWith('l1')
    expect(wrapper.find('.scoreboard').text()).toMatch(/Dragon Slayers\s*2–1.*Ember Wolves\s*2–1/s)
    expect(wrapper.find('.series').text()).toBe('Tied 1–1')
    const rows = wrapper.findAll('.lineup-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toMatch(/♛ Kael.*Wolf/s)
    expect(rows[0]!.find('.hero-cell').classes()).toContain('champion')
    expect(rows[1]!.text()).toContain('Lyra')
    expect(rows[1]!.text()).toContain('resting')
    expect(wrapper.find('.synergies').text()).toContain('Mighty Champion')
    const meetings = wrapper.findAll('.meeting')
    expect(meetings.map(m => m.text())).toEqual([expect.stringMatching(/Week 1\s*Victory\s*112–98/), expect.stringMatching(/Week 3\s*Defeat\s*90–101/)])
  })

  it('shows the dungeon monster when I have no opponent', async () => {
    const api = fakeApi({ getMatchup: vi.fn().mockResolvedValue({ ...base(), opponent: null, monster: { name: 'Grimjaw' }, meetings: [] }) })
    const { wrapper } = await mountLeague(MatchupView, api, league())
    expect(wrapper.find('.scoreboard').text()).toContain('Grimjaw')
    expect(wrapper.find('.series').exists()).toBe(false)
    expect(wrapper.find('.lineups').classes()).toContain('solo')
    expect(wrapper.text()).toContain("Grimjaw fights as strong as the league's average party this week.")
  })

  it('is reached from the next battle on the Battles tab', async () => {
    const week = (n: number, result: ScheduleResult | null) => ({
      week: n,
      resolvesAt: null,
      matchups: [{ home: { partyId: 'a', name: 'Party a', crest }, away: { partyId: 'b', name: 'Party b', crest }, result }]
    })
    const api = fakeApi({
      getSchedule: vi.fn().mockResolvedValue([week(1, { homeTotal: 100, awayTotal: 90, outcome: 'home', monster: null }), week(2, null), week(3, null)])
    })
    const { wrapper } = await mountLeague(BattlesView, api, detail({ status: 'active', resolvedWeeks: 1, parties: [party('a', true), party('b')] }))
    const links = wrapper.findAll('a.week').map(link => link.attributes('href'))
    expect(links).toEqual(['/leagues/l1/battles/1', '/leagues/l1/battles/upcoming'])
    expect(wrapper.find('.week.next').text()).toContain('Matchup ›')
  })
})

type ScheduleResult = { homeTotal: number; awayTotal: number; outcome: 'home' | 'away' | 'draw'; monster: string | null }

describe('Draft recap', () => {
  it("lists my picks and tags the ones the draft made for me", async () => {
    const league = detail({
      status: 'active',
      parties: [party('a', true), party('b')],
      draft: {
        order: ['b', 'a'],
        picks: [
          { round: 1, overall: 1, partyId: 'b', heroId: 'hx' },
          { round: 1, overall: 2, partyId: 'a', heroId: 'h1' },
          { round: 2, overall: 3, partyId: 'a', heroId: 'h2' }
        ]
      }
    })
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue([hero('h1'), hero('h2', { heroClass: 'Paladin' }), hero('hx')]),
      getRankings: vi.fn().mockResolvedValue({ heroIds: ['h1'] })
    })
    const { wrapper } = await mountLeague(DraftRecapView, api, league)
    expect(wrapper.text()).toContain('You picked 2nd · 1 of 2 picks came from your ranking')
    const picks = wrapper.findAll('.pick')
    expect(picks).toHaveLength(2)
    expect(picks[1]!.text()).toContain('auto')
    expect(picks[0]!.text()).not.toContain('auto')
  })
})

describe('Hero detail', () => {
  it('averages only the weeks the hero actually fought', async () => {
    const api = fakeApi({
      getHero: vi.fn().mockResolvedValue({
        hero: hero('h1', { heroClass: 'Rogue', skill: 'Sneak', partyId: 'a', traits: ['wild', 'mighty'] }),
        history: [
          { week: 1, slot: 'slot1', damage: 14, resting: false, swappedInto: null },
          { week: 2, slot: 'slot1', damage: 0, resting: true, swappedInto: null },
          { week: 3, slot: 'slot1', damage: 31, resting: false, swappedInto: null }
        ]
      })
    })
    const { wrapper } = await mountLeague(HeroDetailView, api, detail({ status: 'active', parties: [party('a', true)] }), '/heroes/h1')
    expect(api.getHero).toHaveBeenCalledWith('l1', 'h1')
    expect(wrapper.text()).toContain('Average 23')
    expect(wrapper.findAll('.chip').map(chip => chip.text())).toEqual(['Level 5', 'Rogue', 'Wild', 'Mighty', 'Party a'])
    expect(wrapper.find('.traits').text()).toContain('Swings between quiet battles and huge ones.')
    // The hero's own Wild trait replaces the class's usual temperament text.
    expect(wrapper.text()).not.toContain('Rogues strike from the shadows')
    expect(wrapper.find('[role="img"]').attributes('aria-label')).toContain('week 2, resting')
  })
})
