<script setup lang="ts">
import { useAuth0 } from '@auth0/auth0-vue'
import { computed, ref, watch } from 'vue'
import { useApi } from '../api/inject'
import FormError from '../components/FormError.vue'
import { DEFAULT_DISPLAY_NAME, DISPLAY_NAME_MAX, useSessionStore } from '../stores/session'

/* The signed-in player's account: the display name other players see, and signing out. */

const api = useApi()
const session = useSessionStore()
const { logout } = useAuth0()

const name = ref('')
const saving = ref(false)
const notice = ref('')
const error = ref<unknown>(null)

const current = computed(() => session.account?.displayName ?? '')
const isPlaceholder = computed(() => current.value === DEFAULT_DISPLAY_NAME)
// Start from the saved name; the placeholder starts empty so it's clear a real name is wanted.
watch(
  current,
  value => {
    name.value = value === DEFAULT_DISPLAY_NAME ? '' : value
  },
  { immediate: true }
)

const trimmed = computed(() => name.value.trim())
const canSave = computed(() => !!trimmed.value && trimmed.value !== current.value && !saving.value)
const initial = computed(() => (isPlaceholder.value ? '?' : current.value.charAt(0).toUpperCase()))

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = null
  notice.value = ''
  try {
    await session.rename(api, trimmed.value)
    notice.value = 'Name saved.'
  } catch (caught) {
    error.value = caught
  } finally {
    saving.value = false
  }
}

function signOut() {
  void logout({ logoutParams: { returnTo: window.location.origin } })
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <RouterLink to="/leagues" class="back-link">‹ Your leagues</RouterLink>
      <h1 class="title">Your account</h1>
    </header>

    <p v-if="!session.account" class="muted" aria-busy="true">Loading your account…</p>

    <template v-else>
      <section class="identity">
        <span class="avatar" aria-hidden="true">{{ initial }}</span>
        <div>
          <div class="current-name">{{ isPlaceholder ? 'No name yet' : current }}</div>
          <div class="muted small">Other players in your leagues see this name.</div>
        </div>
      </section>

      <form class="card name-form" @submit.prevent="save">
        <label for="account-name" class="label">Display name</label>
        <p v-if="isPlaceholder" class="note small-note">You're still shown as “{{ DEFAULT_DISPLAY_NAME }}”. Choose a name so friends know it's you.</p>
        <input
          id="account-name"
          v-model="name"
          class="input"
          :maxlength="DISPLAY_NAME_MAX"
          required
          autocomplete="nickname"
          aria-describedby="account-name-help"
        />
        <span id="account-name-help" class="muted small">Up to {{ DISPLAY_NAME_MAX }} characters. Avoid your real full name or email.</span>
        <FormError :error="error" />
        <p v-if="notice" class="saved" role="status">✓ {{ notice }}</p>
        <button type="submit" class="btn btn-primary" :disabled="!canSave">{{ saving ? 'Saving…' : 'Save name' }}</button>
      </form>

      <button type="button" class="btn btn-secondary sign-out" @click="signOut">Sign out</button>
    </template>
  </main>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.small {
  font-size: 13px;
}
.identity {
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.avatar {
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid var(--gold);
  background: var(--surface-raised);
  color: var(--gold);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.current-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
  overflow-wrap: anywhere;
}
.name-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.label {
  font-weight: 700;
}
.small-note {
  margin: 0;
  font-size: 14px;
}
.saved {
  margin: 0;
  color: var(--trait-steadfast);
  font-size: 14px;
}
.sign-out {
  width: 100%;
  margin-top: 20px;
}
</style>
