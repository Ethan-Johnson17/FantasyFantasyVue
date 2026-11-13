import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { ApiClient } from '../src/api/client'
import { apiKey } from '../src/api/inject'
import type { Hero, LeagueDetail, Lineup, Party, Standing, Trade, Trades } from '../src/api/types'
import { provideLeagueForTest } from '../src/league'
import { hasTrades, offerProblem, releasesNeeded, tradeLine, windowText } from '../src/trades'
import LeaguesView from '../src/views/LeaguesView.vue'
import HeroDetailView from '../src/views/league/HeroDetailView.vue'
import HeroesView from '../src/views/league/HeroesView.vue'
import LeagueHomeView from '../src/views/league/LeagueHomeView.vue'
import LeagueLayout from '../src/views/league/LeagueLayout.vue'
import PartyRosterView from '../src/views/league/PartyRosterView.vue'
import TradeNewView from '../src/views/league/TradeNewView.vue'
import TradesView from '../src/views/league/TradesView.vue'
import { detail, fakeApi, mountView, myLeague } from './helpers'

vi.mock('@auth0/auth0-vue', () => ({ useAuth0: () => ({ logout: vi.fn(), user: ref(null) }) }))

/* Trades in the app (docs/TRADES_SPEC.md): rosters, the offer screen, the inbox, and where they're linked from. */

const crest = { emblem: 'crown', banner: 'crimson' } as const
const party = (id: string, isMine = false): Party => ({ id, name: `Party ${id}`, crest, owner: { id: `owner-${id}`, displayName: `Owner ${id}` }, isMine })
const hero = (id: string, partyId: string | null, overrides: Partial<Hero> = {}): Hero => ({
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
  partyId,
  ...overrides
})
/** Me (p1) and them (p2), ten heroes each: m0–m9 and t0–t9 */
const ROSTER = 10
const heroes = () => [
  ...Array.from({ length: ROSTER }, (_, index) => hero(`m${String(index)}`, 'p1', { level: 10 - index })),
  ...Array.from({ length: ROSTER }, (_, index) => hero(`t${String(index)}`, 'p2', { level: 10 - index })),
  hero('free', null)
]
const league = (overrides: Partial<LeagueDetail> = {}) => detail({ status: 'active', parties: [party('p1', true), party('p2')], ...overrides })
const move = (heroId: string) => ({ heroId, name: `Hero ${heroId}`, heroClass: 'Mage' })
const trade = (overrides: Partial<Trade> = {}): Trade => ({
  id: 'tr1',
  status: 'open',
  from: { partyId: 'p2', name: 'Party p2', crest },
  to: { partyId: 'p1', name: 'Party p1', crest },
  offered: [move('t0')],
  requested: [move('m0')],
  fromReleases: [],
  toReleases: [],
  waitingOnMe: true,
  releasesNeeded: 0,
  createdAt: '2026-11-12T12:00:00.000Z',
  answeredAt: null,
  effectiveWeek: null,
  ...overrides
})
const trades = (overrides: Partial<Trades> = {}): Trades => ({ window: { open: true, lastWeek: 10 }, rosterSize: ROSTER, open: [], answered: [], ...overrides })

async function mountLeague(view: Component, api: ApiClient, value: LeagueDetail, path = '/') {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: view },
      { path: '/parties/:partyId', component: view },
      { path: '/heroes/:heroId', component: view },
      { path: '/new', component: view },
      { path: '/:rest(.*)*', component: { template: '<div>elsewhere</div>' } }
    ]
  })
  await router.push(path)
  await router.isReady()
  const reload = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(view, { global: { plugins: [router], provide: { [apiKey as symbol]: api, ...provideLeagueForTest(value, reload) } } })
  await flushPromises()
  return { wrapper, router, reload }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the offer rules', () => {
  it('are in every mode with more than one party', () => {
    expect(hasTrades(league())).toBe(true)
    expect(hasTrades(league({ mode: 'coop' }))).toBe(true)
    expect(hasTrades(league({ mode: 'solo' }))).toBe(false)
    expect(hasTrades(null)).toBe(false)
  })

  it('releases only what it takes to get back to the roster size', () => {
    expect(releasesNeeded(10, 1, 1, 10)).toBe(0)
    expect(releasesNeeded(10, 1, 3, 10)).toBe(2)
    expect(releasesNeeded(9, 1, 2, 10)).toBe(0)
    expect(releasesNeeded(10, 3, 1, 10)).toBe(0)
  })

  it('says what an offer still needs', () => {
    const draft = { getting: ['t0'], giving: ['m0'], releases: [], rosterCount: 10, rosterSize: 10 }
    expect(offerProblem(draft)).toBeNull()
    expect(offerProblem({ ...draft, getting: [] })).toBe('Pick at least one of their heroes')
    expect(offerProblem({ ...draft, giving: [] })).toBe('Pick at least one of your heroes to give')
    expect(offerProblem({ ...draft, getting: ['t0', 't1', 't2'] })).toBe('Release 2 more of your heroes to make room')
    expect(offerProblem({ ...draft, getting: ['t0', 't1', 't2'], releases: ['m5'] })).toBe('Release 1 more of your heroes to make room')
    expect(offerProblem({ ...draft, getting: ['t0', 't1'], releases: ['m5', 'm6'] })).toBe('Release only 1')
    expect(offerProblem({ ...draft, releases: ['m5'] })).toBe('This trade leaves room on your roster: release nobody')
  })

  it('reads an offer from my side, and the trade window', () => {
    expect(tradeLine(trade(), 'p1')).toBe('Party p2 gives Hero t0 for your Hero m0')
    expect(tradeLine(trade({ from: { partyId: 'p1', name: 'Party p1', crest }, to: { partyId: 'p2', name: 'Party p2', crest } }), 'p1')).toBe(
      'You give Hero t0 for Party p2’s Hero m0'
    )
    expect(windowText({ open: true, lastWeek: 10 })).toContain('Trades are open through week 10.')
    expect(windowText({ open: false, lastWeek: 10 })).toBe('The trade deadline has passed: trades closed after week 10.')
    expect(windowText({ open: false, lastWeek: null })).toBe('This season is too short for trades.')
  })
})

describe('a party’s roster', () => {
  it('lists their heroes best first, each a link to trade for while trades are open', async () => {
    const api = fakeApi({ listHeroes: vi.fn().mockResolvedValue(heroes()) })
    const { wrapper } = await mountLeague(PartyRosterView, api, league(), '/parties/p2')
    expect(wrapper.find('h1').text()).toBe('Party p2')
    const rows = wrapper.findAll('.row')
    expect(rows).toHaveLength(ROSTER)
    expect(rows[0]?.text()).toContain('Hero t0')
    expect(rows[0]?.find('.trade-button').attributes('href')).toBe('/leagues/l1/trades/new?party=p2&want=t0')
    expect(wrapper.find('a.propose').attributes('href')).toBe('/leagues/l1/trades/new?party=p2')
  })

  it('offers no trades on my own roster, after the deadline, or to someone outside the league', async () => {
    const own = await mountLeague(PartyRosterView, fakeApi({ listHeroes: vi.fn().mockResolvedValue(heroes()) }), league(), '/parties/p1')
    expect(own.wrapper.text()).toContain('your party')
    expect(own.wrapper.find('.trade-button').exists()).toBe(false)

    const late = fakeApi({ listHeroes: vi.fn().mockResolvedValue(heroes()), listTrades: vi.fn().mockResolvedValue(trades({ window: { open: false, lastWeek: 10 } })) })
    const closed = await mountLeague(PartyRosterView, late, league(), '/parties/p2')
    expect(closed.wrapper.find('.trade-button').exists()).toBe(false)
    expect(closed.wrapper.text()).toContain('The trade deadline has passed.')

    const visitor = fakeApi({ listHeroes: vi.fn().mockResolvedValue(heroes()) })
    const outside = await mountLeague(PartyRosterView, visitor, league({ parties: [party('p1'), party('p2')] }), '/parties/p2')
    expect(visitor.listTrades).not.toHaveBeenCalled()
    expect(outside.wrapper.find('.trade-button').exists()).toBe(false)
    expect(outside.wrapper.findAll('.row')).toHaveLength(ROSTER)
  })

  it('is linked from the standings', async () => {
    const standing = (partyId: string): Standing => ({ partyId, name: `Party ${partyId}`, crest, wins: 1, losses: 0, draws: 0, totalDamage: 100 })
    const api = fakeApi({ getStandings: vi.fn().mockResolvedValue([standing('p2'), standing('p1')]) })
    const { wrapper } = await mountLeague(LeagueHomeView, api, league({ resolvedWeeks: 1 }))
    expect(wrapper.findAll('.standings .party-link').map(link => link.attributes('href'))).toEqual(['/leagues/l1/parties/p2', '/leagues/l1/parties/p1'])
  })
})

describe('making an offer', () => {
  const path = '/new?party=p2&want=t1'

  it('starts with the hero tapped, and sends my picks once the offer is whole', async () => {
    const api = fakeApi({ listHeroes: vi.fn().mockResolvedValue(heroes()), offerTrade: vi.fn().mockResolvedValue(trade()) })
    const { wrapper, router } = await mountLeague(TradeNewView, api, league(), path)
    expect(wrapper.find('h1').text()).toBe('Trade with Party p2')
    expect(wrapper.find<HTMLInputElement>('input[aria-label="Ask for Hero t1"]').element.checked).toBe(true)
    const send = () => wrapper.find('.summary .btn-primary')
    expect(send().attributes('disabled')).toBeDefined()
    expect(wrapper.find('.summary').text()).toContain('Pick at least one of your heroes to give')

    await wrapper.find('input[aria-label="Give Hero m9"]').setValue(true)
    expect(wrapper.find('.summary').text()).toContain('You give Hero m9 for Hero t1.')
    await send().trigger('click')
    await flushPromises()
    expect(api.offerTrade).toHaveBeenCalledWith('l1', { toPartyId: 'p2', offered: ['m9'], requested: ['t1'], releases: [] })
    expect(router.currentRoute.value.path).toBe('/leagues/l1/trades')
  })

  it('asks for releases when I’d end up over, and stops at 3 heroes a side', async () => {
    const api = fakeApi({ listHeroes: vi.fn().mockResolvedValue(heroes()), offerTrade: vi.fn().mockResolvedValue(trade()) })
    const { wrapper } = await mountLeague(TradeNewView, api, league(), path)
    for (const id of ['t2', 't3']) await wrapper.find(`input[aria-label="Ask for Hero ${id}"]`).setValue(true)
    expect(wrapper.find<HTMLInputElement>('input[aria-label="Ask for Hero t4"]').element.disabled).toBe(true)
    await wrapper.find('input[aria-label="Give Hero m9"]').setValue(true)

    const releases = wrapper.find('.releases')
    expect(releases.find('legend').text()).toBe('Release · 0 of 2')
    // The hero I'm giving can't also be released
    expect(releases.find('input[aria-label="Release Hero m9"]').exists()).toBe(false)
    await releases.find('input[aria-label="Release Hero m8"]').setValue(true)
    expect(wrapper.find('.summary').text()).toContain('Release 1 more of your heroes to make room')
    await releases.find('input[aria-label="Release Hero m7"]').setValue(true)
    expect(releases.find<HTMLInputElement>('input[aria-label="Release Hero m6"]').element.disabled).toBe(true)

    // Giving another means one release fewer
    await wrapper.find('input[aria-label="Give Hero m6"]').setValue(true)
    expect(wrapper.find('.releases legend').text()).toBe('Release · 1 of 1')
    await wrapper.find('.summary .btn-primary').trigger('click')
    await flushPromises()
    expect(api.offerTrade).toHaveBeenCalledWith('l1', { toPartyId: 'p2', offered: ['m9', 'm6'], requested: ['t1', 't2', 't3'], releases: ['m8'] })
  })

  it('says when I’ll have an open spot, and when trades are closed', async () => {
    const api = fakeApi({ listHeroes: vi.fn().mockResolvedValue(heroes()) })
    const { wrapper } = await mountLeague(TradeNewView, api, league(), path)
    for (const id of ['m8', 'm9']) await wrapper.find(`input[aria-label="Give Hero ${id}"]`).setValue(true)
    expect(wrapper.text()).toContain('You’ll have 1 open roster spot afterwards')

    const late = fakeApi({ listHeroes: vi.fn().mockResolvedValue(heroes()), listTrades: vi.fn().mockResolvedValue(trades({ window: { open: false, lastWeek: 10 } })) })
    const closed = await mountLeague(TradeNewView, late, league(), path)
    expect(closed.wrapper.text()).toContain('The trade deadline has passed')
    expect(closed.wrapper.find('.summary').exists()).toBe(false)
  })
})

describe('the Trades inbox', () => {
  it('accepts an offer waiting on me once I agree, then reloads the badge', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue(heroes()),
      listTrades: vi.fn().mockResolvedValue(trades({ open: [trade()] })),
      acceptTrade: vi.fn().mockResolvedValue(trade({ status: 'accepted' }))
    })
    const { wrapper, reload } = await mountLeague(TradesView, api, league())
    expect(wrapper.find('.offer .line').text()).toBe('Party p2 gives Hero t0 for your Hero m0')
    const accept = () => wrapper.find('.offer .btn-primary')
    await accept().trigger('click')
    expect(api.acceptTrade).not.toHaveBeenCalled()
    await accept().trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('It happens at once'))
    expect(api.acceptTrade).toHaveBeenCalledWith('l1', 'tr1', [])
    expect(reload).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Trade done: Hero t0 joined your party.')
  })

  it('picks releases before accepting an offer that would put me over', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const offer = trade({ offered: [move('t0'), move('t1')], releasesNeeded: 1 })
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue(heroes()),
      listTrades: vi.fn().mockResolvedValue(trades({ open: [offer] })),
      acceptTrade: vi.fn().mockResolvedValue(trade({ status: 'accepted' }))
    })
    const { wrapper } = await mountLeague(TradesView, api, league())
    expect(wrapper.text()).toContain('accepting releases 1 of your heroes')
    await wrapper.find('.offer .btn-primary').trigger('click')
    expect(api.acceptTrade).not.toHaveBeenCalled()
    const releases = wrapper.find('.releases')
    // The hero they asked for isn't mine to release
    expect(releases.find('input[aria-label="Release Hero m0"]').exists()).toBe(false)
    expect(wrapper.find('.offer .btn-primary').attributes('disabled')).toBeDefined()
    await releases.find('input[aria-label="Release Hero m9"]').setValue(true)
    expect(releases.find<HTMLInputElement>('input[aria-label="Release Hero m8"]').element.disabled).toBe(true)
    await wrapper.find('.offer .btn-primary').trigger('click')
    await flushPromises()
    expect(api.acceptTrade).toHaveBeenCalledWith('l1', 'tr1', ['m9'])
  })

  it('declines offers to me, withdraws mine, and lists the answered ones', async () => {
    const mine = trade({ id: 'tr2', from: { partyId: 'p1', name: 'Party p1', crest }, to: { partyId: 'p2', name: 'Party p2', crest }, waitingOnMe: false })
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue(heroes()),
      listTrades: vi.fn().mockResolvedValue(trades({ open: [trade(), mine], answered: [trade({ id: 'tr3', status: 'accepted', effectiveWeek: 3, waitingOnMe: false })] })),
      declineTrade: vi.fn().mockResolvedValue(trade({ status: 'declined' })),
      withdrawTrade: vi.fn().mockResolvedValue(mine)
    })
    const { wrapper } = await mountLeague(TradesView, api, league())
    const offers = wrapper.findAll('.offer')
    expect(offers).toHaveLength(2)
    await offers[0]!.find('.btn-secondary').trigger('click')
    await flushPromises()
    expect(api.declineTrade).toHaveBeenCalledWith('l1', 'tr1')
    await wrapper.findAll('.offer')[1]!.find('.link-button').trigger('click')
    await flushPromises()
    expect(api.withdrawTrade).toHaveBeenCalledWith('l1', 'tr2')
    expect(wrapper.find('.answered').text()).toContain('Accepted')
    expect(wrapper.find('.answered').text()).toContain('from battle 3')
  })
})

describe('trades around the league', () => {
  it('links another party’s hero to a trade, and their party to its roster', async () => {
    const theirs = hero('t0', 'p2')
    const api = fakeApi({ getHero: vi.fn().mockResolvedValue({ hero: { ...theirs, form: { average: null, recent: null, played: 0, projected: 20, playingLike: null } }, history: [] }) })
    const { wrapper } = await mountLeague(HeroDetailView, api, league(), '/heroes/t0')
    expect(wrapper.find('a.trade-for').attributes('href')).toBe('/leagues/l1/trades/new?party=p2&want=t0')
    expect(wrapper.find('a.owner-link').attributes('href')).toBe('/leagues/l1/parties/p2')

    const late = fakeApi({
      getHero: api.getHero,
      listTrades: vi.fn().mockResolvedValue(trades({ window: { open: false, lastWeek: 10 } }))
    })
    const closed = await mountLeague(HeroDetailView, late, league(), '/heroes/t0')
    expect(closed.wrapper.find('a.trade-for').exists()).toBe(false)

    const own = fakeApi({ getHero: vi.fn().mockResolvedValue({ hero: { ...hero('m0', 'p1'), form: { average: null, recent: null, played: 0, projected: 20, playingLike: null } }, history: [] }) })
    const mine = await mountLeague(HeroDetailView, own, league(), '/heroes/m0')
    expect(own.listTrades).not.toHaveBeenCalled()
    expect(mine.wrapper.find('a.trade-for').exists()).toBe(false)
  })

  it('shows offers waiting on me on the Heroes page, and trades and open-spot claims in recent moves', async () => {
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue(heroes()),
      // One waiting on me, and one I sent
      listTrades: vi.fn().mockResolvedValue(trades({ open: [trade(), trade({ id: 'tr2', waitingOnMe: false })] })),
      listMoves: vi.fn().mockResolvedValue([
        {
          kind: 'trade',
          sides: [
            { party: { partyId: 'p1', name: 'Party p1' }, received: [move('t5')], released: [] },
            { party: { partyId: 'p2', name: 'Party p2' }, received: [move('m5'), move('m6')], released: [move('t9')] }
          ],
          effectiveWeek: 2,
          at: '2026-11-12T12:00:00.000Z'
        },
        { kind: 'claim', party: { partyId: 'p1', name: 'Party p1' }, added: move('free'), dropped: null, effectiveWeek: 2, at: '2026-11-12T11:00:00.000Z' }
      ])
    })
    const { wrapper } = await mountLeague(HeroesView, api, league())
    const link = wrapper.find('a.trades-link')
    expect(link.attributes('href')).toBe('/leagues/l1/trades')
    expect(link.text()).toContain('1 offer waiting on you')
    const moves = wrapper.findAll('.move').map(entry => entry.text().replace(/\s+/g, ' '))
    expect(moves[0]).toContain('Party p1 and Party p2 traded: Party p1 got Hero t5; Party p2 got Hero m5, Hero m6, released Hero t9 · from battle 2')
    expect(moves[1]).toBe('Party p1 claimed Hero free · from battle 2')
  })

  it('claims into an open spot when my roster is short', async () => {
    const short: Lineup = { lineup: {}, champion: null, roster: heroes().filter(entry => entry.partyId === 'p1').slice(0, ROSTER - 1) } as unknown as Lineup
    const api = fakeApi({
      listHeroes: vi.fn().mockResolvedValue(heroes()),
      getLineup: vi.fn().mockResolvedValue(short),
      claimHero: vi.fn().mockResolvedValue(short)
    })
    const { wrapper } = await mountLeague(HeroesView, api, league())
    await wrapper.find('button[aria-label="Claim Hero free"]').trigger('click')
    await flushPromises()
    const panel = wrapper.find('[role="dialog"]')
    expect(panel.text()).toContain('Into your open spot')
    await panel.find('.btn-primary').trigger('click')
    await flushPromises()
    expect(api.claimHero).toHaveBeenCalledWith('l1', 'free', null)
  })

  it('badges the Heroes tab with offers waiting on me, and My leagues', async () => {
    setActivePinia(createPinia())
    const api = fakeApi({ getLeague: vi.fn().mockResolvedValue(league({ tradeOffers: 2 })) })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/leagues/:id', component: LeagueLayout, children: [{ path: ':rest(.*)*', component: { template: '<div />' } }] }]
    })
    await router.push('/leagues/l1')
    await router.isReady()
    const layout = mount({ template: '<RouterView />' }, { global: { plugins: [router], provide: { [apiKey as symbol]: api } } })
    await flushPromises()
    const tab = layout.find('.tabs a[href="/leagues/l1/heroes"]')
    expect(tab.find('.badge').text()).toBe('2')
    expect(tab.text()).toContain('2 trade offers waiting')

    const list = fakeApi({ listMyLeagues: vi.fn().mockResolvedValue([myLeague({ status: 'active', tradeOffers: 1 })]) })
    const { wrapper } = await mountView(LeaguesView, list)
    await flushPromises()
    expect(wrapper.find('.trade-offers').text()).toBe('1 offer')
  })
})
