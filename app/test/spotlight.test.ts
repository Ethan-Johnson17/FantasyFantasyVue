import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { MyLeague, PartyOutlook } from '../src/api/types'
import { pickSpotlight } from '../src/spotlight'
import LeaguesView from '../src/views/LeaguesView.vue'
import { fakeApi, mountView, myLeague } from './helpers'

vi.mock('@auth0/auth0-vue', () => ({ useAuth0: () => ({ logout: vi.fn(), user: ref(null) }) }))

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()
const battle = (overrides: Partial<NonNullable<PartyOutlook['nextBattle']>> = {}): NonNullable<PartyOutlook['nextBattle']> => ({
  week: 3,
  at: inHours(5),
  opponent: { name: 'Ember Wolves', crest: { emblem: 'flame', banner: 'amber' } },
  monster: null,
  noChampion: false,
  restingStarters: 0,
  ...overrides
})
const active = (id: string, nextBattle: PartyOutlook['nextBattle'], extra: Partial<MyLeague> = {}) =>
  myLeague({ id, name: `League ${id}`, status: 'active', resolvedWeeks: 2, outlook: { ranking: null, nextBattle, lastBattle: null }, ...extra })

describe('pickSpotlight', () => {
  it('picks whatever happens soonest, battle or draft', () => {
    const later = active('a', battle({ at: inHours(30) }))
    const draft = myLeague({ id: 'd', status: 'drafting', draftAt: inHours(2) })
    const soon = active('b', battle({ at: inHours(5) }))
    expect(pickSpotlight([later, draft, soon])).toMatchObject({ kind: 'draft', league: { id: 'd' } })
    expect(pickSpotlight([later, soon])).toMatchObject({ kind: 'battle', league: { id: 'b' } })
  })

  it('falls back to a league I host that is still gathering, and otherwise nothing', () => {
    const joined = myLeague({ id: 'f1', status: 'forming', isHost: false })
    const hosting = myLeague({ id: 'f2', status: 'forming', isHost: true })
    expect(pickSpotlight([joined, hosting])).toMatchObject({ kind: 'gather', league: { id: 'f2' } })
    expect(pickSpotlight([joined, myLeague({ status: 'complete' })])).toBeNull()
    expect(pickSpotlight([])).toBeNull()
  })
})

describe('My leagues spotlight', () => {
  it('leads with the next battle and flags what needs fixing', async () => {
    const league = active('a', battle({ noChampion: true, restingStarters: 2 }), {
      standing: { rank: 2, wins: 1, losses: 1, draws: 0 },
      outlook: {
        ranking: null,
        nextBattle: battle({ noChampion: true, restingStarters: 2 }),
        lastBattle: { week: 2, outcome: 'win', myTotal: 112.4, theirTotal: 98, opponentName: 'Grimjaw' }
      }
    })
    const { wrapper } = await mountView(LeaguesView, fakeApi({ listMyLeagues: vi.fn().mockResolvedValue([league]) }))
    await flushPromises()

    const spot = wrapper.find('.spotlight')
    expect(spot.text()).toMatch(/Up next · League a/)
    expect(spot.text()).toMatch(/Dragon Slayers\s*vs\s*Ember Wolves/)
    expect(spot.text()).toMatch(/Week 3 · battle in 4h \d+m|Week 3 · battle in 5h/)
    expect(spot.findAll('.alert').map(a => a.text())).toEqual(['♛ No Champion named', '2 starters resting'])
    expect(spot.findAll('a').map(a => a.attributes('href'))).toEqual(['/leagues/a/battles/upcoming', '/leagues/a/party'])

    // The card shows rank, record, and the last result, and opens where its call to action points.
    const card = wrapper.find('.league')
    expect(card.text()).toContain('2nd · 1–1')
    expect(card.text()).toContain('Victory 112–98 vs Grimjaw')
    expect(card.text()).toContain('Name a Champion ›')
    expect(card.attributes('href')).toBe('/leagues/a/party')
  })

  it('shows the monster when there is no opponent, and a ready lineup', async () => {
    const league = active('a', battle({ opponent: null, monster: 'Grimjaw' }))
    const { wrapper } = await mountView(LeaguesView, fakeApi({ listMyLeagues: vi.fn().mockResolvedValue([league]) }))
    await flushPromises()
    expect(wrapper.find('.spotlight').text()).toContain('Grimjaw')
    expect(wrapper.find('.alert.ok').text()).toBe('✓ Lineup ready')
    expect(wrapper.find('.league').attributes('href')).toBe('/leagues/a')
  })

  it('counts down to a draft with ranking progress', async () => {
    const league = myLeague({ id: 'd', status: 'drafting', draftAt: inHours(3), outlook: { ranking: { ranked: 23, pool: 92 }, nextBattle: null, lastBattle: null } })
    const { wrapper } = await mountView(LeaguesView, fakeApi({ listMyLeagues: vi.fn().mockResolvedValue([league]) }))
    await flushPromises()
    const spot = wrapper.find('.spotlight')
    expect(spot.text()).toContain("You've ranked 23 of 92 heroes.")
    expect(spot.find('.progress-fill').attributes('style')).toContain('width: 25%')
    expect(wrapper.find('.league').text()).toContain('Ranked 23 of 92 heroes ›')
    expect(wrapper.find('.league').attributes('href')).toBe('/leagues/d/heroes')
  })

  it('reminds a host to share the PIN while gathering', async () => {
    const league = myLeague({ id: 'f', status: 'forming', isHost: true, partyCount: 2, maxParties: 6 })
    const { wrapper } = await mountView(LeaguesView, fakeApi({ listMyLeagues: vi.fn().mockResolvedValue([league]) }))
    await flushPromises()
    expect(wrapper.find('.spotlight').text()).toContain('2 of 6 parties have joined')
    expect(wrapper.find('.spot-pin').text()).toBe('K7QX4M')
  })
})
