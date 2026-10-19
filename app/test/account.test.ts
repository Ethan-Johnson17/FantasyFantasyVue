import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ApiError } from '../src/api/client'
import { DEFAULT_DISPLAY_NAME, useSessionStore } from '../src/stores/session'
import AccountView from '../src/views/AccountView.vue'
import LeaguesView from '../src/views/LeaguesView.vue'
import { fakeApi, mountView } from './helpers'

const logout = vi.fn()
vi.mock('@auth0/auth0-vue', () => ({ useAuth0: () => ({ logout, user: ref(null) }) }))

beforeEach(() => {
  logout.mockClear()
})

async function mountAccount(displayName: string, api = fakeApi()) {
  const mounted = await mountView(AccountView, api)
  useSessionStore().account = { id: 'a1', displayName }
  await flushPromises()
  return { ...mounted, api }
}

describe('Account page', () => {
  it('shows my name and saves a new one, trimmed', async () => {
    const api = fakeApi({ updateAccount: vi.fn().mockResolvedValue({ id: 'a1', displayName: 'Alaric the Bold' }) })
    const { wrapper } = await mountAccount('Alaric', api)
    expect(wrapper.find('.current-name').text()).toBe('Alaric')
    const input = wrapper.find<HTMLInputElement>('#account-name')
    expect(input.element.value).toBe('Alaric')
    // Nothing to save until the name changes.
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    await input.setValue('  Alaric the Bold ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.updateAccount).toHaveBeenCalledWith({ displayName: 'Alaric the Bold' })
    expect(wrapper.find('.current-name').text()).toBe('Alaric the Bold')
    expect(wrapper.find('[role="status"]').text()).toBe('✓ Name saved.')
  })

  it('asks for a real name when still the placeholder', async () => {
    const { wrapper } = await mountAccount(DEFAULT_DISPLAY_NAME)
    expect(wrapper.find('.current-name').text()).toBe('No name yet')
    expect(wrapper.find<HTMLInputElement>('#account-name').element.value).toBe('')
    expect(wrapper.text()).toContain(`You're still shown as “${DEFAULT_DISPLAY_NAME}”`)
    await wrapper.find('#account-name').setValue('   ')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('shows why a save failed', async () => {
    const api = fakeApi({ updateAccount: vi.fn().mockRejectedValue(new ApiError(400, 'Invalid request')) })
    const { wrapper } = await mountAccount('Alaric', api)
    await wrapper.find('#account-name').setValue('Brannoc')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Invalid request')
    expect(wrapper.find('.current-name').text()).toBe('Alaric')
  })

  it('signs out', async () => {
    const { wrapper } = await mountAccount('Alaric')
    await wrapper.find('button.sign-out').trigger('click')
    expect(logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin } })
  })

  it('is reached from my initial on Your leagues', async () => {
    const { wrapper } = await mountView(LeaguesView, fakeApi())
    useSessionStore().account = { id: 'a1', displayName: 'Alaric' }
    await flushPromises()
    const link = wrapper.find('a[aria-label="Your account"]')
    expect(link.attributes('href')).toBe('/account')
    expect(link.text()).toBe('A')
  })
})
