<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { Hero, Lineup } from '../../api/types'
import ClassIcon from '../../components/ClassIcon.vue'
import FormError from '../../components/FormError.vue'
import { CLASS_TEMPERAMENT, levelText, levelValue } from '../../heroes'
import { useLeague } from '../../league'
import { timeUntil } from '../../time'

const api = useApi()
const { league, myParty } = useLeague()

const data = ref<Lineup | null>(null)
/** Working copy of the lineup (slot key → hero id); saved only when the player confirms. */
const draft = ref<Record<string, string>>({})
const selectedSlot = ref<string | null>(null)
const saving = ref(false)
const error = ref<unknown>(null)
const notice = ref('')

onMounted(async () => {
  if (!league.value || league.value.status === 'forming' || league.value.status === 'drafting') return
  try {
    data.value = await api.getLineup(league.value.id)
    draft.value = { ...(data.value.lineup ?? {}) }
  } catch (caught) {
    error.value = caught
  }
})

const heroById = computed(() => new Map((data.value?.roster ?? []).map(hero => [hero.id, hero])))
const starterIds = computed(() => new Set(Object.values(draft.value)))
const bench = computed(() =>
  (data.value?.roster ?? []).filter(hero => !starterIds.value.has(hero.id)).sort((a, b) => levelValue(b) - levelValue(a))
)
const changed = computed(() => JSON.stringify(draft.value) !== JSON.stringify(data.value?.lineup ?? {}))
const selectedRule = computed(() => data.value?.slots.find(slot => slot.key === selectedSlot.value) ?? null)
const canFill = (hero: Hero) => !!selectedRule.value && selectedRule.value.classes.includes(hero.heroClass)

function selectSlot(key: string) {
  selectedSlot.value = selectedSlot.value === key ? null : key
  notice.value = ''
}

function swapIn(hero: Hero) {
  if (!selectedSlot.value || !canFill(hero)) return
  draft.value = { ...draft.value, [selectedSlot.value]: hero.id }
  selectedSlot.value = null
}

function reset() {
  draft.value = { ...(data.value?.lineup ?? {}) }
  selectedSlot.value = null
}

async function save() {
  if (!league.value) return
  saving.value = true
  error.value = null
  try {
    data.value = await api.setLineup(league.value.id, draft.value)
    draft.value = { ...(data.value.lineup ?? {}) }
    notice.value = 'Lineup saved.'
  } catch (caught) {
    error.value = caught
  } finally {
    saving.value = false
  }
}

async function toggleAutoSwap(event: Event) {
  const party = myParty.value
  if (!party || !data.value) return
  const autoSwap = (event.target as HTMLInputElement).checked
  try {
    await api.updateParty(party.id, { autoSwap })
    data.value = { ...data.value, autoSwap }
  } catch (caught) {
    error.value = caught
  }
}
</script>

<template>
  <header class="page-header">
    <div class="eyebrow">{{ league?.name }}</div>
    <h1 class="title">{{ myParty?.name ?? 'Your party' }}</h1>
  </header>

  <p v-if="league && (league.status === 'forming' || league.status === 'drafting')" class="card muted">
    Your party fills out at the draft. Rank your heroes on the Heroes tab before it runs.
  </p>

  <FormError :error="error" />

  <template v-if="data">
    <section v-if="data.nextWeek" class="card week">
      <div class="week-title">Week {{ data.nextWeek }}</div>
      <div class="muted small">Battle begins {{ data.nextWeekAt ? timeUntil(new Date(data.nextWeekAt)) : 'soon' }} · your lineup locks then</div>
    </section>

    <div class="row-heading">
      <h2 class="section-title">Starting party</h2>
      <span class="muted small">{{ data.slots.length }} slots · any class</span>
    </div>
    <p v-if="selectedSlot" class="note small-note" role="status">
      Choose a bench hero to start in {{ selectedRule?.label }}, or tap the slot again to cancel.
    </p>
    <ol class="starters">
      <li v-for="slot in data.slots" :key="slot.key">
        <template v-if="heroById.get(draft[slot.key] ?? '')">
          <button
            type="button"
            class="hero-row"
            :class="{ selected: selectedSlot === slot.key, resting: heroById.get(draft[slot.key]!)!.restingNextWeek }"
            :aria-pressed="selectedSlot === slot.key"
            @click="selectSlot(slot.key)"
          >
            <ClassIcon :hero-class="heroById.get(draft[slot.key]!)!.heroClass" />
            <span class="hero-text">
              <span class="hero-name">{{ heroById.get(draft[slot.key]!)!.name }}</span>
              <span v-if="heroById.get(draft[slot.key]!)!.restingNextWeek" class="resting-text">
                Resting this week{{ data.autoSwap ? ' · auto-swap ready' : '' }}
              </span>
              <span v-else class="muted small">
                {{ heroById.get(draft[slot.key]!)!.race }} {{ heroById.get(draft[slot.key]!)!.heroClass }} ·
                {{ CLASS_TEMPERAMENT[heroById.get(draft[slot.key]!)!.heroClass].label.toLowerCase() }}
              </span>
            </span>
            <span class="level">{{ levelText(heroById.get(draft[slot.key]!)!) }}</span>
          </button>
        </template>
      </li>
    </ol>

    <div class="row-heading">
      <h2 class="section-title">Bench</h2>
      <label class="toggle">
        <input type="checkbox" :checked="data.autoSwap" @change="toggleAutoSwap" />
        Auto-swap at 50%
      </label>
    </div>
    <ul class="bench">
      <li v-for="hero in bench" :key="hero.id">
        <button
          type="button"
          class="bench-hero"
          :class="{ eligible: selectedSlot && canFill(hero), resting: hero.restingNextWeek }"
          :disabled="!!selectedSlot && !canFill(hero)"
          @click="selectedSlot ? swapIn(hero) : undefined"
        >
          <span class="hero-name">{{ hero.name }}</span>
          <span class="muted small">{{ hero.heroClass }} · {{ levelText(hero) }}{{ hero.restingNextWeek ? ' · resting' : '' }}</span>
        </button>
        <RouterLink :to="`/leagues/${league?.id}/heroes/${hero.id}`" class="details" :aria-label="`About ${hero.name}`">›</RouterLink>
      </li>
    </ul>

    <p class="muted small help">Tap a starter, then a bench hero, to swap them. If a starter rests and auto-swap is on, your best bench hero steps in at half damage.</p>

    <p v-if="notice" class="muted" role="status">{{ notice }}</p>
    <div v-if="changed" class="actions">
      <button type="button" class="btn btn-secondary" :disabled="saving" @click="reset">Undo changes</button>
      <button type="button" class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save lineup' }}</button>
    </div>
  </template>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.small {
  font-size: 13px;
}
.week {
  margin-top: 4px;
  border-color: var(--line-strong);
}
.week-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
}
.row-heading {
  margin: 16px 0 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.section-title {
  font-size: 22px;
}
.small-note {
  margin-bottom: 8px;
  font-size: 14px;
}
.starters,
.bench {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hero-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.hero-row.selected {
  border-color: var(--gold);
  background: var(--surface-raised);
}
.hero-row.resting {
  border-style: dashed;
  border-color: #8a7a5a;
}
.hero-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.hero-name {
  font-size: 16px;
  font-weight: 700;
}
.resting-text {
  font-size: 14px;
  color: var(--gold);
}
.level {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
  color: var(--gold);
  white-space: nowrap;
}
.toggle {
  min-height: var(--tap);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.toggle input {
  width: 20px;
  height: 20px;
  accent-color: var(--gold);
}
.bench li {
  display: flex;
  gap: 6px;
}
.bench-hero {
  flex: 1;
  min-height: 52px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: var(--surface-sunken);
  border: 1px solid #332c3d;
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.bench-hero.eligible {
  border-color: var(--gold);
}
.bench-hero:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.details {
  width: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-size: 22px;
  text-decoration: none;
}
.help {
  margin: 12px 0 0;
}
.actions {
  position: sticky;
  bottom: 76px;
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 10px 0;
  background: var(--ink);
}
</style>
