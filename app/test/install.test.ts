import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InstallCard from '../src/components/InstallCard.vue'
import { resetInstallStateForTest, startInstallSupport, useInstall } from '../src/install'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1'

/** A window with just what install.ts uses. */
function fakeWindow({ userAgent = ANDROID, standalone = false, serviceWorker = true } = {}) {
  const target = new EventTarget()
  const register = vi.fn().mockResolvedValue(undefined)
  const win = {
    addEventListener: target.addEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    matchMedia: (query: string) => ({ matches: standalone && query.includes('standalone') }),
    localStorage: window.localStorage,
    navigator: { userAgent, maxTouchPoints: 5, ...(serviceWorker ? { serviceWorker: { register } } : {}) }
  }
  return { win: win as unknown as Window, fire: (event: Event) => target.dispatchEvent(event), register }
}

/** The browser's install event, with a user who answers `outcome`. */
function installEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome })
  })
  return event
}

beforeEach(() => {
  window.localStorage.clear()
  resetInstallStateForTest()
})

describe('install support', () => {
  it('holds the browser install prompt for our own button, and uses it once', async () => {
    const { win, fire } = fakeWindow()
    startInstallSupport(win, false)
    const install = useInstall(win)
    expect(install.canPrompt.value).toBe(false)

    const event = installEvent('accepted')
    fire(event)
    expect(event.defaultPrevented).toBe(true)
    expect(install.canPrompt.value).toBe(true)
    expect(install.showIosSteps.value).toBe(false)

    await install.install()
    expect(event.prompt).toHaveBeenCalledOnce()
    expect(install.canPrompt.value).toBe(false)
  })

  it('stops offering once installed or dismissed, and remembers a dismissal', () => {
    const { win, fire } = fakeWindow()
    startInstallSupport(win, false)
    fire(installEvent())
    useInstall(win).dismiss()
    expect(useInstall(win).canPrompt.value).toBe(false)
    expect(window.localStorage.getItem('ff.installDismissed')).toBe('1')

    resetInstallStateForTest() // a later visit
    fire(installEvent())
    expect(useInstall(win).canPrompt.value).toBe(false)

    window.localStorage.clear()
    resetInstallStateForTest()
    fire(installEvent())
    fire(new Event('appinstalled'))
    expect(useInstall(win).canPrompt.value).toBe(false)
  })

  it('shows Add to Home Screen steps on iPhone, and nothing when already installed', () => {
    expect(useInstall(fakeWindow({ userAgent: IPHONE }).win).showIosSteps.value).toBe(true)
    expect(useInstall(fakeWindow({ userAgent: IPHONE, standalone: true }).win).showIosSteps.value).toBe(false)
    expect(useInstall(fakeWindow({ userAgent: ANDROID }).win).showIosSteps.value).toBe(false)
  })

  it('registers the service worker only when asked (production builds)', () => {
    const prod = fakeWindow()
    startInstallSupport(prod.win, true)
    prod.fire(new Event('load'))
    expect(prod.register).toHaveBeenCalledWith('/sw.js')

    const dev = fakeWindow()
    startInstallSupport(dev.win, false)
    dev.fire(new Event('load'))
    expect(dev.register).not.toHaveBeenCalled()

    const old = fakeWindow({ serviceWorker: false })
    expect(() => {
      startInstallSupport(old.win, true)
      old.fire(new Event('load'))
    }).not.toThrow()
  })
})

describe('InstallCard', () => {
  it('offers Install when the browser allows it, and disappears once installed', async () => {
    const { win, fire } = fakeWindow()
    startInstallSupport(win, false)
    const event = installEvent('accepted')
    fire(event)
    const wrapper = mount(InstallCard)
    expect(wrapper.text()).toContain('Put FantasyFantasy on your home screen')
    await wrapper.findAll('button').find(b => b.text() === 'Install')!.trigger('click')
    await flushPromises()
    expect(event.prompt).toHaveBeenCalled()
    expect(wrapper.find('.install').exists()).toBe(false)
  })

  it('hides for good on Not now', async () => {
    const { win, fire } = fakeWindow()
    startInstallSupport(win, false)
    fire(installEvent())
    const wrapper = mount(InstallCard)
    await wrapper.findAll('button').find(b => b.text() === 'Not now')!.trigger('click')
    expect(wrapper.find('.install').exists()).toBe(false)
    expect(window.localStorage.getItem('ff.installDismissed')).toBe('1')
  })

  it('shows nothing where installing isn’t possible', () => {
    expect(mount(InstallCard).find('.install').exists()).toBe(false)
  })
})
