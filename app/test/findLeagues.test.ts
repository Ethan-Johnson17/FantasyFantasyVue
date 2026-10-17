import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import FindLeaguesView from '../src/views/FindLeaguesView.vue'
import JoinLeagueView from '../src/views/JoinLeagueView.vue'
import { fakeApi, mountView, summary } from './helpers'

const open = (id: string, extra: Parameters<typeof summary>[0] = {}) =>
  summary({ id, name: `League ${id}`, visibility: 'public', pin: `PIN${id.toUpperCase()}AA`.slice(0, 6), partyCount: 2, maxParties: 6, ...extra })

describe('Find a league', () => {
  it('lists public leagues with room, and joins through the PIN', async () => {
    const api = fakeApi({ listPublicLeagues: vi.fn().mockResolvedValue([open('a'), open('b', { cadence: 'weekly', partyCount: 5 })]) })
    const { wrapper } = await mountView(FindLeaguesView, api)
    await flushPromises()
    expect(api.listPublicLeagues).toHaveBeenCalledWith(1)
    const cards = wrapper.findAll('.league')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.text()).toContain('4 spots left')
    expect(cards[0]!.text()).toContain('Hosted by Ethan · A battle every day')
    expect(cards[0]!.findAll('.slot.filled')).toHaveLength(2)
    expect(cards[1]!.text()).toContain('1 spot left')
    expect(cards[0]!.find('a.join').attributes('href')).toBe('/join?pin=PINAAA')
  })

  it('filters by pace', async () => {
    const api = fakeApi({ listPublicLeagues: vi.fn().mockResolvedValue([open('a'), open('b', { cadence: 'weekly' })]) })
    const { wrapper } = await mountView(FindLeaguesView, api)
    await flushPromises()
    await wrapper.findAll('.filters .chip').find(c => c.text() === 'Weekly')!.trigger('click')
    expect(wrapper.findAll('.league-name').map(n => n.text())).toEqual(['League b'])
  })

  it('loads more pages while a full page comes back', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => open(`p${String(i)}`))
    const api = fakeApi({ listPublicLeagues: vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce([open('last')]) })
    const { wrapper } = await mountView(FindLeaguesView, api)
    await flushPromises()
    await wrapper.find('button.more').trigger('click')
    await flushPromises()
    expect(api.listPublicLeagues).toHaveBeenLastCalledWith(2)
    expect(wrapper.findAll('.league')).toHaveLength(21)
    expect(wrapper.find('button.more').exists()).toBe(false)
  })

  it('suggests hosting when nothing is open', async () => {
    const { wrapper } = await mountView(FindLeaguesView, fakeApi())
    await flushPromises()
    expect(wrapper.text()).toContain('No public leagues need parties right now.')
    expect(wrapper.find('a.btn-primary').attributes('href')).toBe('/leagues/new')
  })
})

describe('Join with a PIN from a link', () => {
  it('looks the league up right away', async () => {
    const api = fakeApi({ previewLeague: vi.fn().mockResolvedValue(open('a', { pin: 'K7QX4M' })) })
    const { wrapper } = await mountView(JoinLeagueView, api, '/?pin=K7QX4M')
    await flushPromises()
    expect(api.previewLeague).toHaveBeenCalledWith('K7QX4M')
    expect(wrapper.text()).toContain('League a')
  })

  it('waits for a full PIN otherwise', async () => {
    const api = fakeApi()
    await mountView(JoinLeagueView, api, '/?pin=K7Q')
    await flushPromises()
    expect(api.previewLeague).not.toHaveBeenCalled()
  })
})
