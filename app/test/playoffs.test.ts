import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { ApiClient } from '../src/api/client'
import { apiKey } from '../src/api/inject'
import type { Finale, LeagueDetail, Party, Playoffs, ScheduleWeek, Standing } from '../src/api/types'
import { provideLeagueForTest } from '../src/league'
import { roundName, stageOf } from '../src/playoffs'
import HostLeagueView from '../src/views/HostLeagueView.vue'
import FinaleView from '../src/views/league/FinaleView.vue'
import LeagueHomeView from '../src/views/league/LeagueHomeView.vue'
import MatchupView from '../src/views/league/MatchupView.vue'
import { detail, fakeApi, mountView } from './helpers'

const crest = { emblem: 'crown', banner: 'crimson' } as const
const party = (id: string, isMine = false): Party => ({ id, name: `Party ${id}`, crest, owner: { id: `o-${id}`, displayName: `Owner ${id}` }, isMine })
const ref = (id: string) => ({ partyId: id, name: `Party ${id}`, crest })
const seed = (id: string, n: number, total: number | null = null) => ({ ...ref(id), seed: n, total })
const row = (id: string, wins: number): Standing => ({ ...ref(id), wins, losses: 14 - wins, draws: 0, totalDamage: wins * 100 })

async function mountLeague(view: Component, api: ApiClient, league: LeagueDetail, path = '/') {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: view },
      { path: '/matchup/:week?', component: view },
      { path: '/:rest(.*)*', component: { template: '<div>elsewhere</div>' } }
    ]
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(view, { global: { plugins: [router], provide: { [apiKey as symbol]: api, ...provideLeagueForTest(league, vi.fn()) } } })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('round names', () => {
  it('follow the bracket size, and label consolation battles', () => {
    expect([15, 16, 17].map(week => roundName({ spots: 6, rounds: 3 }, week))).toEqual(['Quarterfinals', 'Semifinals', 'Final'])
    expect([14, 15, 16, 17].map(week => roundName({ spots: 4, rounds: 2 }, week))).toEqual([null, 'Semifinals', 'Final', null])
    expect(roundName(null, 15)).toBeNull()
    expect(stageOf({ spots: 2, rounds: 1 }, 15, 'consolation')).toBe('Consolation')
    expect(stageOf({ spots: 2, rounds: 1 }, 15, 'playoff')).toBe('Final')
    expect(stageOf({ spots: 2, rounds: 1 }, 3, 'regular')).toBeNull()
  })
})

describe('hosting', () => {
  const host = async () => {
    const api = fakeApi({ getRules: vi.fn().mockRejectedValue(new Error('offline')), createLeague: vi.fn().mockResolvedValue(detail({ id: 'n1' })) })
    const { wrapper } = await mountView(HostLeagueView, api)
    await flushPromises()
    await wrapper.find('#league-name').setValue('Bracket Busters')
    await wrapper.find('#party-name').setValue('Seeds')
    return { api, wrapper }
  }

  it('has playoffs on by default', async () => {
    const { api, wrapper } = await host()
    expect(wrapper.text()).toContain('play a bracket')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createLeague).toHaveBeenCalledWith(expect.objectContaining({ playoffs: true }))
  })

  it('lets the host have the best record win instead', async () => {
    const { api, wrapper } = await host()
    await wrapper.find('input[name="playoffs"][value="false"]').setValue(true)
    expect(wrapper.text()).not.toContain('play a bracket')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createLeague).toHaveBeenCalledWith(expect.objectContaining({ playoffs: false }))
  })
})

describe('the league page in the playoffs', () => {
  // Six parties at week 15 of a top-6 bracket: my party (seed 1) rests on a bye.
  const standings = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => row(id, 13 - i))
  const bracket = (overrides: Partial<Playoffs> = {}): Playoffs => ({
    format: { spots: 6, rounds: 3 },
    provisional: false,
    seeds: standings.slice(0, 6).map((entry, i) => seed(entry.partyId, i + 1)),
    rounds: [
      { round: 1, week: 15, name: 'Quarterfinals', games: [{ high: seed('c', 3), low: seed('f', 6), winner: null }, { high: seed('d', 4), low: seed('e', 5), winner: null }], byes: [seed('a', 1), seed('b', 2)] },
      { round: 2, week: 16, name: 'Semifinals', games: [], byes: [] },
      { round: 3, week: 17, name: 'Final', games: [], byes: [] }
    ],
    champion: null,
    ...overrides
  })
  const week15: ScheduleWeek = {
    week: 15,
    resolvesAt: null,
    matchups: [
      { home: ref('c'), away: ref('f'), kind: 'playoff', result: null },
      { home: ref('d'), away: ref('e'), kind: 'playoff', result: null },
      { home: ref('g'), away: ref('h'), kind: 'consolation', result: null }
    ]
  }
  const league = (overrides: Partial<LeagueDetail> = {}) =>
    detail({ status: 'active', resolvedWeeks: 14, seasonWeeks: 17, playoffs: { spots: 6, rounds: 3 }, partyCount: 8, parties: [party('a', true), party('b')], ...overrides })

  it('shows the bracket, the playoff line, and my bye', async () => {
    const api = fakeApi({ getStandings: vi.fn().mockResolvedValue(standings), getSchedule: vi.fn().mockResolvedValue([week15]), getPlayoffs: vi.fn().mockResolvedValue(bracket()) })
    const wrapper = await mountLeague(LeagueHomeView, api, league())
    expect(api.getPlayoffs).toHaveBeenCalledWith('l1')
    // The dashed line falls under the sixth seed.
    expect(wrapper.findAll('.standings tbody tr').findIndex(tr => tr.classes().includes('cutoff'))).toBe(5)
    expect(wrapper.text()).toContain('The top 6 make the playoffs')
    const rounds = wrapper.findAll('.round')
    expect(rounds.map(round => round.find('.round-name').text())).toEqual(['Quarterfinals · week 15', 'Semifinals · week 16', 'Final · week 17'])
    expect(rounds[0]!.text()).toMatch(/1\s*Party a · you\s*bye/)
    expect(rounds[1]!.findAll('.tbd')).toHaveLength(2)
    expect(rounds[2]!.findAll('.tbd')).toHaveLength(1)
    expect(wrapper.text()).toContain('Quarterfinals')
    expect(wrapper.text()).toContain('Consolation')
    expect(wrapper.text()).toContain('Your party rests on a bye this week')
    expect(wrapper.text()).not.toContain('See your matchup')
  })

  it('crowns the final’s winner, not the best record', async () => {
    const done = bracket({ champion: ref('c') })
    const api = fakeApi({ getStandings: vi.fn().mockResolvedValue(standings), getSchedule: vi.fn().mockResolvedValue([]), getPlayoffs: vi.fn().mockResolvedValue(done) })
    const wrapper = await mountLeague(LeagueHomeView, api, league({ status: 'complete', resolvedWeeks: 17 }))
    expect(wrapper.find('.finale-name').text()).toBe('Party c take the crown')
  })

  it('leaves the bracket out without playoffs', async () => {
    const api = fakeApi({ getStandings: vi.fn().mockResolvedValue(standings), getSchedule: vi.fn().mockResolvedValue([]) })
    const wrapper = await mountLeague(LeagueHomeView, api, league({ status: 'complete', playoffs: null, resolvedWeeks: 14, seasonWeeks: 14 }))
    expect(api.getPlayoffs).not.toHaveBeenCalled()
    expect(wrapper.find('.finale-name').text()).toBe('Party a take the crown')
    expect(wrapper.find('.cutoff').exists()).toBe(false)
  })

  it('marks played games’ winners in the bracket', async () => {
    const played = bracket({
      rounds: [
        { ...bracket().rounds[0]!, games: [{ high: seed('c', 3, 101), low: seed('f', 6, 120), winner: 'f' }] },
        ...bracket().rounds.slice(1)
      ]
    })
    const api = fakeApi({ getStandings: vi.fn().mockResolvedValue(standings), getSchedule: vi.fn().mockResolvedValue([]), getPlayoffs: vi.fn().mockResolvedValue(played) })
    const wrapper = await mountLeague(LeagueHomeView, api, league({ resolvedWeeks: 15 }))
    const sides = wrapper.findAll('.round')[0]!.findAll('.game .side').filter(side => !side.text().includes('bye'))
    expect(sides.map(side => [side.text().replace(/\s+/g, ' ').trim(), side.classes().includes('won')])).toEqual([
      ['3Party c101', false],
      ['6Party f120', true]
    ])
  })
})

describe('the matchup screen in the playoffs', () => {
  const schedule: ScheduleWeek[] = [
    { week: 15, resolvesAt: null, matchups: [{ home: ref('b'), away: ref('c'), kind: 'playoff', result: null }] },
    { week: 16, resolvesAt: null, matchups: [{ home: ref('a'), away: ref('b'), kind: 'playoff', result: null }, { home: ref('c'), away: null, kind: 'consolation', result: null }] }
  ]
  const league = detail({ status: 'active', resolvedWeeks: 14, seasonWeeks: 16, playoffs: { spots: 4, rounds: 2 }, parties: [party('a', true), party('b')] })

  it('shows a bye without fetching a battle, and labels the round', async () => {
    const api = fakeApi({ getSchedule: vi.fn().mockResolvedValue(schedule), getMatchup: vi.fn().mockRejectedValue(new Error('no battle')) })
    const wrapper = await mountLeague(MatchupView, api, league, '/matchup/15')
    expect(wrapper.text()).toContain('Your party rests on a bye this week')
    expect(wrapper.text()).not.toContain('no battle')
    const chips = wrapper.findAll('.chip')
    expect(chips.map(chip => chip.attributes('aria-label'))).toEqual(['Week 15: bye', 'Final, Week 16 vs Party b'])
    expect(chips.every(chip => chip.classes().includes('playoff'))).toBe(true)
  })

  it('names the round on the week label', async () => {
    const api = fakeApi({ getSchedule: vi.fn().mockResolvedValue(schedule), getMatchup: vi.fn().mockRejectedValue(new Error('later')) })
    const wrapper = await mountLeague(MatchupView, api, league, '/matchup/16')
    expect(wrapper.find('.week-label .stage').text()).toBe('Final')
  })
})

describe('the finale after playoffs', () => {
  const standings = [row('a', 11), row('b', 9), row('c', 7)]
  const finale = (mine: string): Finale => ({ champion: standings[1]!, standings, myFinish: { partyId: mine, rank: standings.findIndex(r => r.partyId === mine) + 1 }, awards: [] })
  const final: Playoffs = {
    format: { spots: 2, rounds: 1 },
    provisional: false,
    seeds: [seed('a', 1), seed('b', 2)],
    rounds: [{ round: 1, week: 15, name: 'Final', games: [{ high: seed('a', 1, 90), low: seed('b', 2, 110), winner: 'b' }], byes: [] }],
    champion: ref('b')
  }
  const league = detail({ status: 'complete', name: 'Bracket League', playoffs: { spots: 2, rounds: 1 } })

  it('puts the finalists on the podium and the regular season below', async () => {
    const api = fakeApi({ getFinale: vi.fn().mockResolvedValue(finale('a')), getPlayoffs: vi.fn().mockResolvedValue(final) })
    const wrapper = await mountLeague(FinaleView, api, league)
    expect(wrapper.find('.champion-name').text()).toBe('Party b')
    expect(wrapper.findAll('.podium .step-name').map(n => n.text())).toEqual(['Party a', 'Party b'])
    expect(wrapper.find('.my-line').text()).toBe('You finished the regular season 1st of 3 · 11–3')
    expect(wrapper.find('.my-line').classes()).not.toContain('won')
    expect(wrapper.text()).toContain('Regular season')
  })

  it('celebrates the champion even when they weren’t first', async () => {
    const api = fakeApi({ getFinale: vi.fn().mockResolvedValue(finale('b')), getPlayoffs: vi.fn().mockResolvedValue(final) })
    const wrapper = await mountLeague(FinaleView, api, league)
    expect(wrapper.find('.my-line').text()).toBe('Your party are the champions!')
    expect(wrapper.find('.my-line').classes()).toContain('won')
  })
})
