<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useApi } from '../api/inject'
import type { Hero, Lineup } from '../api/types'
import { activeSynergies, levelText, levelValue, projectedTotal, synergyInfo } from '../heroes'
import { useLeague } from '../league'
import { kickoffText, timeUntil } from '../time'
import ClassIcon from './ClassIcon.vue'
import EncounterCard from './EncounterCard.vue'
import FormError from './FormError.vue'
import PlayerTag from './PlayerTag.vue'
import SwapBar from './SwapBar.vue'
import TraitChips from './TraitChips.vue'

/*
 * Crossover's Party tab: two lineups. The football lineup (QB, RB, WR, TE, FLEX, DEF) scores Gridiron; the Quest
 * party (any 5 heroes) fights the week's encounter, led by the Champion. Players lock when their game kicks off.
 */

type RosterHero = Lineup['roster'][number]

const api = useApi()
const { league, myParty } = useLeague()

const data = ref<Lineup | null>(null)
const draft = ref<Record<string, string>>({})
const selectedSlot = ref<string | null>(null)
const editingQuest = ref(false)
const questDraft = ref<string[]>([])
const saving = ref(false)
const error = ref<unknown>(null)
const notice = ref('')

onMounted(async () => {
  if (!league.value || league.value.status === 'forming' || league.value.status === 'drafting') return
  try {
    apply(await api.getLineup(league.value.id))
  } catch (caught) {
    error.value = caught
  }
})

function apply(lineup: Lineup) {
  data.value = lineup
  draft.value = { ...(lineup.lineup ?? {}) }
  questDraft.value = [...(lineup.questParty ?? [])]
  selectedSlot.value = null
}

const heroById = computed(() => new Map((data.value?.roster ?? []).map(hero => [hero.id, hero])))
const encounter = computed(() => data.value?.quest?.encounter ?? null)
const partySize = computed(() => data.value?.questPartySize ?? 5)
const champion = computed(() => data.value?.champion ?? null)

// --- Football lineup ------------------------------------------------------------------------------------------
const starters = computed(() => (data.value?.slots ?? []).map(slot => ({ slot, hero: heroById.value.get(draft.value[slot.key] ?? '') ?? null })))
const starterIds = computed(() => new Set(Object.values(draft.value)))
const bench = computed(() => (data.value?.roster ?? []).filter(hero => !starterIds.value.has(hero.id)).sort((a, b) => levelValue(b) - levelValue(a)))
const lineupChanged = computed(() => JSON.stringify(draft.value) !== JSON.stringify(data.value?.lineup ?? {}))
const selectedRule = computed(() => data.value?.slots.find(slot => slot.key === selectedSlot.value) ?? null)
const canFill = (hero: Hero) => !!selectedRule.value && selectedRule.value.classes.includes(hero.heroClass)
const isLocked = (hero: RosterHero) => !!hero.locked

const benchHeading = ref<HTMLElement | null>(null)
const swappingOut = computed(() => heroById.value.get(draft.value[selectedSlot.value ?? ''] ?? '') ?? null)
const swapChoices = computed(() => bench.value.filter(hero => canFill(hero) && !isLocked(hero)).length)
/** The player just swapped in, highlighted briefly so the change is easy to spot. */
const justSwapped = ref<string | null>(null)

async function selectSlot(key: string) {
  const hero = heroById.value.get(draft.value[key] ?? '')
  if (hero && isLocked(hero)) return
  selectedSlot.value = selectedSlot.value === key ? null : key
  notice.value = ''
  if (selectedSlot.value) {
    await nextTick()
    benchHeading.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }
}
function swapIn(hero: RosterHero) {
  if (!selectedSlot.value || !canFill(hero) || isLocked(hero)) return
  draft.value = { ...draft.value, [selectedSlot.value]: hero.id }
  selectedSlot.value = null
  justSwapped.value = hero.id
  setTimeout(() => {
    if (justSwapped.value === hero.id) justSwapped.value = null
  }, 1500)
}

/** A player's game this week: a bye, kicked off, or when it kicks off. */
function gameText(hero: RosterHero): string {
  if (hero.restingNextWeek) return 'Bye this week'
  if (hero.locked) return 'Kicked off · locked'
  return hero.kickoff ? kickoffText(new Date(hero.kickoff)) : ''
}

// --- Quest party ------------------------------------------------------------------------------------------------
const questParty = computed(() => (data.value?.questParty ?? []).flatMap(id => heroById.value.get(id) ?? []))
const questChanged = computed(() => JSON.stringify([...questDraft.value].sort()) !== JSON.stringify([...(data.value?.questParty ?? [])].sort()))

/** The encounter's modifier for a class: ×1.25 for its weak spots, ×0.75 for the class it resists. */
function encounterMultiplier(hero: Hero): number {
  const quest = data.value?.quest
  if (!quest?.encounter) return 1
  if (quest.encounter.weak.includes(hero.heroClass)) return quest.weakMultiplier
  if (quest.encounter.resists === hero.heroClass) return quest.resistMultiplier
  return 1
}
function encounterTag(hero: Hero): { text: string; kind: 'weak' | 'resisted' } | null {
  const multiplier = encounterMultiplier(hero)
  if (multiplier > 1) return { text: `weak spot ×${String(multiplier)}`, kind: 'weak' }
  if (multiplier < 1) return { text: `resisted ×${String(multiplier)}`, kind: 'resisted' }
  return null
}

function toggleQuest(hero: RosterHero) {
  if (isLocked(hero)) return
  const chosen = questDraft.value
  if (chosen.includes(hero.id)) questDraft.value = chosen.filter(id => id !== hero.id)
  else if (chosen.length < partySize.value) questDraft.value = [...chosen, hero.id]
}
const questChoices = computed(() =>
  [...(data.value?.roster ?? [])].sort(
    (a, b) => b.projected * encounterMultiplier(b) - a.projected * encounterMultiplier(a) || a.name.localeCompare(b.name)
  )
)

// --- Projections ------------------------------------------------------------------------------------------------
const gridironProjection = computed(() => {
  const multipliers = data.value?.quest?.classMultipliers
  if (!multipliers) return 0
  const points = starters.value.reduce((sum, { hero }) => sum + (hero && !hero.restingNextWeek ? hero.projected / multipliers[hero.heroClass] : 0), 0)
  return Math.round(points)
})
const questFighters = computed(() => questParty.value.filter(hero => !hero.restingNextWeek))
const questProjection = computed(() => {
  if (!data.value) return 0
  return projectedTotal(
    questFighters.value.map(hero => ({ ...hero, projected: hero.projected * encounterMultiplier(hero) })),
    champion.value,
    data.value.strategy
  )
})
const synergies = computed(() => new Set(activeSynergies(questFighters.value, champion.value)))

// --- Saving -----------------------------------------------------------------------------------------------------
async function run(work: () => Promise<Lineup>, done: string) {
  saving.value = true
  error.value = null
  notice.value = ''
  try {
    apply(await work())
    notice.value = done
  } catch (caught) {
    error.value = caught
  } finally {
    saving.value = false
  }
}
const leagueId = () => league.value?.id ?? ''
const saveLineup = () => run(() => api.setLineup(leagueId(), draft.value), 'Football lineup saved.')
async function saveQuest() {
  await run(() => api.setQuestParty(leagueId(), questDraft.value), 'Quest party saved.')
  if (!error.value) editingQuest.value = false
}
function toggleChampion(hero: RosterHero) {
  const next = champion.value === hero.id ? null : hero.id
  void run(() => api.setChampion(leagueId(), next), next ? `${hero.name} leads your Quest party as Champion.` : 'Champion withdrawn.')
}
function cancelQuest() {
  questDraft.value = [...(data.value?.questParty ?? [])]
  editingQuest.value = false
}
</script>

<template>
  <header class="page-header">
    <div class="eyebrow">{{ league?.name }}</div>
    <h1 class="title">{{ myParty?.name ?? 'Your party' }}</h1>
  </header>

  <p v-if="league && (league.status === 'forming' || league.status === 'drafting')" class="card muted">
    Your party fills out at the draft. Rank players on the Heroes tab before it runs.
  </p>

  <FormError :error="error" />

  <template v-if="data">
    <section v-if="data.nextWeek" class="card week">
      <div class="week-title">Week {{ data.nextWeek }}</div>
      <div class="muted small">
        Goes final {{ data.nextWeekAt ? timeUntil(new Date(data.nextWeekAt)) : 'soon' }} · each player locks when their game kicks off
      </div>
      <div class="projections">
        <span><strong>{{ gridironProjection }}</strong> <span class="muted small">Gridiron proj</span></span>
        <span><strong>{{ questProjection }}</strong> <span class="muted small">Quest proj</span></span>
      </div>
      <RouterLink :to="`/leagues/${league?.id}/matchup`" class="matchup-link">See the matchup ›</RouterLink>
    </section>

    <EncounterCard v-if="encounter && data.quest" :encounter="encounter" :weak-multiplier="data.quest.weakMultiplier" :resist-multiplier="data.quest.resistMultiplier" />

    <!-- Football lineup -->
    <div class="row-heading">
      <h2 class="section-title">Football lineup</h2>
      <span class="muted small">Scores Gridiron</span>
    </div>
    <ol class="list">
      <li v-for="{ slot, hero } in starters" :key="slot.key">
        <button
          v-if="hero"
          type="button"
          class="row"
          :class="{ selected: selectedSlot === slot.key, locked: hero.locked, resting: hero.restingNextWeek, swapped: justSwapped === hero.id }"
          :aria-pressed="selectedSlot === slot.key"
          :disabled="hero.locked"
          @click="selectSlot(slot.key)"
        >
          <span class="slot">{{ slot.label }}</span>
          <span class="text">
            <span class="name">{{ hero.name }}</span>
            <PlayerTag :hero="hero" />
            <span class="muted small game"><span v-if="hero.locked" aria-hidden="true">🔒 </span>{{ gameText(hero) }}</span>
          </span>
          <span v-if="selectedSlot === slot.key" class="swap-tag">Swapping out</span>
          <span v-else class="numbers">
            <span class="level">{{ levelText(hero) }}</span>
            <span class="muted small">proj {{ hero.projected }}</span>
          </span>
        </button>
      </li>
    </ol>
    <h3 ref="benchHeading" class="sub-title bench-heading">Bench</h3>
    <ul class="list">
      <li v-for="hero in bench" :key="hero.id">
        <button
          type="button"
          class="row bench-row"
          :class="{ eligible: selectedSlot && canFill(hero) && !hero.locked, locked: hero.locked, resting: hero.restingNextWeek }"
          :disabled="!selectedSlot || !canFill(hero) || hero.locked"
          @click="swapIn(hero)"
        >
          <ClassIcon :hero-class="hero.heroClass" :size="24" />
          <span class="text">
            <span class="name">{{ hero.name }}</span>
            <PlayerTag :hero="hero" />
            <span class="muted small game"><span v-if="hero.locked" aria-hidden="true">🔒 </span>{{ gameText(hero) }}</span>
          </span>
          <span v-if="selectedSlot && canFill(hero) && !hero.locked" class="swap-tag">Swap in</span>
          <span v-else class="numbers"><span class="level">{{ levelText(hero) }}</span></span>
        </button>
      </li>
    </ul>
    <SwapBar v-if="selectedSlot && swappingOut" :hero-name="swappingOut.name" :slot-label="selectedRule?.label ?? ''" :choices="swapChoices" @cancel="selectedSlot = null" />
    <div v-if="lineupChanged" class="actions">
      <button type="button" class="btn btn-secondary" :disabled="saving" @click="draft = { ...(data.lineup ?? {}) }">Undo</button>
      <button type="button" class="btn btn-primary" :disabled="saving" @click="saveLineup">{{ saving ? 'Saving…' : 'Save lineup' }}</button>
    </div>

    <!-- Quest party -->
    <div class="row-heading">
      <h2 class="section-title">Quest party</h2>
      <button v-if="!editingQuest" type="button" class="link-button" @click="editingQuest = true">Change party</button>
    </div>
    <p class="muted small">Any {{ partySize }} heroes, starters or bench. They fight {{ encounter?.name ?? 'the encounter' }}; tap ♛ to name your Champion.</p>

    <template v-if="!editingQuest">
      <ul class="list">
        <li v-for="hero in questParty" :key="hero.id" class="quest-member">
          <span class="row static" :class="{ champion: champion === hero.id, locked: hero.locked, resting: hero.restingNextWeek }">
            <ClassIcon :hero-class="hero.heroClass" :size="24" />
            <span class="text">
              <span class="name">{{ hero.name }}</span>
              <span class="muted small">
                {{ hero.heroClass }} · {{ levelText(hero) }} · proj {{ hero.projected }}
                <template v-if="encounterTag(hero)"> · <span :class="encounterTag(hero)!.kind">{{ encounterTag(hero)!.text }}</span></template>
              </span>
              <TraitChips :traits="hero.traits" />
            </span>
          </span>
          <button
            v-if="data.nextWeek"
            type="button"
            class="crown"
            :class="{ active: champion === hero.id }"
            :aria-pressed="champion === hero.id"
            :aria-label="champion === hero.id ? `Withdraw ${hero.name} as Champion` : `Name ${hero.name} Champion`"
            :disabled="saving || (hero.locked && champion !== hero.id) || (!!champion && champion !== hero.id && !!heroById.get(champion)?.locked)"
            @click="toggleChampion(hero)"
          >
            ♛
          </button>
        </li>
      </ul>
      <ul class="synergies" aria-label="Quest synergies">
        <li v-for="synergy in synergies" :key="synergy" class="synergy" :title="synergyInfo(synergy, data.strategy).description">{{ synergyInfo(synergy).label }}</li>
      </ul>
    </template>

    <template v-else>
      <p class="small muted" role="status">{{ questDraft.length }} of {{ partySize }} chosen · best for this encounter first</p>
      <ul class="list">
        <li v-for="hero in questChoices" :key="hero.id">
          <label class="row choice" :class="{ on: questDraft.includes(hero.id), locked: hero.locked }">
            <input
              type="checkbox"
              :checked="questDraft.includes(hero.id)"
              :disabled="hero.locked || (!questDraft.includes(hero.id) && questDraft.length >= partySize)"
              @change="toggleQuest(hero)"
            />
            <span class="text">
              <span class="name">{{ hero.name }}</span>
              <span class="muted small">
                {{ hero.heroClass }} · proj {{ hero.projected }}
                <template v-if="encounterTag(hero)"> · <span :class="encounterTag(hero)!.kind">{{ encounterTag(hero)!.text }}</span></template>
                <template v-if="hero.locked"> · 🔒 locked</template>
              </span>
            </span>
          </label>
        </li>
      </ul>
      <div class="actions">
        <button type="button" class="btn btn-secondary" :disabled="saving" @click="cancelQuest">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="saving || questDraft.length !== partySize || !questChanged" @click="saveQuest">
          {{ saving ? 'Saving…' : 'Save Quest party' }}
        </button>
      </div>
    </template>

    <p v-if="notice" class="muted" role="status">{{ notice }}</p>
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
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.week-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
}
.projections {
  display: flex;
  gap: 18px;
}
.projections strong {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--gold);
}
.matchup-link {
  font-size: 14px;
}
.row-heading {
  margin: 18px 0 8px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.section-title {
  font-size: 22px;
}
.sub-title {
  margin: 12px 0 6px;
  font-size: 16px;
  color: var(--text-muted);
}
.small-note {
  margin: 0 0 8px;
  font-size: 14px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  width: 100%;
  min-height: var(--tap);
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.row.static {
  cursor: default;
}
.row:disabled {
  cursor: default;
}
/* Selected for a swap: unmistakable, and different from the Champion's gold edge. */
.row.selected {
  border: 2px solid var(--gold);
  background: color-mix(in srgb, var(--gold) 16%, var(--surface));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--gold) 25%, transparent);
}
.row.eligible {
  border: 2px solid var(--gold);
}
.row.on {
  border-color: var(--gold);
}
.row.swapped {
  animation: swapped 1.5s ease-out;
}
@keyframes swapped {
  from {
    background: color-mix(in srgb, var(--gold) 30%, var(--surface));
  }
}
.swap-tag {
  flex: none;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--gold);
  color: var(--on-gold);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.bench-heading {
  scroll-margin-top: 12px;
}
.row.champion {
  border-color: var(--gold);
  box-shadow: inset 3px 0 0 var(--gold);
}
.row.locked {
  opacity: 0.75;
}
.row.resting {
  border-style: dashed;
}
.bench-row:disabled:not(.locked) {
  opacity: 1;
}
.slot {
  flex: none;
  min-width: 40px;
  color: var(--text-muted);
  font-weight: 700;
  font-size: 13px;
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.name {
  font-weight: 700;
}
.numbers {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.level {
  font-weight: 700;
  color: var(--gold);
}
.quest-member {
  display: flex;
  gap: 6px;
}
.crown {
  flex: none;
  width: var(--tap);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
}
.crown.active {
  border-color: var(--gold);
  color: var(--gold);
}
.crown:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.weak {
  color: var(--trait-steadfast);
}
.resisted {
  color: var(--danger);
}
.synergies {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.synergy {
  padding: 1px 9px;
  border: 1px solid var(--gold);
  border-radius: 999px;
  color: var(--gold);
  font-size: 13px;
}
.actions {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.link-button {
  min-height: var(--tap);
  border: 0;
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.choice input {
  width: 20px;
  height: 20px;
  accent-color: var(--gold);
}
</style>
