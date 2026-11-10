<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../api/inject'
import type { Cadence, CoopRules, CreateLeagueInput, CrossoverRules, LeagueMode, Visibility } from '../api/types'
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

// Crossover and Co-op show as choices only once each is switched on for everyone (GET /api/rules).
const crossover = ref<CrossoverRules | null>(null)
const coopRules = ref<CoopRules | null>(null)
onMounted(async () => {
  try {
    const rules = await api.getRules()
    crossover.value = rules.crossover?.available ? rules.crossover : null
    coopRules.value = rules.coop?.available ? rules.coop : null
  } catch {
    // Without the rules, Classic is the only choice, as before.
  }
})
// Classic only: one season, or a dynasty of chained seasons (docs/DYNASTY_SPEC.md).
const lengths: { value: 1 | 3 | 5; label: string; hint: string }[] = [
  { value: 1, label: 'One season', hint: 'A single season' },
  { value: 3, label: 'Dynasty · 3', hint: 'Keep 3 heroes a season' },
  { value: 5, label: 'Dynasty · 5', hint: 'The long haul' }
]
const length = ref<1 | 3 | 5>(1)
// A playoff bracket after the regular season, or the best record wins (docs/CLASSIC_SCORING.md, docs/CROSSOVER_SPEC.md).
const playoffs = ref(true)
const champions = computed(() =>
  form.mode === 'crossover'
    ? [
        { value: true, label: 'Playoffs', hint: 'A bracket in NFL weeks 15–17' },
        { value: false, label: 'Best record', hint: 'First place after week 17' }
      ]
    : [
        { value: true, label: 'Playoffs', hint: 'A bracket after week 14' },
        { value: false, label: 'Best record', hint: 'First place after week 14' }
      ]
)

const modes = computed(() => {
  const list: { value: LeagueMode; label: string; hint: string }[] = [
    { value: 'classic', label: 'Classic', hint: 'Heroes hide the real players behind them. Plays any time.' }
  ]
  if (crossover.value) list.push({ value: 'crossover', label: 'Crossover', hint: 'Real NFL players this season. Football and a D&D quest each week.' })
  if (coopRules.value) list.push({ value: 'coop', label: 'Co-op', hint: 'Every party against the same monsters. Win or lose together.' })
  return list
})
// Co-op (docs/COOP_SPEC.md) is one season with no matchups, so no dynasty and no playoffs.
const coop = computed(() => form.mode === 'coop')

const submitting = ref(false)
const error = ref<unknown>(null)

async function submit() {
  submitting.value = true
  error.value = null
  try {
    const dynasty = form.mode === 'classic' && length.value !== 1 ? { dynastySeasons: length.value } : {}
    const league = await api.createLeague({ ...form, ...dynasty, playoffs: coop.value ? false : playoffs.value })
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
        <span v-if="coop" class="muted hint">Every party fights the campaign's monsters together, at any size.</span>
        <span v-else class="muted hint">With an odd number of parties, one battles the dungeon monster each week.</span>
      </fieldset>

      <fieldset v-if="modes.length > 1" class="choice">
        <legend class="field-label">Game</legend>
        <div :class="modes.length > 2 ? 'stack' : 'pair'">
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

      <p v-if="coop && coopRules" class="note small-note">
        Co-op has no matchups. The whole league fights {{ coopRules.deadlines.length - 1 }} monsters and then
        {{ coopRules.boss }}, each by a deadline (weeks {{ coopRules.deadlines.join(', ') }}). A monster that escapes costs one of
        {{ coopRules.lives }} lives. <RouterLink to="/how-it-works#coop">How it works</RouterLink>
      </p>

      <fieldset v-if="form.mode === 'classic'" class="choice">
        <legend class="field-label">Seasons</legend>
        <div class="triple">
          <label v-for="option in lengths" :key="option.value" class="option" :class="{ on: length === option.value }">
            <span class="option-title"><input v-model="length" type="radio" name="length" :value="option.value" />{{ option.label }}</span>
            <span class="muted hint">{{ option.hint }}</span>
          </label>
        </div>
        <span v-if="length !== 1" class="muted hint">
          A dynasty plays {{ length }} seasons in a row. Between seasons each party keeps up to 3 heroes, who level up or
          down with their real form and grow with experience.
        </span>
      </fieldset>

      <fieldset v-if="!coop" class="choice">
        <legend class="field-label">Champion</legend>
        <div class="pair">
          <label v-for="option in champions" :key="String(option.value)" class="option" :class="{ on: playoffs === option.value }">
            <span class="option-title"><input v-model="playoffs" type="radio" name="playoffs" :value="option.value" />{{ option.label }}</span>
            <span class="muted hint">{{ option.hint }}</span>
          </label>
        </div>
        <span v-if="playoffs && form.mode === 'crossover'" class="muted hint">
          The best 2, 4 or 6 parties, by how many join, play a bracket ending in NFL week 17; a 1–1 split goes to the
          Quest board. A league that starts late gets a smaller bracket, or none. Everyone else plays consolation battles.
        </span>
        <span v-else-if="playoffs" class="muted hint">
          The best 2, 4 or 6 parties, by how many join, play a bracket over up to 3 more weeks. Everyone else plays
          consolation battles.
        </span>
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
.triple {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
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
.stack {
  display: grid;
  gap: 6px;
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
