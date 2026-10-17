<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '../api/inject'
import type { LeagueSummary, PartyInput } from '../api/types'
import FormError from '../components/FormError.vue'
import PartyFields from '../components/PartyFields.vue'
import { DEFAULT_CREST } from '../crests'
import { normalizePin } from '../pin'

const api = useApi()
const route = useRoute()
const router = useRouter()

const pin = ref(normalizePin(typeof route.query.pin === 'string' ? route.query.pin : ''))
const league = ref<LeagueSummary | null>(null)
const party = reactive<PartyInput>({ name: '', crest: { ...DEFAULT_CREST } })
const busy = ref(false)
const error = ref<unknown>(null)

const pinComplete = computed(() => pin.value.length === 6)
const isFull = computed(() => !!league.value && league.value.partyCount >= league.value.maxParties)
const isClosed = computed(() => !!league.value && league.value.status !== 'forming')

function onPinInput(event: Event) {
  pin.value = normalizePin((event.target as HTMLInputElement).value)
  league.value = null
}

async function findLeague() {
  busy.value = true
  error.value = null
  try {
    league.value = await api.previewLeague(pin.value)
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = false
  }
}

// Arriving from an invite or a public league with the PIN already filled in: look it up right away.
onMounted(() => {
  if (pinComplete.value) void findLeague()
})

async function join() {
  busy.value = true
  error.value = null
  try {
    const joined = await api.joinLeague(pin.value, party)
    await router.push(`/leagues/${joined.id}`)
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <RouterLink to="/leagues" class="back-link">‹ Cancel</RouterLink>
      <h1 class="title">Join a league</h1>
    </header>

    <form class="form" @submit.prevent="league ? join() : findLeague()">
      <div class="field">
        <label for="pin">League PIN</label>
        <input
          id="pin"
          :value="pin"
          class="input pin-input"
          inputmode="text"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          maxlength="12"
          aria-describedby="pin-help"
          @input="onPinInput"
        />
        <span id="pin-help" class="muted small">Six letters and numbers from your host. No zeros or O's to mix up.</span>
      </div>

      <button v-if="!league" type="submit" class="btn btn-secondary" :disabled="!pinComplete || busy">
        {{ busy ? 'Searching…' : 'Find league' }}
      </button>

      <template v-if="league">
        <section class="card found" aria-label="League found">
          <div class="eyebrow found-label">League found</div>
          <div class="found-name">{{ league.name }}</div>
          <dl class="facts">
            <div><dt class="muted">Host</dt><dd>{{ league.host.displayName }}</dd></div>
            <div><dt class="muted">Parties</dt><dd>{{ league.partyCount }} of {{ league.maxParties }}</dd></div>
            <div><dt class="muted">Battles</dt><dd>{{ league.cadence === 'daily' ? 'Daily' : 'Weekly' }}</dd></div>
          </dl>
        </section>

        <p v-if="isClosed" class="error" role="status">This league has already started its draft, so it isn't taking new parties.</p>
        <p v-else-if="isFull" class="error" role="status">This league is full.</p>
        <template v-else>
          <PartyFields v-model="party" />
          <p class="note">Once the host schedules the draft, the party list locks, so join before then.</p>
          <button type="submit" class="btn btn-primary" :disabled="busy || !party.name">
            {{ busy ? 'Joining…' : `Join ${league.name}` }}
          </button>
        </template>
      </template>

      <FormError :error="error" />
    </form>
  </main>
</template>

<style scoped>
.title {
  font-size: 32px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.pin-input {
  min-height: 64px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 32px;
  letter-spacing: 0.4em;
  text-align: center;
  border-color: var(--gold);
}
.small {
  font-size: 13px;
}
.found {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-color: var(--line-strong);
}
.found-label {
  color: var(--gold);
  font-size: 12px;
}
.found-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 24px;
}
.facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.facts dt {
  font-size: 12px;
}
.facts dd {
  margin: 0;
  font-weight: 700;
}
</style>
