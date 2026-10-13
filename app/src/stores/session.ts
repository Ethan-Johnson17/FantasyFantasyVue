import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ApiClient } from '../api/client'
import type { Account } from '../api/types'

/** The API's default name for new accounts. */
export const DEFAULT_DISPLAY_NAME = 'Adventurer'

export const useSessionStore = defineStore('session', () => {
  const account = ref<Account | null>(null)

  /**
   * Loads the signed-in account. On first sign-in, replaces the API's placeholder name with
   * the name from the identity provider, if there is one.
   */
  async function load(api: ApiClient, suggestedName?: string): Promise<Account> {
    let current = await api.getAccount()
    const name = suggestedName?.trim().slice(0, 40)
    if (current.displayName === DEFAULT_DISPLAY_NAME && name) {
      current = await api.updateAccount({ displayName: name })
    }
    account.value = current
    return current
  }

  return { account, load }
})
