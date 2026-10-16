import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import type { ApiClient } from '../api/client'
import type { Account } from '../api/types'

/** The API's default name for new accounts. */
export const DEFAULT_DISPLAY_NAME = 'Adventurer'
export const DISPLAY_NAME_MAX = 40

interface IdentityProfile {
  given_name?: string
  name?: string
}

/**
 * A display name from the identity provider, if it has a real one. Email sign-ups only have
 * the email address, which must never be shown to other players, so they get no suggestion.
 */
export function suggestedDisplayName(profile: IdentityProfile | undefined): string | undefined {
  const candidates = [profile?.given_name, profile?.name]
  const name = candidates.map(value => value?.trim()).find(value => value && !value.includes('@'))
  return name?.slice(0, DISPLAY_NAME_MAX)
}

export const useSessionStore = defineStore('session', () => {
  const account = ref<Account | null>(null)

  /** Loads the signed-in account, replacing the placeholder name with a suggested one if there is one. */
  async function load(api: ApiClient, suggestedName?: string): Promise<Account> {
    let current = await api.getAccount()
    if (current.displayName === DEFAULT_DISPLAY_NAME && suggestedName) {
      current = await api.updateAccount({ displayName: suggestedName })
    }
    account.value = current
    return current
  }

  async function rename(api: ApiClient, displayName: string): Promise<Account> {
    account.value = await api.updateAccount({ displayName: displayName.trim().slice(0, DISPLAY_NAME_MAX) })
    return account.value
  }

  const needsName = () => account.value?.displayName === DEFAULT_DISPLAY_NAME

  return { account, load, rename, needsName }
})

// Swap the store in place during development hot reloads (otherwise screens see a stale copy).
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useSessionStore, import.meta.hot))
