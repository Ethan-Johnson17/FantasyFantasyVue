import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import SignInView from '../src/views/SignInView.vue'
import { fakeApi, mountView } from './helpers'

const auth = vi.hoisted(() => ({ error: null as unknown, loginWithRedirect: null as unknown }))
vi.mock('@auth0/auth0-vue', () => ({
  useAuth0: () => ({ error: auth.error, loginWithRedirect: auth.loginWithRedirect })
}))

describe('SignInView', () => {
  it("shows Auth0's reason when a sign-in comes back with an error", async () => {
    auth.error = ref(new Error('Client is not authorized to access resource server'))
    auth.loginWithRedirect = vi.fn()
    const { wrapper } = await mountView(SignInView, fakeApi())
    expect(wrapper.find('[role="alert"]').text()).toContain('Client is not authorized to access resource server')
  })

  it('shows no error normally, and sends players back where they were headed after sign-in', async () => {
    auth.error = ref(undefined)
    const login = vi.fn().mockResolvedValue(undefined)
    auth.loginWithRedirect = login
    const { wrapper } = await mountView(SignInView, fakeApi(), '/?next=/join%3Fpin%3DK7QX4M')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await wrapper.find('button').trigger('click')
    expect(login).toHaveBeenCalledWith({ appState: { target: '/join?pin=K7QX4M' } })
  })

  it.each(['https://evil.example', '//evil.example', 'javascript:alert(1)'])('ignores off-site redirect target %s', async next => {
    auth.error = ref(undefined)
    const login = vi.fn().mockResolvedValue(undefined)
    auth.loginWithRedirect = login
    const { wrapper } = await mountView(SignInView, fakeApi(), `/?next=${encodeURIComponent(next)}`)
    await wrapper.find('button').trigger('click')
    expect(login).toHaveBeenCalledWith({ appState: { target: '/leagues' } })
  })
})
