<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../api/inject'
import type { Cadence, CreateLeagueInput, Visibility } from '../api/types'
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
  party: { name: '', crest: { ...DEFAULT_CREST } }
})
const sizes = [2, 3, 4, 5, 6]
const cadences: { value: Cadence; label: string; hint: string }[] = [
  { value: 'daily', label: 'Daily', hint: 'Season in two weeks' },
  { value: 'weekly', label: 'Weekly', hint: 'Like a real season' }
]
const visibilities: { value: Visibility; label: string; hint: string }[] = [
  { value: 'private', label: 'Private', hint: 'Join by PIN only' },
  { value: 'public', label: 'Public', hint: 'Listed for anyone' }
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
      </fieldset>

      <fieldset class="choice">
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
.sizes {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
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
