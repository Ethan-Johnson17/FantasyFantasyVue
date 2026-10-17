<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { Hero, Lineup } from '../../api/types'
import ClassIcon from '../../components/ClassIcon.vue'
import FormError from '../../components/FormError.vue'
import TraitChips from '../../components/TraitChips.vue'
import { activeSynergies, levelText, levelValue, SYNERGY_ORDER, synergyInfo } from '../../heroes'
import { useLeague } from '../../league'
import { timeUntil } from '../../time'

const api = useApi()
const { league, myParty } = useLeague()

const data = ref<Lineup | null>(null)
/** Working copy of the lineup (slot key → hero id); saved only when the player confirms. */
const draft = ref<Record<string, string>>({})
const selectedSlot = ref<string | null>(null)
const saving = ref(false)
const namingChampion = ref(false)
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
const starters = computed(() =>
  (data.value?.slots ?? []).map(slot => ({ slot, hero: heroById.value.get(draft.value[slot.key] ?? '') ?? null }))
)
const starterIds = computed(() => new Set(Object.values(draft.value)))
const bench = computed(() =>
  (data.value?.roster ?? []).filter(hero => !starterIds.value.has(hero.id)).sort((a, b) => levelValue(b) - levelValue(a))
)
const changed = computed(() => JSON.stringify(draft.value) !== JSON.stringify(data.value?.lineup ?? {}))
const selectedRule = computed(() => data.value?.slots.find(slot => slot.key === selectedSlot.value) ?? null)
const canFill = (hero: Hero) => !!selectedRule.value && selectedRule.value.classes.includes(hero.heroClass)

const champion = computed(() => data.value?.champion ?? null)
const championHero = computed(() => heroById.value.get(champion.value ?? '') ?? null)
/** Synergies the lineup on screen would trigger next battle. Resting starters don't fight. */
const synergies = computed(() => {
  const fighters = starters.value.flatMap(({ hero }) => (hero && !hero.restingNextWeek ? [hero] : []))
  return new Set(activeSynergies(fighters, champion.value))
})
const times = (value: number) => `${String(value)}×`

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

/** Names a starter as Champion (kept until changed), or withdraws them when tapped again. */
async function toggleChampion(hero: Hero) {
  if (!league.value || !data.value || changed.value) return
  namingChampion.value = true
  error.value = null
  try {
    data.value = await api.setChampion(league.value.id, champion.value === hero.id ? null : hero.id)
    notice.value = data.value.champion ? `${hero.name} will lead your party as Champion.` : 'Champion withdrawn.'
  } catch (caught) {
    error.value = caught
  } finally {
    namingChampion.value = false
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
      <RouterLink :to="`/leagues/${league?.id}/battles/upcoming`" class="matchup-link">See the matchup ›</RouterLink>
    </section>

    <section v-if="data.nextWeek" class="card champion-card" :class="{ named: championHero }" aria-live="polite">
      <div class="champion-title"><span class="crown-mark" aria-hidden="true">♛</span> Champion</div>
      <p v-if="championHero" class="champion-text">
        <strong>{{ championHero.name }}</strong> leads your party in every battle until you choose another, dealing
        {{ times(championHero.traits.includes('mighty') ? data.strategy.mightyChampionMultiplier : data.strategy.championMultiplier) }} damage.
        <span v-if="championHero.restingNextWeek" class="resting-text">They're resting this week, so this week's bonus would be lost. Consider another.</span>
      </p>
      <p v-else class="champion-text muted">
        No Champion yet. Tap ♛ on a starter: your Champion deals {{ times(data.strategy.championMultiplier) }} damage
        ({{ times(data.strategy.mightyChampionMultiplier) }} if Mighty) and stays Champion until you change them.
      </p>
    </section>

    <div class="row-heading">
      <h2 class="section-title">Starting party</h2>
      <span class="muted small">{{ data.slots.length }} slots · any class</span>
    </div>
    <p v-if="selectedSlot" class="note small-note" role="status">
      Choose a bench hero to start in {{ selectedRule?.label }}, or tap the slot again to cancel.
    </p>
    <ol class="starters">
      <li v-for="{ slot, hero } in starters" :key="slot.key" class="starter">
        <template v-if="hero">
          <button
            type="button"
            class="hero-row"
            :class="{ selected: selectedSlot === slot.key, resting: hero.restingNextWeek, champion: champion === hero.id }"
            :aria-pressed="selectedSlot === slot.key"
            @click="selectSlot(slot.key)"
          >
            <ClassIcon :hero-class="hero.heroClass" />
            <span class="hero-text">
              <span class="hero-name">{{ hero.name }}</span>
              <span v-if="hero.restingNextWeek" class="resting-text">
                Resting this week{{ data.autoSwap ? ' · auto-swap ready' : '' }}
              </span>
              <span v-else class="muted small">{{ hero.race }} {{ hero.heroClass }}</span>
              <TraitChips :traits="hero.traits" />
            </span>
            <span class="level">{{ levelText(hero) }}</span>
          </button>
          <button
            v-if="data.nextWeek"
            type="button"
            class="crown"
            :class="{ active: champion === hero.id }"
            :aria-pressed="champion === hero.id"
            :aria-label="champion === hero.id ? `Withdraw ${hero.name} as Champion` : `Name ${hero.name} Champion`"
            :title="changed ? 'Save your lineup to choose a Champion' : undefined"
            :disabled="changed || namingChampion"
            @click="toggleChampion(hero)"
          >
            ♛
          </button>
        </template>
      </li>
    </ol>

    <div class="row-heading">
      <h2 class="section-title">Synergies</h2>
      <RouterLink to="/how-it-works#synergies" class="small">How they work ›</RouterLink>
    </div>
    <ul class="synergies">
      <li v-for="synergy in SYNERGY_ORDER" :key="synergy" class="synergy" :class="{ active: synergies.has(synergy) }">
        <span class="synergy-text">
          <span class="synergy-name">{{ synergyInfo(synergy).label }}</span>
          <span class="muted small">{{ synergyInfo(synergy, data.strategy).description }}</span>
        </span>
        <span class="synergy-state small">{{ synergies.has(synergy) ? 'Active' : 'Inactive' }}</span>
      </li>
    </ul>

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
          <TraitChips :traits="hero.traits" />
        </button>
        <RouterLink :to="`/leagues/${league?.id}/heroes/${hero.id}`" class="details" :aria-label="`About ${hero.name}`">›</RouterLink>
      </li>
    </ul>

    <p class="muted small help">Tap a starter, then a bench hero, to swap them. If a starter rests and auto-swap is on, your best bench hero steps in at half damage. Benching your Champion withdraws them.</p>

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
.matchup-link {
  display: inline-block;
  margin-top: 4px;
  font-size: 14px;
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
.hero-row.champion {
  border-color: var(--gold);
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
  gap: 2px;
}
.starter {
  display: flex;
  gap: 6px;
}
.crown {
  width: var(--tap);
  flex: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
}
.crown.active {
  border-color: var(--gold);
  background: var(--gold);
  color: var(--on-gold);
}
.crown:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.champion-card {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.champion-card.named {
  border-color: var(--gold);
}
.champion-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
}
.crown-mark {
  color: var(--gold);
}
.champion-text {
  margin: 0;
  line-height: 1.45;
}
.synergies {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.synergy {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-sm);
}
.synergy.active {
  border: 1px solid var(--gold);
  background: var(--surface-raised);
}
.synergy-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.synergy-name {
  font-weight: 700;
}
.synergy-state {
  color: var(--text-muted);
}
.synergy.active .synergy-state {
  color: var(--gold);
  font-weight: 700;
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
