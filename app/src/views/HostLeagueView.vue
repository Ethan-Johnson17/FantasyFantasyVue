<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../api/inject'
import type { Cadence, CreateLeagueInput, CrossoverRules, LeagueMode, Visibility } from '../api/types'
import FormError from '../components/FormError.vue'
import PartyFields from '../components/PartyFields.vue'
import { DEFAULT_CREST } from '../crests'

const api = useApi()
const router = useRouter()

const form = reactive<CreateLeagueInput>({
  name: '',
  visibility: 'private',
  cadence: 'daily',
  maxParties: 6,
  mode: 'classic',
  party: { name: '', crest: { ...DEFAULT_CREST } }
})
// Matches the API's MIN_PARTIES..MAX_PARTIES (api/src/modules/leagues/league.model.ts)
const sizes = Array.from({ length: 11 }, (_, i) => i + 2)
const cadences: { value: Cadence; label: string; hint: string }[] = [
  { value: 'daily', label: 'Daily', hint: 'Season in two weeks' },
  { value: 'weekly', label: 'Weekly', hint: 'Like a real season' }
]
const visibilities: { value: Visibility; label: string; hint: string }[] = [
  { value: 'private', label: 'Private', hint: 'Join by PIN only' },
  { value: 'public', label: 'Public', hint: 'Listed for anyone' }
]

// Crossover shows as a choice only once it's switched on for everyone (GET /api/rules).
const crossover = ref<CrossoverRules | null>(null)
onMounted(async () => {
  try {
    const rules = await api.getRules()
    crossover.value = rules.crossover?.available ? rules.crossover : null
  } catch {
    // Without the rules, Classic is the only choice, as before.
  }
})
const modes: { value: LeagueMode; label: string; hint: string }[] = [
  { value: 'classic', label: 'Classic', hint: 'Heroes hide the real players behind them. Plays any time.' },
  { value: 'crossover', label: 'Crossover', hint: 'Real NFL players this season. Football and a D&D quest each week.' }
]

const submitting = ref(false)
const error = ref<unknown>(null)

async function submit() {
  submitting.value = true
  error.value = null
  try {
    const league = await api.createLeague(form)
    await router.push(`/leagues/${league.id}`)
  } catch (caught) {
    error.value = caught
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <RouterLink to="/leagues" class="back-link">‹ Cancel</RouterLink>
      <h1 class="title">Host a league</h1>
    </header>

    <form class="form" @submit.prevent="submit">
      <div class="field">
        <label for="league-name">League name</label>
        <input id="league-name" v-model.trim="form.name" class="input" maxlength="50" required autocomplete="off" />
      </div>

      <PartyFields v-model="form.party" />

      <fieldset class="choice">
        <legend class="field-label">Parties</legend>
        <div class="sizes">
          <label v-for="size in sizes" :key="size" class="size" :class="{ on: form.maxParties === size }">
            <input v-model="form.maxParties" class="visually-hidden" type="radio" name="size" :value="size" />
            {{ size }}
          </label>
        </div>
        <span class="muted hint">With an odd number of parties, one battles the dungeon monster each week.</span>
      </fieldset>

      <fieldset v-if="crossover" class="choice">
        <legend class="field-label">Game</legend>
        <div class="pair">
          <label v-for="option in modes" :key="option.value" class="option" :class="{ on: (form.mode ?? 'classic') === option.value }">
            <span class="option-title"><input v-model="form.mode" type="radio" name="mode" :value="option.value" />{{ option.label }}</span>
            <span class="muted hint">{{ option.hint }}</span>
          </label>
        </div>
      </fieldset>

      <p v-if="form.mode === 'crossover' && crossover" class="note small-note">
        Crossover follows the real NFL schedule: each week's battles go final the Tuesday after its games, through NFL week
        {{ crossover.lastWeek }}. Each week has two boards: Gridiron (your football lineup's fantasy points) and Quest (a party
        of {{ crossover.quest.partySize }} heroes against a monster). <RouterLink to="/how-it-works#crossover">How it works</RouterLink>
      </p>
      <fieldset v-else class="choice">
        <legend class="field-label">Battles resolve</legend>
        <div class="pair">
          <label v-for="option in cadences" :key="option.value" class="option" :class="{ on: form.cadence === option.value }">
            <span class="option-title"><input v-model="form.cadence" type="radio" name="cadence" :value="option.value" />{{ option.label }}</span>
            <span class="muted hint">{{ option.hint }}</span>
          </label>
        </div>
      </fieldset>

      <fieldset class="choice">
        <legend class="field-label">Who can find it</legend>
        <div class="pair">
          <label v-for="option in visibilities" :key="option.value" class="option" :class="{ on: form.visibility === option.value }">
            <span class="option-title"><input v-model="form.visibility" type="radio" name="visibility" :value="option.value" />{{ option.label }}</span>
            <span class="muted hint">{{ option.hint }}</span>
          </label>
        </div>
      </fieldset>

      <FormError :error="error" />

      <button type="submit" class="btn btn-primary submit" :disabled="submitting">
        {{ submitting ? 'Creating…' : 'Create league' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.title {
  font-size: 32px;
}
.small-note {
  margin: 0;
  font-size: 14px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.choice {
  margin: 0;
  padding: 0;
  border: 0;
}
legend {
  margin-bottom: 6px;
}
/* 2 to 12 as two rows of six, so each size stays a full tap target on a phone. */
.sizes {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}
.size {
  min-height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #4a3f55;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.size.on {
  border-color: var(--gold);
  background: var(--gold);
  color: var(--on-gold);
  font-weight: 700;
}
.size:focus-within,
.option:focus-within {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.option {
  min-height: 56px;
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border: 1px solid #4a3f55;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.option.on {
  border-color: var(--gold);
  background: var(--surface-raised);
}
.option-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}
.option-title input {
  accent-color: var(--gold);
}
.hint {
  font-size: 13px;
}
.submit {
  margin-top: 4px;
}
</style>
