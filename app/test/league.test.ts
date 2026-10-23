import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError, type ApiClient } from '../src/api/client'
import { apiKey } from '../src/api/inject'
import type { ChatMessage, ChatPage, Finale, Hero, LeagueDetail, Lineup, Matchup, MatchupSide, Party, Standing, WeekResult } from '../src/api/types'
import { CHAT_POLL_MS } from '../src/chat'
import { projectedTotal } from '../src/heroes'
import { provideLeagueForTest } from '../src/league'
import ChatView from '../src/views/league/ChatView.vue'
import DraftRecapView from '../src/views/league/DraftRecapView.vue'
import FinaleView from '../src/views/league/FinaleView.vue'
import HeroDetailView from '../src/views/league/HeroDetailView.vue'
import HeroesView from '../src/views/league/HeroesView.vue'
import LeagueHomeView from '../src/views/league/LeagueHomeView.vue'
import LeagueLayout from '../src/views/league/LeagueLayout.vue'
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
      { path: '/matchup/:week?', component: view },
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
      { ...hero('h1'), restingNextWeek: true, projected: 15 },
      { ...hero('h2', { heroClass: 'Rogue' }), restingNextWeek: false, projected: 20 },
      { ...hero('h3', { heroClass: 'Paladin', level: 7 }), restingNextWeek: false, projected: 25 }
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

  it('links every hero, starters and bench, to their stats page', async () => {
    const api = fakeApi({ getLineup: vi.fn().mockResolvedValue(lineupData()) })
    const { wrapper } = await mountLeague(PartyView, api, detail({ status: 'active', parties: [party('p1', true)] }))
    const starterLinks = wrapper.findAll('.starters a.details').map(a => [a.attributes('aria-label'), a.attributes('href')])
    expect(starterLinks).toEqual([
      ['About Hero h1', '/leagues/l1/heroes/h1'],
      ['About Hero h2', '/leagues/l1/heroes/h2']
    ])
    expect(wrapper.find('.bench a.details').attributes('href')).toBe('/leagues/l1/heroes/h3')
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
      { ...hero('h1', { traits: ['steadfast'] }), restingNextWeek: true, projected: 15 },
      { ...hero('h2', { heroClass: 'Rogue', traits: ['wild'] }), restingNextWeek: false, projected: 20 },
      { ...hero('h3', { heroClass: 'Paladin', level: 7, traits: ['steadfast'] }), restingNextWeek: false, projected: 25 }
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

  it('projects each hero and the lineup on screen, leaving out resting starters', async () => {
    const api = fakeApi({ getLineup: vi.fn().mockResolvedValue(lineupData()) })
    const { wrapper } = await mountLeague(PartyView, api, detail({ status: 'active', parties: [party('p1', true)] }))
    expect(wrapper.find('.projected-total').text()).toBe('Projected 20')
    expect(wrapper.findAll('.starters .proj').map(p => p.text())).toEqual(['Resting', 'Proj 20'])
    expect(wrapper.find('.bench').text()).toContain('proj 25')

    await wrapper.find('.starters .hero-row').trigger('click')
    await wrapper.find('.bench-hero').trigger('click')
    expect(wrapper.find('.projected-total').text()).toBe('Projected 45')
  })

  it('projects totals with the same Champion and synergy math as battles', () => {
    const rules = lineupData().strategy
    const fighters = [
      { id: 'a', traits: [], projected: 20 },
      { id: 'b', traits: [], projected: 10 }
    ]
    expect(projectedTotal(fighters, null, rules)).toBe(30)
    expect(projectedTotal(fighters, 'a', rules)).toBe(35) // 20 x 1.25 + 10
    expect(projectedTotal([{ ...fighters[0]!, traits: ['mighty'] }, fighters[1]!], 'a', rules)).toBe(40) // 20 x 1.5 + 10
    // Bulwark lifts a Wild Champion to the floor (4 x 1.25 -> 15); Wild + Steadfast adds Order & Chaos.
    const bulwark = [
      { id: 'a', traits: ['wild' as const], projected: 4 },
      { id: 'b', traits: ['steadfast' as const], projected: 10 }
    ]
    expect(projectedTotal(bulwark, 'a', rules)).toBe(26) // (15 + 10) x 1.05 = 26.25
  })
})

describe('Battle result', () => {
  it('reads from my side even when I was the away party, and explains auto-swaps', async () => {
    const result: WeekResult = {
      week: 3,
      matchups: [
        {
          home: { partyId: 'b', name: 'Ember Wolves', crest, total: 98, champion: null, synergies: [], heroes: [{ heroId: 'x', name: 'Wolf', heroClass: 'Warrior', slot: 'slot1', damage: 98, resting: false, swappedInto: null, crit: null }] },
          away: {
            partyId: 'a',
            name: 'Dragon Slayers',
            crest,
            total: 112,
            champion: 'h1',
            synergies: ['mightyChampion'],
            heroes: [
              { heroId: 'h1', name: 'Kael', heroClass: 'Rogue', slot: 'slot1', damage: 103, resting: false, swappedInto: null, crit: null },
              { heroId: 'h2', name: 'Lyra', heroClass: 'Ranger', slot: 'slot2', damage: 0, resting: true, swappedInto: null, crit: null },
              { heroId: 'h3', name: 'Freya', heroClass: 'Warrior', slot: 'Bench', damage: 9, resting: false, swappedInto: 'slot2', crit: null },
              { heroId: 'h4', name: 'Mira', heroClass: 'Mage', slot: 'Bench', damage: 14, resting: false, swappedInto: null, crit: null }
            ]
          },
          monster: null,
          outcome: 'away'
        }
      ]
    }
    const api = fakeApi({ getWeekResult: vi.fn().mockResolvedValue(result) })
    const { wrapper } = await mountLeague(MatchupView, api, detail({ status: 'active', resolvedWeeks: 3, parties: [party('a', true), party('b')] }), '/matchup/3')
    expect(api.getWeekResult).toHaveBeenCalledWith('l1', 3)
    expect(api.getMatchup).not.toHaveBeenCalled()
    expect(wrapper.find('.verdict').text()).toBe('VICTORY')
    expect(wrapper.find('.scoreboard').text()).toMatch(/Dragon Slayers\s*112.*Ember Wolves\s*98/s)
    // Paired by slot, like the preview: my hero beside the opponent's, by name.
    const rows = wrapper.findAll('.lineup-row')
    expect(rows[0]!.text()).toMatch(/♛ Kael\s*103.*Wolf\s*98/s)
    // Lyra rested; Freya fought her slot from the bench.
    expect(rows[1]!.text()).toContain('Freya')
    expect(rows[1]!.text()).toContain('↺ in for Lyra · half damage')
    expect(wrapper.find('.synergies').text()).toContain('Mighty Champion')
    // The bench shows what didn't count: Mira sat out; Freya fought, so she's in the lineup instead.
    const bench = wrapper.find('.lineups.bench')
    expect(bench.text()).toMatch(/Mira\s*14/)
    expect(bench.text()).not.toContain('Freya')
    expect(wrapper.text()).toContain("Didn't count toward the total")
  })

  it('explains a missing or resting Champion', async () => {
    const side = (champion: string | null) => ({
      partyId: 'a',
      name: 'Dragon Slayers',
      crest,
      total: 50,
      champion,
      synergies: [],
      heroes: [{ heroId: 'h2', name: 'Lyra', heroClass: 'Ranger' as const, slot: 'slot1', damage: 0, resting: true, swappedInto: null, crit: null }]
    })
    const result = (champion: string | null): WeekResult => ({
      week: 2,
      matchups: [{ home: side(champion), away: null, monster: { name: 'Grimjaw', total: 60 }, outcome: 'away' }]
    })
    const league = detail({ status: 'active', resolvedWeeks: 2, parties: [party('a', true)] })

    const none = await mountLeague(MatchupView, fakeApi({ getWeekResult: vi.fn().mockResolvedValue(result(null)) }), league, '/matchup/2')
    expect(none.wrapper.text()).toContain('No Champion was named for this battle.')
    const resting = await mountLeague(MatchupView, fakeApi({ getWeekResult: vi.fn().mockResolvedValue(result('h2')) }), league, '/matchup/2')
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

describe('Draft prep and form', () => {
  const pool = () => [
    hero('m1', { level: 4 }),
    hero('m2', { level: 9 }),
    hero('w1', { heroClass: 'Warrior', level: 7 }),
    hero('w2', { heroClass: 'Warrior', level: null, levelRange: { min: 1, max: 4 } })
  ]
  const drafting = () => detail({ status: 'drafting', draftAt: new Date(Date.now() + 86_400_000).toISOString() })

  it('ranks every unranked hero by Level in one tap, after the ones already ranked', async () => {
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue(pool()),
      getRankings: vi.fn().mockResolvedValue({ heroIds: ['w2'] }),
      setRankings: vi.fn().mockImplementation((_id: string, heroIds: string[]) => Promise.resolve({ heroIds }))
    })
    const { wrapper } = await mountLeague(HeroesView, api, drafting())
    const rankAll = wrapper.find('.rank-all')
    expect(rankAll.text()).toBe('Rank all 3 by Level')
    await rankAll.trigger('click')
    expect(wrapper.find('.rank-all').exists()).toBe(false)
    await wrapper.findAll('button').find(b => b.text() === 'Save ranking')!.trigger('click')
    await flushPromises()
    expect(api.setRankings).toHaveBeenCalledWith('l1', ['w2', 'm2', 'w1', 'm1'])
  })

  it('ranks or clears one class at a time when filtered', async () => {
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue(pool()),
      getRankings: vi.fn().mockResolvedValue({ heroIds: ['m1', 'w1'] }),
      setRankings: vi.fn().mockImplementation((_id: string, heroIds: string[]) => Promise.resolve({ heroIds }))
    })
    const { wrapper } = await mountLeague(HeroesView, api, drafting())
    await wrapper.findAll('.filters .chip').find(c => c.text() === 'Mage')!.trigger('click')
    expect(wrapper.find('.rank-all').text()).toBe('Rank all 1 Mage by Level')

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await wrapper.findAll('button').find(b => b.text() === 'Clear Mages')!.trigger('click')
    expect(confirm).toHaveBeenCalledWith('Clear every Mage in your ranking? Nothing changes until you save.')
    await wrapper.findAll('button').find(b => b.text() === 'Save ranking')!.trigger('click')
    await flushPromises()
    expect(api.setRankings).toHaveBeenCalledWith('l1', ['w1'])
  })

  it('keeps the ranking when clearing is cancelled', async () => {
    const api = fakeApi({ listHeroes: vi.fn().mockResolvedValue(pool()), getRankings: vi.fn().mockResolvedValue({ heroIds: ['m1'] }) })
    const { wrapper } = await mountLeague(HeroesView, api, drafting())
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper.findAll('button').find(b => b.text() === 'Clear')!.trigger('click')
    expect(wrapper.findAll('button').some(b => b.text() === 'Save ranking')).toBe(false)
  })

  it('shows recent form and sorts free agents by it once battles are played', async () => {
    const form = (recent: number | null, average: number | null, played: number, playingLike: number | null = null) => ({ recent, average, played, playingLike, projected: average ?? 10 })
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue([
        hero('f1', { level: 9, form: form(12, 15, 4) }),
        hero('f2', { level: 3, form: form(27, 20, 4) }),
        hero('f3', { level: 5, form: form(null, null, 0) }),
        hero('f4', { level: 2, form: form(9, 9, 1) }),
        hero('r1', { level: null, levelRange: { min: 1, max: 7 }, form: form(14, 16, 5, 7) })
      ]),
      listMoves: vi.fn().mockResolvedValue([])
    })
    const { wrapper } = await mountLeague(HeroesView, api, detail({ status: 'active', resolvedWeeks: 4, parties: [party('p1', true)] }))
    const names = () => wrapper.findAll('.list')[0]!.findAll('.hero-name').map(n => n.text())
    expect(names()).toEqual(['Hero f2', 'Hero r1', 'Hero f1', 'Hero f4', 'Hero f3'])
    expect(wrapper.findAll('.list')[0]!.findAll('.form').map(f => f.text())).toEqual([
      'Proj 20 · Last 3: 27 · season 20',
      'Proj 16 · Playing like Lv 7 · Last 3: 14 · season 16',
      'Proj 15 · Last 3: 12 · season 15',
      'Proj 9 · Avg 9 · 1 battle',
      'Proj 10 · No battles fought yet'
    ])

    await wrapper.findAll('.sort .chip').find(c => c.text() === 'Level')!.trigger('click')
    expect(names()).toEqual(['Hero f1', 'Hero f3', 'Hero r1', 'Hero f2', 'Hero f4'])
  })

  it('has no form or sort before the first battle, only the projection', async () => {
    const api = fakeApi({ listHeroes: vi.fn().mockResolvedValue([hero('f1', { form: { recent: null, average: null, played: 0, playingLike: null, projected: 18 } })]), listMoves: vi.fn().mockResolvedValue([]) })
    const { wrapper } = await mountLeague(HeroesView, api, detail({ status: 'active', resolvedWeeks: 0, parties: [party('p1', true)] }))
    expect(wrapper.find('.sort').exists()).toBe(false)
    expect(wrapper.find('.form').text()).toBe('Proj 18')
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
      { ...hero('h1', { partyId: 'p1' }), restingNextWeek: false, projected: 15 },
      { ...hero('h2', { partyId: 'p1', heroClass: 'Rogue' }), restingNextWeek: false, projected: 20 }
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
    starters: heroes.map((h, index) => ({ slot: `slot${String(index + 1)}`, label: `Hero ${String(index + 1)}`, hero: { ...h, restingNextWeek: h.id === 'm2', projected: 20 + index } })),
    champion,
    projectedTotal: partyId === 'a' ? 30 : 41,
    synergies: champion ? ['mightyChampion'] : []
  })
  const base = (): Matchup => ({
    week: 4,
    resolvesAt: new Date(Date.now() + 3_600_000).toISOString(),
    restingKnown: true,
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
    expect(api.getMatchup).toHaveBeenCalledWith('l1', 4)
    expect(wrapper.find('.scoreboard').text()).toMatch(/Dragon Slayers\s*2–1.*Ember Wolves\s*2–1/s)
    expect(wrapper.find('.series').text()).toBe('Tied 1–1')
    const rows = wrapper.findAll('.lineup-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toMatch(/♛ Kael.*Wolf/s)
    expect(rows[0]!.find('.hero-cell').classes()).toContain('champion')
    expect(rows[1]!.text()).toContain('Lyra')
    expect(rows[1]!.text()).toContain('resting')
    expect(wrapper.find('.scoreboard').text()).toMatch(/Proj 30.*Proj 41/s)
    expect(rows[0]!.text()).toMatch(/proj 20.*proj 20/s)
    expect(rows[1]!.find('.hero-cell').text()).not.toContain('proj')
    expect(wrapper.find('.synergies').text()).toContain('Mighty Champion')
    const meetings = wrapper.findAll('.meeting')
    expect(meetings.map(m => m.text())).toEqual([expect.stringMatching(/Week 1\s*Victory\s*112–98/), expect.stringMatching(/Week 3\s*Defeat\s*90–101/)])
  })

  it('steps between weeks: results for played weeks, previews for upcoming ones', async () => {
    const played: WeekResult = {
      week: 3,
      matchups: [
        {
          home: { partyId: 'a', name: 'Dragon Slayers', crest, total: 90, champion: null, synergies: [], heroes: [] },
          away: { partyId: 'b', name: 'Ember Wolves', crest, total: 101, champion: null, synergies: [], heroes: [] },
          monster: null,
          outcome: 'away'
        }
      ]
    }
    const api = fakeApi({
      getMatchup: vi.fn().mockImplementation((_id: string, week: number) => Promise.resolve({ ...base(), week, restingKnown: week === 4 })),
      getWeekResult: vi.fn().mockResolvedValue(played)
    })
    const { wrapper, router } = await mountLeague(MatchupView, api, league(), '/matchup')
    // Opens on the next battle.
    expect(wrapper.find('.week-number').text()).toBe('Week 4 of 14')
    expect(wrapper.find('.week-state').text()).toBe('Next battle')
    expect(wrapper.findAll('.weeks a').map(a => a.attributes('href'))).toEqual(['/leagues/l1/matchup/3', '/leagues/l1/matchup/5'])

    await router.push('/matchup/3')
    await flushPromises()
    expect(api.getWeekResult).toHaveBeenCalledWith('l1', 3)
    expect(wrapper.find('.week-state').text()).toBe('Played')
    expect(wrapper.find('.verdict').text()).toBe('DEFEAT')

    await router.push('/matchup/6')
    await flushPromises()
    expect(api.getMatchup).toHaveBeenLastCalledWith('l1', 6)
    expect(wrapper.find('.week-state').text()).toBe('Upcoming')
    expect(wrapper.text()).toContain('Who rests shows once this is the next battle.')

    await router.push('/matchup/14')
    await flushPromises()
    expect(wrapper.find('.weeks .step.disabled').exists()).toBe(true)
  })

  it('waits for the draft before showing matchups', async () => {
    const api = fakeApi()
    const { wrapper } = await mountLeague(MatchupView, api, detail({ status: 'drafting' }), '/matchup')
    expect(wrapper.text()).toContain('Matchups appear once the draft has run.')
    expect(api.getMatchup).not.toHaveBeenCalled()
  })

  it('shows the dungeon monster when I have no opponent', async () => {
    const api = fakeApi({ getMatchup: vi.fn().mockResolvedValue({ ...base(), opponent: null, monster: { name: 'Grimjaw' }, meetings: [] }) })
    const { wrapper } = await mountLeague(MatchupView, api, league())
    expect(wrapper.find('.scoreboard').text()).toContain('Grimjaw')
    expect(wrapper.find('.series').exists()).toBe(false)
    expect(wrapper.find('.lineups').classes()).toContain('solo')
    expect(wrapper.text()).toContain("Grimjaw fights as strong as the league's average party this week.")
  })

  it('shows my season as a strip of weeks: results, the next battle, and monster weeks', async () => {
    const week = (n: number, result: ScheduleResult | null, monster = false) => ({
      week: n,
      resolvesAt: null,
      matchups: [{ home: { partyId: 'a', name: 'Party a', crest }, away: monster ? null : { partyId: 'b', name: 'Party b', crest }, result }]
    })
    const api = fakeApi({
      getSchedule: vi.fn().mockResolvedValue([
        week(1, { homeTotal: 100, awayTotal: 90, outcome: 'home', monster: null }),
        week(2, { homeTotal: 80, awayTotal: 95, outcome: 'away', monster: null }),
        week(3, null),
        week(4, null, true)
      ]),
      getMatchup: vi.fn().mockResolvedValue(base()),
      getWeekResult: vi.fn().mockResolvedValue({ week: 1, matchups: [] })
    })
    const { wrapper } = await mountLeague(MatchupView, api, detail({ status: 'active', resolvedWeeks: 2, parties: [party('a', true), party('b')] }), '/matchup')
    const chips = wrapper.findAll('.strip .chip')
    expect(chips.map(chip => chip.attributes('href'))).toEqual(['/leagues/l1/matchup/1', '/leagues/l1/matchup/2', '/leagues/l1/matchup/3', '/leagues/l1/matchup/4'])
    expect(chips.map(chip => chip.text())).toEqual(['1W', '2L', '3•', '4☠'])
    expect(chips[0]!.classes()).toContain('win')
    expect(chips[1]!.classes()).toContain('loss')
    expect(chips[2]!.classes()).toEqual(expect.arrayContaining(['next', 'selected']))
    expect(chips[2]!.attributes('aria-current')).toBe('page')
    expect(chips[0]!.attributes('aria-label')).toBe('Week 1: win vs Party b, 100 to 90')
  })
})

type ScheduleResult = { homeTotal: number; awayTotal: number; outcome: 'home' | 'away' | 'draw'; monster: string | null }

describe('League navigation', () => {
  async function mountLayout(path: string, unread: number) {
    setActivePinia(createPinia())
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/leagues/:id', component: LeagueLayout, children: [{ path: ':rest(.*)*', component: { template: '<div />' } }] }]
    })
    await router.push(path)
    await router.isReady()
    const api = fakeApi({
      getLeague: vi.fn().mockResolvedValue(detail({ status: 'active', parties: [party('a', true)] })),
      getChatUnread: vi.fn().mockResolvedValue({ unread })
    })
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router], provide: { [apiKey as symbol]: api } } })
    await flushPromises()
    return { wrapper, router, api }
  }
  const chatTab = (wrapper: Awaited<ReturnType<typeof mountLayout>>['wrapper']) => wrapper.find('.tabs a[href="/leagues/l1/chat"]')

  it('badges the Chat tab with unread messages, hiding it while in chat', async () => {
    const { wrapper, router, api } = await mountLayout('/leagues/l1/party', 3)
    expect(api.getChatUnread).toHaveBeenCalledWith('l1')
    expect(chatTab(wrapper).find('.badge').text()).toBe('3')
    expect(chatTab(wrapper).text()).toContain('3 unread')

    await router.push('/leagues/l1/chat')
    await flushPromises()
    expect(chatTab(wrapper).find('.badge').exists()).toBe(false)
  })

  it('caps the badge at 9+', async () => {
    const { wrapper } = await mountLayout('/leagues/l1', 10)
    expect(chatTab(wrapper).find('.badge').text()).toBe('9+')
  })

  it("doesn't check unread while in chat", async () => {
    const { api } = await mountLayout('/leagues/l1/chat', 4)
    expect(api.getChatUnread).not.toHaveBeenCalled()
  })

  it('has five tabs in one row, each with an icon and a label', async () => {
    setActivePinia(createPinia())
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/leagues/:id', component: LeagueLayout, children: [{ path: ':rest(.*)*', component: { template: '<div />' } }] }]
    })
    await router.push('/leagues/l1/matchup/3')
    await router.isReady()
    const api = fakeApi({ getLeague: vi.fn().mockResolvedValue(detail({ status: 'active', parties: [party('a', true)] })) })
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router], provide: { [apiKey as symbol]: api } } })
    await flushPromises()
    const tabs = wrapper.findAll('.tabs a')
    expect(tabs.map(tab => tab.text())).toEqual(['League', 'Party', 'Matchup', 'Heroes', 'Chat'])
    // One grid column per tab, so they never wrap onto a second row.
    expect(wrapper.find('.tabs').attributes('style')).toContain('repeat(5, minmax(0, 1fr))')
    expect(tabs.every(tab => tab.find('svg').exists())).toBe(true)
    expect(tabs.map(tab => tab.attributes('href'))).toEqual(['/leagues/l1', '/leagues/l1/party', '/leagues/l1/matchup', '/leagues/l1/heroes', '/leagues/l1/chat'])
  })
})

describe('Season finale', () => {
  const row = (partyId: string, name: string, wins: number, losses: number): Standing => ({ partyId, name, crest, wins, losses, draws: 0, totalDamage: 1500.6 - losses })
  const finale = (myRank: number): Finale => {
    const standings = [row('b', 'Ember Wolves', 10, 4), row('a', 'Dragon Slayers', 9, 5), row('c', 'Moon Elves', 5, 9), row('d', 'Last Stand', 4, 10)]
    return {
      champion: standings[0]!,
      standings,
      myFinish: { partyId: standings[myRank - 1]!.partyId, rank: myRank },
      awards: [
        { kind: 'mightiestBlow', party: standings[0]!, week: 6, total: 154.2 },
        { kind: 'heroOfTheSeason', hero: { heroId: 'h1', name: 'Kael', heroClass: 'Rogue' }, party: standings[1]!, damage: 312 },
        { kind: 'greatestStrike', hero: { heroId: 'h2', name: 'Lyra', heroClass: 'Ranger' }, party: standings[2]!, week: 9, damage: 48 },
        { kind: 'closestBattle', winner: standings[1]!, loser: standings[0]!, week: 3, margin: 0.4 },
        { kind: 'unbreakable', party: standings[3]!, damageFaced: 1104 }
      ]
    }
  }

  it('crowns the champion, shows my finish, the podium, and every award', async () => {
    const api = fakeApi({ getFinale: vi.fn().mockResolvedValue(finale(2)) })
    const { wrapper } = await mountLeague(FinaleView, api, detail({ status: 'complete', name: 'Johnson League' }))
    expect(api.getFinale).toHaveBeenCalledWith('l1')
    expect(wrapper.find('.champion-name').text()).toBe('Ember Wolves')
    expect(wrapper.find('.champion-line').text()).toBe('Champions of Johnson League · 10–4')
    expect(wrapper.find('.my-line').text()).toBe('You finished 2nd of 4 · 9–5')
    expect(wrapper.findAll('.podium .step-name').map(n => n.text())).toEqual(['Dragon Slayers', 'Ember Wolves', 'Moon Elves'])
    const awards = wrapper.findAll('.award').map(a => a.text())
    expect(awards).toHaveLength(5)
    expect(awards[0]).toMatch(/Mightiest Blow\s*Ember Wolves\s*Dealt 154 in week 6/)
    expect(awards[1]).toMatch(/Hero of the Season\s*Kael\s*Rogue · 312 damage for Dragon Slayers/)
    expect(awards[3]).toMatch(/Dragon Slayers over Ember Wolves\s*Won by 0.40 in week 3/)
    expect(wrapper.find('tr.mine').text()).toContain('Dragon Slayers')
  })

  it('celebrates when my party won', async () => {
    const api = fakeApi({ getFinale: vi.fn().mockResolvedValue(finale(1)) })
    const { wrapper } = await mountLeague(FinaleView, api, detail({ status: 'complete' }))
    expect(wrapper.find('.my-line').text()).toBe('Your party are the champions!')
    expect(wrapper.find('.my-line').classes()).toContain('won')
  })
})

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
        hero: { ...hero('h1', { heroClass: 'Rogue', skill: 'Sneak', partyId: 'a', traits: ['wild', 'mighty'] }), form: { average: 23, recent: 23, played: 2, playingLike: null } },
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

  it('shows what Level a mystery recruit is playing like', async () => {
    const rookie = (playingLike: number | null) => ({
      hero: { ...hero('r1', { level: null, levelRange: { min: 1, max: 7 }, partyId: 'a' }), form: { average: 19, recent: 19, played: 4, playingLike } },
      history: []
    })
    const league = detail({ status: 'active', parties: [party('a', true)] })
    const playing = await mountLeague(HeroDetailView, fakeApi({ getHero: vi.fn().mockResolvedValue(rookie(7)) }), league, '/heroes/r1')
    expect(playing.wrapper.findAll('.chip').map(chip => chip.text()).slice(0, 2)).toEqual(['Mystery Lv 1–7', 'Playing like Lv 7'])
    expect(playing.wrapper.text()).toContain("So far they're playing like a Level 7.")
    const early = await mountLeague(HeroDetailView, fakeApi({ getHero: vi.fn().mockResolvedValue(rookie(null)) }), league, '/heroes/r1')
    expect(early.wrapper.find('.chip.playing').exists()).toBe(false)
    expect(early.wrapper.text()).toContain('After a few battles, they show what Level they are playing like.')
  })
})

describe('League chat', () => {
  const message = (id: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
    id,
    body: `Message ${id}`,
    at: new Date().toISOString(),
    author: { partyId: 'b', name: 'Ember Wolves', crest },
    mine: false,
    reportedByMe: false,
    reports: null,
    ...overrides
  })
  const page = (messages: ChatMessage[], overrides: Partial<ChatPage> = {}): ChatPage => ({
    messages,
    hasMore: false,
    canModerate: false,
    readOnly: false,
    ...overrides
  })
  const league = () => detail({ status: 'active', parties: [party('a', true), party('b')] })
  const bodies = (wrapper: Awaited<ReturnType<typeof mountLeague>>['wrapper']) => wrapper.findAll('.message .body').map(b => b.text())

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows messages with their party, and lets members report others and remove their own', async () => {
    const api = fakeApi({
      getChat: vi.fn().mockResolvedValue(
        page([
          message('a1'),
          message('a2', { mine: true, author: { partyId: 'a', name: 'Party a', crest } }),
          message('a3', { author: null })
        ])
      )
    })
    const { wrapper } = await mountLeague(ChatView, api, league())
    expect(api.getChat).toHaveBeenCalledWith('l1')
    expect(wrapper.findAll('.author').map(a => a.text())).toEqual(['Ember Wolves', 'You', 'Former member'])
    const [theirs, mine] = wrapper.findAll('.message')
    expect(theirs!.findAll('button').map(b => b.text())).toEqual(['Report'])
    expect(mine!.findAll('button').map(b => b.text())).toEqual(['Remove'])
    expect(wrapper.find('.reports').exists()).toBe(false)
  })

  it('shows the host report counts and lets them remove any message', async () => {
    const api = fakeApi({
      getChat: vi.fn().mockResolvedValue(page([message('a1', { reports: 2 }), message('a2', { reports: 0 })], { canModerate: true })),
      deleteChat: vi.fn().mockResolvedValue(undefined)
    })
    const { wrapper } = await mountLeague(ChatView, api, league())
    expect(wrapper.findAll('.reports').map(r => r.text())).toEqual(['⚑ 2'])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await wrapper.find('button[aria-label="Remove message from Ember Wolves"]').trigger('click')
    await flushPromises()
    expect(api.deleteChat).toHaveBeenCalledWith('l1', 'a1')
    expect(bodies(wrapper)).toEqual(['Message a2'])
  })

  it('reports after confirming', async () => {
    const api = fakeApi({
      getChat: vi.fn().mockResolvedValue(page([message('a1')])),
      reportChat: vi.fn().mockResolvedValue(message('a1', { reportedByMe: true }))
    })
    const { wrapper } = await mountLeague(ChatView, api, league())
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper.find('button[aria-label="Report message from Ember Wolves"]').trigger('click')
    expect(api.reportChat).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await wrapper.find('button[aria-label="Report message from Ember Wolves"]').trigger('click')
    await flushPromises()
    expect(api.reportChat).toHaveBeenCalledWith('l1', 'a1')
    expect(wrapper.find('.actions').text()).toBe('Reported')
  })

  it('sends with Enter, keeps Shift+Enter for new lines, and shows the message', async () => {
    const api = fakeApi({ postChat: vi.fn().mockResolvedValue(message('b1', { body: 'Hello all', mine: true })) })
    const { wrapper } = await mountLeague(ChatView, api, league())
    expect(wrapper.text()).toContain('No messages yet')
    const box = wrapper.find('textarea')
    await box.setValue('Hello all')
    await box.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(api.postChat).not.toHaveBeenCalled()
    await box.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(api.postChat).toHaveBeenCalledWith('l1', 'Hello all')
    expect(bodies(wrapper)).toEqual(['Hello all'])
    expect((box.element as HTMLTextAreaElement).value).toBe('')
  })

  it('checks for new messages every few seconds while open, and stops when closed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const getChat = vi.fn().mockResolvedValueOnce(page([message('a1')])).mockResolvedValue(page([message('a1'), message('a2')]))
    const api = fakeApi({ getChat })
    const { wrapper } = await mountLeague(ChatView, api, league())
    expect(bodies(wrapper)).toEqual(['Message a1'])

    vi.advanceTimersByTime(CHAT_POLL_MS)
    await flushPromises()
    expect(bodies(wrapper)).toEqual(['Message a1', 'Message a2'])

    wrapper.unmount()
    const calls = getChat.mock.calls.length
    vi.advanceTimersByTime(CHAT_POLL_MS * 3)
    await flushPromises()
    expect(getChat.mock.calls.length).toBe(calls)
  })

  it('drops messages removed since the last check, and keeps older ones loaded above', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const getChat = vi
      .fn()
      .mockResolvedValueOnce(page([message('b1'), message('b2'), message('b3')], { hasMore: true }))
      .mockResolvedValueOnce(page([message('a1')]))
      .mockResolvedValue(page([message('b1'), message('b3')]))
    const api = fakeApi({ getChat })
    const { wrapper } = await mountLeague(ChatView, api, league())
    await wrapper.findAll('button').find(b => b.text() === 'Show older messages')!.trigger('click')
    await flushPromises()
    expect(getChat).toHaveBeenLastCalledWith('l1', 'b1')
    expect(bodies(wrapper)).toEqual(['Message a1', 'Message b1', 'Message b2', 'Message b3'])
    expect(wrapper.text()).not.toContain('Show older messages')

    vi.advanceTimersByTime(CHAT_POLL_MS)
    await flushPromises()
    expect(bodies(wrapper)).toEqual(['Message a1', 'Message b1', 'Message b3'])
  })

  it('is read-only once the league is canceled', async () => {
    const api = fakeApi({ getChat: vi.fn().mockResolvedValue(page([message('a1')], { readOnly: true })) })
    const { wrapper } = await mountLeague(ChatView, api, detail({ status: 'canceled', parties: [party('a', true), party('b')] }))
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).toContain('its chat is closed')
    expect(wrapper.find('button[aria-label="Report message from Ember Wolves"]').exists()).toBe(false)
  })
})
