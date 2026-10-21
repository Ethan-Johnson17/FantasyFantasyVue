<script setup lang="ts">
import { useAuth0 } from '@auth0/auth0-vue'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError, UNREACHABLE_MESSAGE } from './api/client'
import { useApi } from './api/inject'
import { suggestedDisplayName, useSessionStore } from './stores/session'

const { isLoading, isAuthenticated, user, loginWithRedirect } = useAuth0()
const api = useApi()
const route = useRoute()
const session = useSessionStore()
const accountError = ref('')
const signInAgain = ref(false)

// Auth0 reports "signed in" a moment before the profile arrives, so wait for both.
watch(
  [isAuthenticated, user],
  async ([signedIn, profile]) => {
    if (!signedIn || !profile || session.account) return
    try {
      await session.load(api, suggestedDisplayName(profile))
    } catch (caught) {
      signInAgain.value = caught instanceof ApiError && caught.status === 401
      accountError.value = caught instanceof ApiError ? caught.message : UNREACHABLE_MESSAGE
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
    <div v-if="accountError" class="error app-error" role="alert">
      <span>{{ accountError }}</span>
      <button v-if="signInAgain" type="button" class="btn btn-primary" @click="loginWithRedirect({ appState: { target: route.fullPath } })">
        Sign in again
      </button>
    </div>
    <RouterView />
  </template>
</template>

<style scoped>
.app-error {
  margin: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.app-error .btn {
  min-height: 40px;
}
</style>
