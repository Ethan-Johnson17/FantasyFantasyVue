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
/** Dynasty, between seasons: the open party being taken over, or null for a new party */
const takeOver = ref<string | null>(null)
const busy = ref(false)
const error = ref<unknown>(null)

const pinComplete = computed(() => pin.value.length === 6)
const openParties = computed(() => league.value?.openParties ?? [])
// Open parties hold their places: a new party needs room beyond them, a takeover doesn't.
const isFull = computed(
  () => !!league.value && !takeOver.value && league.value.partyCount + openParties.value.length >= league.value.maxParties
)

/** Taking over suggests the party's own name and crest; the new member can change them. */
function chooseTakeOver(id: string | null) {
  takeOver.value = id
  const open = openParties.value.find(entry => entry.id === id)
  if (open) {
    party.name = open.name
    party.crest = { ...open.crest }
  }
}
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
    const joined = takeOver.value ? await api.joinLeague(pin.value, party, takeOver.value) : await api.joinLeague(pin.value, party)
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

        <fieldset v-if="openParties.length && !isClosed" class="choice">
          <legend class="field-label">Your party</legend>
          <p class="muted small">This dynasty has parties whose owners left. Take one over to inherit its history and keepers.</p>
          <label class="option" :class="{ on: takeOver === null }">
            <input type="radio" name="take-over" :checked="takeOver === null" @change="chooseTakeOver(null)" /> Start a new party
          </label>
          <label v-for="open in openParties" :key="open.id" class="option" :class="{ on: takeOver === open.id }">
            <input type="radio" name="take-over" :checked="takeOver === open.id" @change="chooseTakeOver(open.id)" /> Take over {{ open.name }}
          </label>
        </fieldset>

        <p v-if="isClosed" class="error" role="status">This league has already started its draft, so it isn't taking new parties.</p>
        <p v-else-if="isFull" class="error" role="status">This league is full.</p>
        <template v-else>
          <PartyFields v-model="party" />
          <p class="note">Once the host schedules the draft, the party list locks, so join before then.</p>
          <button type="submit" class="btn btn-primary" :disabled="busy || !party.name">
            {{ busy ? 'Joining…' : takeOver ? 'Take over and join' : `Join ${league.name}` }}
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
.choice {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.option {
  min-height: var(--tap);
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.option.on {
  border-color: var(--gold);
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
