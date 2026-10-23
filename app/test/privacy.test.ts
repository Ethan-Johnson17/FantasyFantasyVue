import { describe, expect, it } from 'vitest'
import { MINIMUM_AGE, PRIVACY_CONTACT } from '../src/privacy'
import PrivacyView from '../src/views/PrivacyView.vue'
import { fakeApi, mountView } from './helpers'

describe('Privacy policy', () => {
  it('says what is collected, who handles it, how long it is kept, and how to ask', async () => {
    const { wrapper } = await mountView(PrivacyView, fakeApi())
    const text = wrapper.text()
    expect(text).toContain("we don't store your email address")
    for (const provider of ['Auth0', 'Vercel', 'MongoDB Atlas', 'Google Fonts']) expect(text).toContain(provider)
    expect(text).toContain('deleted 30 days after the season ends')
    expect(text).toContain(`You must be ${String(MINIMUM_AGE)} or older`)
    expect(text).toContain('Delete your account')
    const mail = wrapper.find(`a[href^="mailto:${PRIVACY_CONTACT}"]`)
    expect(mail.exists()).toBe(true)
    expect(mail.text()).toBe(PRIVACY_CONTACT)
  })
})
