import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ApiError } from '../src/api/client'
import CrestPicker from '../src/components/CrestPicker.vue'
import CrestShield from '../src/components/CrestShield.vue'
import type { Crest } from '../src/crests'
import HostLeagueView from '../src/views/HostLeagueView.vue'
import JoinLeagueView from '../src/views/JoinLeagueView.vue'
import LeaguesView from '../src/views/LeaguesView.vue'
import { DEFAULT_DISPLAY_NAME, useSessionStore } from '../src/stores/session'
import { detail, fakeApi, mountView, myLeague, summary } from './helpers'

vi.mock('@auth0/auth0-vue', () => ({ useAuth0: () => ({ logout: vi.fn(), user: ref(null) }) }))

describe('CrestPicker', () => {
  it('updates the crest when an emblem or banner is chosen', async () => {
    const crest = ref<Crest>({ emblem: 'crown', banner: 'crimson' })
    const wrapper = mount(CrestPicker, {
      props: { modelValue: crest.value, 'onUpdate:modelValue': (value: Crest) => (crest.value = value) }
    })
    await wrapper.find('input[value="moon"]').trigger('change')
    await wrapper.setProps({ modelValue: crest.value })
    await wrapper.find('input[name="banner"][value="emerald"]').trigger('change')
    expect(crest.value).toEqual({ emblem: 'moon', banner: 'emerald', accent: null, mascotPrimary: null, mascotSecondary: null })
    await wrapper.setProps({ modelValue: crest.value })
    expect(wrapper.text()).toContain('Emerald Moon')
  })

  function mountPicker(start: Crest) {
    const crest = ref<Crest>(start)
    const wrapper = mount(CrestPicker, {
      props: {
        modelValue: crest.value,
        'onUpdate:modelValue': async (value: Crest) => {
          crest.value = value
          await wrapper.setProps({ modelValue: value })
        }
      }
    })
    return { crest, wrapper }
  }

  it('groups heraldry and mascots', () => {
    const { wrapper } = mountPicker({ emblem: 'crown', banner: 'crimson' })
    expect(wrapper.findAll('.group-name').map(group => group.text())).toEqual(['Heraldry', 'Mascots'])
    expect(wrapper.findAll('.emblems')[1]!.text()).toContain('Dragon')
    expect(wrapper.findAll('.emblems')[1]!.findAll('img.mascot')).toHaveLength(12)
    expect(wrapper.findAll('.emblems')[0]!.text()).not.toContain('Dragon')
  })

  it('starts a pattern with a second color, and plain clears it', async () => {
    const { crest, wrapper } = mountPicker({ emblem: 'dragon', banner: 'obsidian' })
    expect(wrapper.find('input[name="accent"]').exists()).toBe(false)
    await wrapper.find('input[name="pattern"][value="chevron"]').trigger('change')
    expect(crest.value).toMatchObject({ pattern: 'chevron', accent: 'amber' })
    expect(wrapper.text()).toContain('Obsidian and Amber Dragon')
    // The banner's own color can't be the second color.
    expect(wrapper.find('input[name="accent"][value="obsidian"]').attributes('disabled')).toBeDefined()
    await wrapper.find('input[name="accent"][value="sapphire"]').trigger('change')
    expect(crest.value.accent).toBe('sapphire')
    await wrapper.find('input[name="pattern"][value="plain"]').trigger('change')
    expect(crest.value).toMatchObject({ pattern: 'plain', accent: null })
    expect(wrapper.find('input[name="accent"]').exists()).toBe(false)
  })

  it('starts a gold banner with a dark second color', async () => {
    const { crest, wrapper } = mountPicker({ emblem: 'wolf', banner: 'amber' })
    await wrapper.find('input[name="pattern"][value="split"]').trigger('change')
    expect(crest.value.accent).toBe('obsidian')
  })

  it('offers mascot colors only for mascots, and clears them for heraldry', async () => {
    const { crest, wrapper } = mountPicker({ emblem: 'crown', banner: 'crimson' })
    expect(wrapper.find('input[name="mascotPrimary"]').exists()).toBe(false)
    await wrapper.find('input[name="emblem"][value="tiger"]').trigger('change')
    expect(wrapper.find('input[name="mascotPrimary"][value=""]').attributes('checked')).toBeDefined()
    await wrapper.find('input[name="mascotPrimary"][value="white"]').trigger('change')
    await wrapper.find('input[name="mascotSecondary"][value="black"]').trigger('change')
    expect(crest.value).toMatchObject({ emblem: 'tiger', mascotPrimary: 'white', mascotSecondary: 'black' })
    // Another mascot keeps the colors; back to the art's own with Original.
    await wrapper.find('input[name="emblem"][value="fox"]').trigger('change')
    expect(crest.value).toMatchObject({ emblem: 'fox', mascotPrimary: 'white' })
    await wrapper.find('input[name="mascotPrimary"][value=""]').trigger('change')
    expect(crest.value.mascotPrimary).toBeNull()
    await wrapper.find('input[name="emblem"][value="oak"]').trigger('change')
    expect(crest.value).toMatchObject({ emblem: 'oak', mascotPrimary: null, mascotSecondary: null })
    expect(wrapper.find('input[name="mascotPrimary"]').exists()).toBe(false)
  })

  it('swaps the colors when the banner takes the second color', async () => {
    const { crest, wrapper } = mountPicker({ emblem: 'knight', banner: 'crimson', pattern: 'split', accent: 'amber' })
    await wrapper.find('input[name="banner"][value="amber"]').trigger('change')
    expect(crest.value).toMatchObject({ banner: 'amber', accent: 'crimson', pattern: 'split' })
  })
})

describe('CrestShield', () => {
  it('draws the second color only on a patterned shield', () => {
    const plain = mount(CrestShield, { props: { crest: { emblem: 'oak', banner: 'emerald' } } })
    expect(plain.find('clipPath').exists()).toBe(false)
    const split = mount(CrestShield, { props: { crest: { emblem: 'oak', banner: 'emerald', pattern: 'split', accent: 'amber' } } })
    const accent = split.find('path[clip-path]')
    expect(accent.attributes('fill')).toBe('#A97A1F')
    expect(accent.attributes('clip-path')).toBe(`url(#${split.find('clipPath').attributes('id')})`)
    // An accent matching the banner can't show, so the shield stays plain.
    const same = mount(CrestShield, { props: { crest: { emblem: 'oak', banner: 'emerald', pattern: 'split', accent: 'emerald' } } })
    expect(same.find('path[clip-path]').exists()).toBe(false)
  })

  it('draws a mascot from its art, outlined and clipped to the shield', () => {
    const mascot = mount(CrestShield, { props: { crest: { emblem: 'wolf', banner: 'obsidian' } } })
    const image = mascot.find('use')
    expect(image.attributes('href')).toMatch(/wolf.*#m$/)
    expect(image.attributes('style')).toBeUndefined()
    // The clip and outline wrap the art, so the art's x/y don't shift them
    const wrap = mascot.find('g')
    expect(wrap.find('use').exists()).toBe(true)
    expect(wrap.attributes('filter')).toBe(`url(#${mascot.find('filter').attributes('id')})`)
    expect(wrap.attributes('clip-path')).toBe(`url(#${mascot.find('clipPath').attributes('id')})`)
    expect(image.attributes('clip-path')).toBeUndefined()
    expect(mascot.find('g path').exists()).toBe(false)
    expect(mascot.attributes('aria-label')).toBe('Obsidian Wolf crest')
  })

  it('recolors a mascot through the variables its art reads', () => {
    const tinted = mount(CrestShield, { props: { crest: { emblem: 'wolf', banner: 'obsidian', mascotSecondary: 'crimson' } } })
    const style = tinted.find('use').attributes('style') ?? ''
    expect(style).toContain('--m2-0: #B4432F')
    expect(style).not.toContain('--m1-')
  })
})

describe('HostLeagueView', () => {
  it('creates the league with the chosen settings and opens it', async () => {
    const api = fakeApi({ createLeague: vi.fn().mockResolvedValue(detail({ id: 'new-league' })) })
    const { wrapper, router } = await mountView(HostLeagueView, api)

    await wrapper.find('#league-name').setValue('  Office Dungeon ')
    await wrapper.find('#party-name').setValue('Dragon Slayers')
    await wrapper.find('input[name="size"][value="4"]').setValue(true)
    await wrapper.find('input[name="cadence"][value="weekly"]').setValue(true)
    await wrapper.find('button[aria-expanded]').trigger('click')
    await wrapper.find('input[value="tower"]').trigger('change')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.createLeague).toHaveBeenCalledWith({
      name: 'Office Dungeon',
      visibility: 'private',
      cadence: 'weekly',
      maxParties: 4,
      mode: 'classic',
      playoffs: true,
      party: { name: 'Dragon Slayers', crest: { emblem: 'tower', banner: 'crimson', pattern: 'plain', accent: null, mascotPrimary: null, mascotSecondary: null } }
    })
    expect(router.currentRoute.value.fullPath).toBe('/leagues/new-league')
  })

  it('offers leagues of 2 to 12 parties', async () => {
    const api = fakeApi({ createLeague: vi.fn().mockResolvedValue(detail({ id: 'big' })) })
    const { wrapper } = await mountView(HostLeagueView, api)
    expect(wrapper.findAll('input[name="size"]').map(input => Number(input.attributes('value')))).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    await wrapper.find('#league-name').setValue('Big Dungeon')
    await wrapper.find('#party-name').setValue('Dragon Slayers')
    await wrapper.find('input[name="size"][value="12"]').setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createLeague).toHaveBeenCalledWith(expect.objectContaining({ maxParties: 12 }))
  })

  it("shows the server's message when creation fails", async () => {
    const api = fakeApi({ createLeague: vi.fn().mockRejectedValue(new ApiError(400, 'Invalid request', [{ path: 'name', message: 'Too long' }])) })
    const { wrapper } = await mountView(HostLeagueView, api)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('Invalid request')
    expect(wrapper.find('[role="alert"]').text()).toContain('name: Too long')
  })
})

describe('JoinLeagueView', () => {
  it('normalizes the PIN, previews the league, then joins it', async () => {
    const api = fakeApi({
      previewLeague: vi.fn().mockResolvedValue(summary({ name: 'Office Dungeon' })),
      joinLeague: vi.fn().mockResolvedValue(detail({ id: 'joined' }))
    })
    const { wrapper, router } = await mountView(JoinLeagueView, api)

    const pin = wrapper.find('#pin')
    ;(pin.element as HTMLInputElement).value = 'k7q-x4m'
    await pin.trigger('input')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.previewLeague).toHaveBeenCalledWith('K7QX4M')
    expect(wrapper.text()).toContain('Office Dungeon')

    await wrapper.find('#party-name').setValue('Moonlit Pact')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.joinLeague).toHaveBeenCalledWith('K7QX4M', { name: 'Moonlit Pact', crest: { emblem: 'crown', banner: 'crimson', pattern: 'plain', accent: null, mascotPrimary: null, mascotSecondary: null } })
    expect(router.currentRoute.value.fullPath).toBe('/leagues/joined')
  })

  it('prefills the PIN from an invite link and explains a closed league', async () => {
    const api = fakeApi({ previewLeague: vi.fn().mockResolvedValue(summary({ status: 'drafting' })) })
    const { wrapper } = await mountView(JoinLeagueView, api, '/?pin=k7qx4m')
    expect((wrapper.find('#pin').element as HTMLInputElement).value).toBe('K7QX4M')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain("isn't taking new parties")
    expect(wrapper.find('#party-name').exists()).toBe(false)
  })

  it('shows when no league matches the PIN', async () => {
    const api = fakeApi({ previewLeague: vi.fn().mockRejectedValue(new ApiError(404, 'No league found with that PIN')) })
    const { wrapper } = await mountView(JoinLeagueView, api, '/?pin=ZZZZZZ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('No league found with that PIN')
  })
})

describe('LeaguesView', () => {
  it('describes each league by its stage', async () => {
    const soon = new Date(Date.now() + 2 * 3_600_000).toISOString()
    const api = fakeApi({
      listMyLeagues: vi.fn().mockResolvedValue([
        myLeague({ id: 'a', name: 'Active League', status: 'active', weekOneAt: soon, resolvedWeeks: 0 }),
        myLeague({ id: 'd', name: 'Draft League', status: 'drafting', draftAt: soon }),
        myLeague({ id: 'f', name: 'Forming League', status: 'forming', isHost: true, partyCount: 3, maxParties: 6 })
      ])
    })
    const { wrapper } = await mountView(LeaguesView, api)
    await flushPromises()

    const cards = wrapper.findAll('.league')
    expect(cards).toHaveLength(3)
    expect(cards[0]!.text()).toContain('Week 1')
    expect(cards[0]!.text()).toMatch(/Next battle in 1h \d+m/)
    expect(cards[1]!.text()).toContain('Rank your heroes before the draft')
    expect(cards[2]!.text()).toContain('3 of 6 parties')
    expect(cards[2]!.text()).toContain('K7QX4M')
    expect(cards[2]!.findAll('.slot.filled')).toHaveLength(3)
  })

  it('shows unread chat on each league, capped at 9+', async () => {
    const api = fakeApi({
      listMyLeagues: vi.fn().mockResolvedValue([
        myLeague({ id: 'a', name: 'Quiet League', status: 'forming' }),
        myLeague({ id: 'b', name: 'Chatty League', status: 'forming', unreadChat: 3 }),
        myLeague({ id: 'c', name: 'Very Chatty League', status: 'forming', unreadChat: 10 })
      ])
    })
    const { wrapper } = await mountView(LeaguesView, api)
    await flushPromises()
    expect(wrapper.findAll('.league').map(card => card.find('.unread').exists() ? card.find('.unread').text() : null)).toEqual([null, '3 new', '9+ new'])
  })

  it('asks players without a real name to choose one, then hides the prompt', async () => {
    const api = fakeApi({ updateAccount: vi.fn().mockResolvedValue({ id: 'a1', displayName: 'Alaric' }) })
    const { wrapper } = await mountView(LeaguesView, api)
    const session = useSessionStore()
    session.account = { id: 'a1', displayName: DEFAULT_DISPLAY_NAME }
    await flushPromises()

    await wrapper.find('#display-name').setValue('  Alaric ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateAccount).toHaveBeenCalledWith({ displayName: 'Alaric' })
    expect(wrapper.find('#display-name').exists()).toBe(false)
  })

  it('welcomes players with no leagues yet', async () => {
    const { wrapper } = await mountView(LeaguesView, fakeApi())
    await flushPromises()
    expect(wrapper.text()).toContain("You haven't joined a league yet")
  })
})
