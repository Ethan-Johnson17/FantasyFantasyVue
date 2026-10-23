<script setup lang="ts">
import { useAuth0 } from '@auth0/auth0-vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { MINIMUM_AGE } from '../privacy'

const { loginWithRedirect, error } = useAuth0()
const route = useRoute()

/** Errors Auth0 sends back to the app (e.g. a misconfigured application) instead of silently dropping them. */
const signInError = computed(() => {
  const value: unknown = error.value
  if (!value) return ''
  const message = value instanceof Error ? value.message : String(value)
  return message || 'Sign-in did not complete.'
})

/** Only same-site paths: "/join" yes, "//evil.example" or "https://…" no. */
function safeNext(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/leagues'
}

function signIn() {
  const next = safeNext(route.query.next)
  void loginWithRedirect({ appState: { target: next } })
}
</script>

<template>
  <main class="page sign-in">
    <div class="hero">
      <svg width="96" height="96" viewBox="0 0 64 64" fill="none" stroke="var(--gold)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M32 5l22 8v16c0 14-9.5 23-22 30C19.5 52 10 43 10 29V13z" />
        <path d="M32 11l17 6v12c0 11-7.3 18.3-17 24-9.7-5.7-17-13-17-24V17z" stroke="var(--line-strong)" />
        <path d="M32 20l3.4 7 7.6.9-5.6 5.2 1.5 7.6L32 37l-6.9 3.7 1.5-7.6-5.6-5.2 7.6-.9z" />
      </svg>
      <h1>FantasyFantasy</h1>
      <p class="muted pitch">Draft a party of heroes and battle your friends each week.</p>
    </div>

    <div class="actions">
      <p v-if="signInError" class="error" role="alert">Sign-in didn't complete: {{ signInError }}</p>
      <button type="button" class="btn btn-primary" @click="signIn">Sign in or create an account</button>
      <p class="muted fine-print">Free to play. No wagering, ever. <RouterLink to="/how-it-works">How it works</RouterLink></p>
      <p class="muted fine-print">You must be {{ MINIMUM_AGE }} or older to play. <RouterLink to="/privacy">Privacy policy</RouterLink></p>
    </div>
  </main>
</template>

<style scoped>
.sign-in {
  justify-content: space-between;
}
.hero {
  margin-top: 18vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  text-align: center;
}
h1 {
  font-size: 44px;
  line-height: 1;
}
.pitch {
  margin: 0;
  font-size: 17px;
  line-height: 1.45;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 16px;
}
.fine-print {
  margin: 0;
  font-size: 13px;
  text-align: center;
}
</style>
