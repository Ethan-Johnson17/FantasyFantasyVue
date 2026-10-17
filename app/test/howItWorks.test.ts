import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import HowItWorksView from '../src/views/HowItWorksView.vue'
import { fakeApi, mountView } from './helpers'

const RULES = {
  version: 1,
  seasonWeeks: 14,
  rosterSize: 10,
  starters: 5,
  autoSwapMultiplier: 0.5,
  strategy: { championMultiplier: 1.25, mightyChampionMultiplier: 1.5, orderAndChaosBonus: 0.05, bulwarkFloor: 15 }
}

describe('How it works', () => {
  it("explains the game with the current ruleset's numbers", async () => {
    const api = fakeApi({ getRules: vi.fn().mockResolvedValue(RULES) })
    const { wrapper } = await mountView(HowItWorksView, api)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('Draft a party of 10 heroes')
    expect(text).toContain("1.25× damage (1.5× if they're Mighty)")
    expect(text).toContain('+5% party damage')
    expect(text).toContain('at least 15 damage')
    expect(text).toContain('steps in at 50% damage')
    // The one screen that explains the real season, and credits the data.
    expect(text).toContain('real NFL player')
    expect(text).toContain('you never find out who is behind a hero')
    expect(text).toContain('Stats data provided by nflverse.')
    // Every section in the contents list exists.
    for (const link of wrapper.findAll('.contents a')) {
      expect(wrapper.find(link.attributes('href')!).exists()).toBe(true)
    }
  })

  it('still reads well if the rules fail to load', async () => {
    const api = fakeApi({ getRules: vi.fn().mockRejectedValue(new Error('offline')) })
    const { wrapper } = await mountView(HowItWorksView, api)
    await flushPromises()
    expect(wrapper.text()).toContain('Your Champion deals extra damage')
    expect(wrapper.text()).toContain('reduced damage')
    expect(wrapper.text()).not.toMatch(/undefined|NaN/)
  })
})
