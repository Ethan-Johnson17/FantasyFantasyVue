import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { ApiClient } from '../src/api/client'
import { apiKey } from '../src/api/inject'
import type { Campaign, CampaignChapter, CoopFinale, CoopRules, GameRules, LeagueDetail, Party, ResultSide, WeekResult } from '../src/api/types'
import { deadlineText, hpShown, weekStory } from '../src/campaign'
import CampaignBoard from '../src/components/CampaignBoard.vue'
import { provideLeagueForTest } from '../src/league'
import HostLeagueView from '../src/views/HostLeagueView.vue'
import HowItWorksView from '../src/views/HowItWorksView.vue'
import LeaguesView from '../src/views/LeaguesView.vue'
import FinaleView from '../src/views/league/FinaleView.vue'
import LeagueHomeView from '../src/views/league/LeagueHomeView.vue'
import LeagueLayout from '../src/views/league/LeagueLayout.vue'
import MatchupView from '../src/views/league/MatchupView.vue'
import QuestView from '../src/views/league/QuestView.vue'
import { detail, fakeApi, mountView, myLeague } from './helpers'

vi.mock('@auth0/auth0-vue', () => ({ useAuth0: () => ({ logout: vi.fn(), user: ref(null) }) }))

/* Co-op in the app (docs/COOP_SPEC.md): the quest board in place of matchups and standings. */

const crest = { emblem: 'crown', banner: 'crimson' } as const
const party = (id: string, isMine = false): Party => ({ id, name: `Party ${id}`, crest, owner: { id: `o-${id}`, displayName: `Owner ${id}` }, isMine })
const chapter = (number: number, overrides: Partial<CampaignChapter> = {}): CampaignChapter => ({
  chapter: number,
  name: `Monster ${String(number)}`,
  weak: ['Mage', 'Ranger'],
  resists: 'Rogue',
  boss: number === 5,
  hp: 1000,
  deadline: [3, 6, 9, 12, 14][number - 1] ?? 14,
  status: 'upcoming',
  hpLeft: 1000,
  endedWeek: null,
  ...overrides
})
const campaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  lives: 3,
  livesLeft: 2,
  outcome: 'ongoing',
  chapter: 2,
  chapters: [
    chapter(1, { status: 'fallen', hpLeft: 0, endedWeek: 2 }),
    chapter(2, { status: 'active', hpLeft: 400.2 }),
    chapter(3),
    chapter(4),
    chapter(5, { name: 'The Dragon Tyrant' })
  ],
  lastWeek: 4,
  nextWeek: { week: 5, at: '2026-11-10T12:00:00.000Z' },
  contributions: [
    { partyId: 'b', name: 'Party b', crest, lastWeek: 210.4, chapter: 380.6, total: 900 },
    { partyId: 'a', name: 'Party a', crest, lastWeek: 150, chapter: 219.2, total: 700 }
  ],
  myParty: { partyId: 'a', hasChampion: true },
  ...overrides
})
const coopRules = (available = true): CoopRules => ({
  available,
  version: 3,
  deadlines: [3, 6, 9, 12, 14],
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
  coop: coopRules(available)
})
const side = (id: string, total: number, overrides: Partial<ResultSide> = {}): ResultSide => ({
  partyId: id,
  name: `Party ${id}`,
  crest,
  total,
  champion: null,
  synergies: [],
  heroes: [],
  ...overrides
})
const weekResult = (week: number, overrides: Partial<NonNullable<WeekResult['campaign']>> = {}): WeekResult => ({
  week,
  matchups: [],
  sides: [side('b', 210.4), side('a', 150, { champion: 'h1', heroes: [
    { heroId: 'h1', name: 'Aria', heroClass: 'Mage', slot: 'Mage', damage: 60.4, resting: false, swappedInto: null, crit: null },
    { heroId: 'h2', name: 'Bram', heroClass: 'Rogue', slot: 'Bench', damage: 40, resting: false, swappedInto: null, crit: null }
  ] })],
  campaign: {
    chapter: 2,
    monster: 'Monster 2',
    hpBefore: 760.6,
    dealt: 360.4,
    fallen: [],
    failed: null,
    failedHpLeft: null,
    state: { chapter: 2, hpLeft: 400.2, livesLeft: 2, outcome: 'ongoing' },
    ...overrides
  }
})
const coopLeague = (overrides: Partial<LeagueDetail> = {}) =>
  detail({ mode: 'coop', status: 'active', resolvedWeeks: 4, playoffs: null, parties: [party('a', true), party('b')], ...overrides })

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
  const wrapper = mount(view, { global: { plugins: [router], provide: { [apiKey as symbol]: api, ...provideLeagueForTest(league, vi.fn()) } } })
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the campaign, as players read it', () => {
  it('rounds HP up, so a monster with any HP left never reads as 0', () => {
    expect(hpShown(0.2)).toBe(1)
    expect(hpShown(400)).toBe(400)
    expect(hpShown(-3)).toBe(0)
  })

  it('counts the battles left before a deadline, including the next one', () => {
    expect(deadlineText(chapter(2, { deadline: 6 }), 5)).toBe('Must fall by week 6 · 2 battles left')
    expect(deadlineText(chapter(2, { deadline: 6 }), 6)).toBe('Week 6 is the last chance to bring it down')
    expect(deadlineText(chapter(2, { deadline: 6 }), null)).toBe('Had to fall by week 6')
  })

  it('tells a week’s story: a kill, the overkill, and a lost life', () => {
    const chapters = campaign().chapters
    expect(weekStory(weekResult(3, { fallen: [2, 3] }), chapters)).toBe(
      'The league dealt 360 damage to Monster 2. Monster 2 fell! The overkill brought down Monster 3 too!'
    )
    expect(weekStory(weekResult(6, { failed: 2 }), chapters)).toBe(
      'The league dealt 360 damage to Monster 2. Monster 2 outlasted its deadline: a life was lost, and the story moves on.'
    )
    const lost = weekResult(14, { failed: 5, state: { chapter: 5, hpLeft: 10, livesLeft: 0, outcome: 'lost' } })
    expect(weekStory(lost, chapters)).toBe('The league dealt 360 damage to Monster 2. The Dragon Tyrant outlasted its deadline. The campaign is lost.')
  })
})

describe('CampaignBoard', () => {
  it('shows the monster, its weaknesses, HP rounded up, the deadline and the lives', () => {
    const wrapper = mount(CampaignBoard, { props: { campaign: campaign() } })
    expect(wrapper.text()).toContain('Chapter 2 of 5')
    expect(wrapper.find('.name').text()).toBe('Monster 2')
    expect(wrapper.find('.mods').text()).toMatch(/Weak to\s+Mages and\s+Rangers\s+×1.25 · resists Rogues\s+×0.75/)
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('401')
    expect(wrapper.find('.hp-text').text()).toContain('401 of 1,000 HP')
    expect(wrapper.find('.hp-text').text()).toContain('Must fall by week 6 · 2 battles left')
    expect(wrapper.find('.lives').attributes('aria-label')).toBe('2 of 3 lives left')
    expect(wrapper.findAll('.life.lost')).toHaveLength(1)
    expect(wrapper.find('.open').exists()).toBe(false)
  })

  it('shows the outcome once the campaign is over', () => {
    const won = mount(CampaignBoard, { props: { campaign: campaign({ outcome: 'won', chapter: 5 }), leagueId: 'l1' }, global: { stubs: { RouterLink: RouterLinkStub } } })
    expect(won.text()).toContain('Victory')
    expect(won.text()).toContain('The boss has fallen')
    expect(won.findComponent(RouterLinkStub).props('to')).toBe('/leagues/l1/quest')
    const lost = mount(CampaignBoard, { props: { campaign: campaign({ outcome: 'lost', chapter: 5, livesLeft: 0 }) } })
    expect(lost.text()).toContain('The campaign is lost at the boss raid.')
    expect(lost.find('[role="progressbar"]').exists()).toBe(false)
  })
})

describe('QuestView', () => {
  const questApi = (overrides: Partial<ApiClient> = {}) =>
    fakeApi({
      getCampaign: vi.fn().mockResolvedValue(campaign()),
      getRules: vi.fn().mockResolvedValue(rules()),
      getWeekResult: vi.fn().mockImplementation((_id: string, week: number) => Promise.resolve(weekResult(week))),
      ...overrides
    })

  it('ranks who’s dealing the damage, marks my party, and shows the latest week', async () => {
    const api = questApi()
    const { wrapper } = await mountLeague(QuestView, api, coopLeague())
    expect(api.getCampaign).toHaveBeenCalledWith('l1')
    const helpers = wrapper.findAll('.helper')
    expect(helpers.map(row => row.find('.helper-name').text())).toEqual(['Party b', 'Party a you'])
    expect(helpers[0]?.text()).toContain('381')
    expect(helpers[1]?.classes()).toContain('mine')
    expect(api.getWeekResult).toHaveBeenCalledWith('l1', 4)
    expect(wrapper.find('.story').text()).toBe('The league dealt 360 damage to Monster 2.')
    expect(wrapper.findAll('.strip .chip').map(chip => chip.text())).toEqual(['1', '2', '3', '4'])
    expect(wrapper.find('.chip.selected').text()).toBe('4')
    expect(wrapper.find('.reminder').exists()).toBe(false)
    expect(api.getMatchup).not.toHaveBeenCalled()
    expect(api.getStandings).not.toHaveBeenCalled()
  })

  it('shows my heroes for the week, the Champion crowned, whole damage, fighters first', async () => {
    const { wrapper } = await mountLeague(QuestView, questApi(), coopLeague())
    const heroes = wrapper.findAll('.hero')
    expect(heroes.map(hero => hero.find('.hero-name').text())).toEqual(['♛ Aria', 'Bram'])
    expect(heroes[0]?.find('.num').text()).toBe('60')
    expect(heroes[1]?.classes()).toContain('bench')
    expect(heroes[1]?.text()).toContain('bench (would have dealt)')
  })

  it('opens the week asked for', async () => {
    const api = questApi()
    const { wrapper } = await mountLeague(QuestView, api, coopLeague(), '/quest/2')
    expect(api.getWeekResult).toHaveBeenCalledWith('l1', 2)
    expect(wrapper.find('.chip.selected').text()).toBe('2')
  })

  it('reminds a party without a Champion to name one', async () => {
    const api = questApi({ getCampaign: vi.fn().mockResolvedValue(campaign({ myParty: { partyId: 'a', hasChampion: false } })) })
    const { wrapper } = await mountLeague(QuestView, api, coopLeague())
    const reminder = wrapper.find('.reminder')
    expect(reminder.text()).toContain('Name a Champion.')
    expect(reminder.attributes('href')).toBe('/leagues/l1/party')
  })

  it('points to the finale once the campaign is over', async () => {
    const api = questApi({ getCampaign: vi.fn().mockResolvedValue(campaign({ outcome: 'won', nextWeek: null, myParty: { partyId: 'a', hasChampion: false } })) })
    const { wrapper } = await mountLeague(QuestView, api, coopLeague({ status: 'complete' }))
    expect(wrapper.find('.finale-link').attributes('href')).toBe('/leagues/l1/finale')
    expect(wrapper.find('.reminder').exists()).toBe(false)
  })

  it('waits for the draft', async () => {
    const api = questApi()
    const { wrapper } = await mountLeague(QuestView, api, coopLeague({ status: 'drafting', resolvedWeeks: 0 }))
    expect(wrapper.text()).toContain('The campaign begins once the draft has run.')
    expect(api.getCampaign).not.toHaveBeenCalled()
  })
})

describe('Co-op elsewhere in a league', () => {
  it('sends the matchup page to the quest board, without asking for a matchup', async () => {
    const api = fakeApi()
    const { router } = await mountLeague(MatchupView, api, coopLeague())
    expect(router.currentRoute.value.fullPath).toBe('/leagues/l1/quest')
    expect(api.getMatchup).not.toHaveBeenCalled()
    expect(api.getSchedule).not.toHaveBeenCalled()
  })

  it('shows the campaign on the league home, in place of standings and battles', async () => {
    const api = fakeApi({ getCampaign: vi.fn().mockResolvedValue(campaign()) })
    const { wrapper } = await mountLeague(LeagueHomeView, api, coopLeague())
    expect(api.getCampaign).toHaveBeenCalledWith('l1')
    expect(api.getStandings).not.toHaveBeenCalled()
    expect(api.getSchedule).not.toHaveBeenCalled()
    expect(api.getPlayoffs).not.toHaveBeenCalled()
    expect(wrapper.find('.mode-chip').text()).toBe('Co-op')
    expect(wrapper.find('.board .name').text()).toBe('Monster 2')
    expect(wrapper.find('.board .open').attributes('href')).toBe('/leagues/l1/quest')
  })

  it('shows the campaign’s outcome on a finished league’s home', async () => {
    const api = fakeApi({ getCampaign: vi.fn().mockResolvedValue(campaign({ outcome: 'lost', livesLeft: 0, nextWeek: null })) })
    const { wrapper } = await mountLeague(LeagueHomeView, api, coopLeague({ status: 'complete', resolvedWeeks: 14 }))
    expect(wrapper.find('.finale-eyebrow').text()).toBe('Campaign lost')
    expect(wrapper.find('.finale-banner').attributes('href')).toBe('/leagues/l1/finale')
  })

  it('shows a Co-op finale: the outcome, every chapter, the awards and the damage', async () => {
    const finale: CoopFinale = {
      mode: 'coop',
      outcome: 'won',
      lives: 3,
      livesLeft: 1,
      chapters: campaign().chapters.map(entry => ({ ...entry, status: entry.chapter === 3 ? 'failed' : 'fallen', hpLeft: entry.chapter === 3 ? 120.3 : 0 })),
      contributions: [
        { partyId: 'b', name: 'Party b', crest, total: 4100.6 },
        { partyId: 'a', name: 'Party a', crest, total: 3900 }
      ],
      myParty: { partyId: 'a' },
      awards: [
        { kind: 'monsterSlayer', party: { partyId: 'b', name: 'Party b', crest }, damage: 4100.6 },
        { kind: 'finalBlow', chapter: 1, monster: 'Monster 1', week: 2, party: { partyId: 'a', name: 'Party a', crest }, damage: 88 },
        { kind: 'finalBlow', chapter: 5, monster: 'The Dragon Tyrant', week: 14, party: { partyId: 'b', name: 'Party b', crest }, damage: 120 }
      ]
    }
    const api = fakeApi({ getFinale: vi.fn().mockResolvedValue(finale) })
    // Even with a bracket on the league, which the API never sets for Co-op, there are no playoffs to ask for
    const { wrapper } = await mountLeague(FinaleView, api, coopLeague({ status: 'complete', playoffs: { spots: 2, rounds: 1, regularWeeks: 13 } }))
    expect(api.getPlayoffs).not.toHaveBeenCalled()
    expect(wrapper.find('.eyebrow').text()).toBe('Campaign complete')
    expect(wrapper.find('.headline').text()).toBe('Victory!')
    expect(wrapper.text()).toContain('1 of 3 lives left')
    expect(wrapper.find('.chapter.failed').text()).toContain('121 HP left')
    expect(wrapper.findAll('.award-title').map(title => title.text())).toEqual(['Monster Slayer', 'Final Blow', 'Final Blow'])
    expect(wrapper.text()).toContain('Brought down The Dragon Tyrant in week 14 with 120')
    expect(wrapper.findAll('.helper .num').map(cell => cell.text())).toEqual(['4,101', '3,900'])
    expect(wrapper.find('.helper.mine').text()).toContain('Party a')
    expect(wrapper.find('.links a').attributes('href')).toBe('/leagues/l1/quest')
    expect(wrapper.find('.standings').exists()).toBe(false)
  })
})

describe('the league tabs', () => {
  async function tabs(mode: LeagueDetail['mode']) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/leagues/:id', component: LeagueLayout, children: [{ path: ':rest(.*)*', component: { template: '<div />' } }] }]
    })
    await router.push('/leagues/l1')
    await router.isReady()
    const api = fakeApi({
      getLeague: vi.fn().mockResolvedValue(coopLeague({ mode })),
      getChatUnread: vi.fn().mockResolvedValue({ unread: 0 })
    })
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router], provide: { [apiKey as symbol]: api } } })
    await flushPromises()
    return wrapper.findAll('.tabs a').map(tab => tab.attributes('href'))
  }

  it('has a Quest tab in place of Matchup in Co-op', async () => {
    const coop = await tabs('coop')
    expect(coop).toContain('/leagues/l1/quest')
    expect(coop).not.toContain('/leagues/l1/matchup')
    const classic = await tabs('classic')
    expect(classic).toContain('/leagues/l1/matchup')
    expect(classic).not.toContain('/leagues/l1/quest')
  })
})

describe('Co-op on My Leagues', () => {
  it('tags the league, shows the campaign, and sends the spotlight to the quest board', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-09T12:00:00.000Z'), toFake: ['Date'] })
    const league = myLeague({
      mode: 'coop',
      status: 'active',
      resolvedWeeks: 4,
      weekOneAt: '2026-11-06T12:00:00.000Z',
      outlook: {
        ranking: null,
        nextBattle: { week: 5, at: '2026-11-10T12:00:00.000Z', opponent: null, monster: 'Monster 2', noChampion: false, restingStarters: 0 },
        lastBattle: null,
        campaign: { chapter: 2, monster: 'Monster 2', hp: 1000, hpLeft: 400.2, deadline: 6, livesLeft: 1, outcome: 'ongoing', myLastWeek: 150 }
      }
    })
    const api = fakeApi({ listMyLeagues: vi.fn().mockResolvedValue([league]) })
    const { wrapper } = await mountView(LeaguesView, api)
    await flushPromises()
    expect(wrapper.find('.mode-tag').text()).toBe('· Co-op')
    expect(wrapper.find('.league-record').text()).toContain('Monster 2 · 401 of 1,000 HP · 1 life left')
    const spotlight = wrapper.find('.spotlight')
    expect(spotlight.text()).toContain('Monster 2')
    expect(spotlight.find('.btn-primary').text()).toBe('See the quest')
    expect(spotlight.find('.btn-primary').attributes('href')).toBe('/leagues/l1/quest')
  })

  it('reads a finished campaign as won or lost', async () => {
    const league = myLeague({
      mode: 'coop',
      status: 'complete',
      outlook: {
        ranking: null,
        nextBattle: null,
        lastBattle: null,
        campaign: { chapter: 5, monster: 'The Dragon Tyrant', hp: 1000, hpLeft: 0, deadline: 14, livesLeft: 2, outcome: 'won', myLastWeek: 90 }
      }
    })
    const { wrapper } = await mountView(LeaguesView, fakeApi({ listMyLeagues: vi.fn().mockResolvedValue([league]) }))
    await flushPromises()
    expect(wrapper.find('.league-party').text()).toContain('Campaign won!')
    expect(wrapper.find('.league-record').exists()).toBe(false)
  })
})

describe('hosting a Co-op league', () => {
  it('offers Co-op only once it’s switched on', async () => {
    const { wrapper } = await mountView(HostLeagueView, fakeApi({ getRules: vi.fn().mockResolvedValue(rules(false)) }))
    await flushPromises()
    expect(wrapper.find('input[name="mode"]').exists()).toBe(false)
  })

  it('sends Co-op as one season with no playoffs, and explains the campaign', async () => {
    const api = fakeApi({ getRules: vi.fn().mockResolvedValue(rules()), createLeague: vi.fn().mockResolvedValue(detail({ id: 'x' })) })
    const { wrapper } = await mountView(HostLeagueView, api)
    await flushPromises()
    await wrapper.find('input[name="length"][value="3"]').setValue(true)
    await wrapper.find('input[name="mode"][value="coop"]').setValue(true)
    expect(wrapper.find('input[name="length"]').exists()).toBe(false)
    expect(wrapper.find('input[name="playoffs"]').exists()).toBe(false)
    expect(wrapper.find('input[name="cadence"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('The whole league fights 4 monsters and then The Dragon Tyrant')
    expect(wrapper.text()).toContain('weeks 3, 6, 9, 12, 14')
    await wrapper.find('#league-name').setValue('Raid Night')
    await wrapper.find('#party-name').setValue('Dragon Slayers')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const sent = vi.mocked(api.createLeague).mock.calls[0]?.[0]
    expect(sent).toMatchObject({ mode: 'coop', name: 'Raid Night', playoffs: false })
    expect(sent).not.toHaveProperty('dynastySeasons')
  })
})

describe('How it works', () => {
  it('explains Co-op once it’s switched on', async () => {
    const on = await mountView(HowItWorksView, fakeApi({ getRules: vi.fn().mockResolvedValue(rules()) }))
    await flushPromises()
    expect(on.wrapper.find('a[href="#coop"]').exists()).toBe(true)
    const section = on.wrapper.find('#coop')
    expect(section.text()).toContain('4 chapters, each a monster, then a boss raid against The Dragon Tyrant')
    expect(section.text()).toContain('3 lives.')
    const off = await mountView(HowItWorksView, fakeApi({ getRules: vi.fn().mockResolvedValue(rules(false)) }))
    await flushPromises()
    expect(off.wrapper.find('#coop').exists()).toBe(false)
  })
})
