<script setup lang="ts">
import { useAuth0 } from '@auth0/auth0-vue'
import { ref, watch } from 'vue'
import { useApi } from './api/inject'
import { suggestedDisplayName, useSessionStore } from './stores/session'

const { isLoading, isAuthenticated, user } = useAuth0()
const api = useApi()
const session = useSessionStore()
const accountError = ref('')

// Auth0 reports "signed in" a moment before the profile arrives, so wait for both.
watch(
  [isAuthenticated, user],
  async ([signedIn, profile]) => {
    if (!signedIn || !profile || session.account) return
    try {
      await session.load(api, suggestedDisplayName(profile))
    } catch {
      accountError.value = 'We could not reach the game server. Please try again shortly.'
    }
  },
  { immediate: true }
)
</script>

<template>
  <div v-if="isLoading" class="page" aria-busy="true">
    <p class="muted" style="margin: auto">Opening the tome…</p>
  </div>
  <template v-else>
    <p v-if="accountError" class="error" role="alert" style="margin: 12px">{{ accountError }}</p>
    <RouterView />
  </template>
</template>
