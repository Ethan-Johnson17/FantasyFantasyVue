<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../../api/inject'
import type { Matchup, ScheduleWeek, WeekResult } from '../../api/types'
import FormError from '../../components/FormError.vue'
import MatchupPreview from '../../components/matchup/MatchupPreview.vue'
import MatchupResult from '../../components/matchup/MatchupResult.vue'
import { useLeague } from '../../league'
import { mySeason, type MyWeek } from '../../mySeason'
import { roundName, stageOf } from '../../playoffs'
import { seasonWeeksOf } from '../../time'
import CrossoverPreview from '../../components/matchup/CrossoverPreview.vue'
import CrossoverResult from '../../components/matchup/CrossoverResult.vue'

/*
 * My matchup for any week of the season: the result once it's played, a preview before that.
 * Opens on the current week. The week strip doubles as my season at a glance (wins, losses, and
 * monster weeks), replacing a separate schedule screen.
 */

const api = useApi()
const route = useRoute()
const { league, myParty } = useLeague()

const scheduled = computed(() => league.value?.status === 'active' || league.value?.status === 'complete')
/** The week to open on: the next battle, or the last one once the season is over. */
const seasonWeeks = computed(() => seasonWeeksOf(league.value))
const crossover = computed(() => league.value?.mode === 'crossover')
const currentWeek = computed(() =>
  Math.min(seasonWeeks.value, (league.value?.resolvedWeeks ?? 0) + (league.value?.status === 'complete' ? 0 : 1))
)
const week = computed(() => {
  const requested = Number(route.params.week)
  return Number.isInteger(requested) && requested >= 1 && requested <= seasonWeeks.value ? requested : currentWeek.value
})
const played = computed(() => week.value <= (league.value?.resolvedWeeks ?? 0))
const label = computed(() => (played.value ? 'Played' : week.value === currentWeek.value ? 'Next battle' : 'Upcoming'))

const schedule = ref<ScheduleWeek[]>([])
const season = computed(() => mySeason(schedule.value, myParty.value?.id))
const thisEntry = computed(() => season.value.find(entry => entry.week === week.value) ?? null)
/** Playoffs: my party rests this week, so there's no battle to show */
const onBye = computed(() => !!thisEntry.value?.bye)
/** Playoff weeks: the round, or "Consolation" for a battle outside the bracket */
const stage = computed(() =>
  thisEntry.value ? stageOf(league.value?.playoffs, week.value, thisEntry.value.kind ?? undefined) : roundName(league.value?.playoffs, week.value)
)

const result = ref<WeekResult | null>(null)
const preview = ref<Matchup | null>(null)
const error = ref<unknown>(null)
const loading = ref(false)

let loads = 0
async function load() {
  // Only the latest load counts: a week change (or a bye showing) can overtake one still in flight.
  const current = ++loads
  const id = league.value?.id
  if (!id || !scheduled.value) return
  error.value = null
  result.value = null
  preview.value = null
  // Reloaded once the schedule shows a bye, clearing anything fetched for that week before it did.
  if (onBye.value) return
  loading.value = true
  try {
    if (played.value) {
      const fetched = await api.getWeekResult(id, week.value)
      if (current === loads) result.value = fetched
    } else {
      const fetched = await api.getMatchup(id, week.value)
      if (current === loads) preview.value = fetched
    }
  } catch (caught) {
    if (current === loads) error.value = caught
  } finally {
    if (current === loads) loading.value = false
  }
}
watch([week, () => league.value?.resolvedWeeks, onBye], load, { immediate: true })

watch(
  () => league.value?.resolvedWeeks,
  async () => {
    const id = league.value?.id
    if (!id || !scheduled.value) return
    try {
      schedule.value = await api.getSchedule(id)
    } catch (caught) {
      error.value = caught
    }
  },
  { immediate: true }
)
/** Crossover: the real NFL week shown under the game week */
const nflWeek = computed(() => schedule.value.find(entry => entry.week === week.value)?.nflWeek ?? null)

const OUTCOME_MARK = { win: 'W', loss: 'L', draw: 'D' } as const
function chipLabel(entry: MyWeek): string {
  const round = stageOf(league.value?.playoffs, entry.week, entry.kind ?? undefined)
  if (entry.bye) return `Week ${String(entry.week)}: bye`
  if (round) return `${round}, ${weekLabel(entry)}`
  return weekLabel(entry)
}

function weekLabel(entry: MyWeek): string {
  const versus = entry.opponent ? ` vs ${entry.opponent}` : ''
  if (entry.boards) {
    return `Week ${String(entry.week)}: ${entry.outcome ?? ''}${versus}, boards ${chipMark(entry)}`
  }
  if (entry.outcome && entry.myTotal !== null && entry.theirTotal !== null) {
    return `Week ${String(entry.week)}: ${entry.outcome}${versus}, ${String(Math.round(entry.myTotal))} to ${String(Math.round(entry.theirTotal))}`
  }
  return `Week ${String(entry.week)}${versus}${entry.week === currentWeek.value ? ', next battle' : ''}`
}

/** W/L/D, or in Crossover the boards won (2–0 a sweep, 1–1 a split). */
function chipMark(entry: MyWeek): string {
  if (entry.boards) return `${boardCount(entry.boards.mine)}–${boardCount(entry.boards.theirs)}`
  if (entry.outcome) return OUTCOME_MARK[entry.outcome]
  if (entry.bye) return 'Bye'
  return entry.monster ? '☠' : entry.week === currentWeek.value ? '•' : ''
}
const boardCount = (value: number) => (Number.isInteger(value) ? String(value) : `${String(Math.floor(value))}½`)
const linkTo = (target: number) => `/leagues/${league.value?.id ?? ''}/matchup/${String(target)}`
</script>

<template>
  <header class="page-header">
    <div class="eyebrow">{{ league?.name }}</div>
    <h1 class="title">Matchup</h1>
  </header>

  <p v-if="!scheduled" class="card muted">Matchups appear once the draft has run.</p>

  <template v-else>
    <nav class="weeks" aria-label="Choose a week">
      <RouterLink v-if="week > 1" :to="linkTo(week - 1)" class="step" :aria-label="`Week ${week - 1}`">‹</RouterLink>
      <span v-else class="step disabled" aria-hidden="true">‹</span>
      <div class="week-label" aria-live="polite">
        <span class="week-number">Week {{ week }} of {{ seasonWeeks }}</span>
        <span v-if="nflWeek" class="muted small">NFL week {{ nflWeek }}</span>
        <span v-if="stage" class="stage small">{{ stage }}</span>
        <span class="week-state small" :class="{ next: label === 'Next battle' }">{{ label }}</span>
      </div>
      <RouterLink v-if="week < seasonWeeks" :to="linkTo(week + 1)" class="step" :aria-label="`Week ${week + 1}`">›</RouterLink>
      <span v-else class="step disabled" aria-hidden="true">›</span>
    </nav>
    <ol v-if="season.length" class="strip" aria-label="Season">
      <li v-for="entry in season" :key="entry.week">
        <RouterLink
          :to="linkTo(entry.week)"
          class="chip"
          :class="[
            entry.outcome ?? '',
            { selected: entry.week === week, next: !entry.played && entry.week === currentWeek, monster: entry.monster, playoff: entry.kind === 'playoff' || entry.bye }
          ]"
          :aria-label="chipLabel(entry)"
          :aria-current="entry.week === week ? 'page' : undefined"
        >
          <span class="chip-week">{{ entry.week }}</span>
          <span class="chip-mark" aria-hidden="true">{{ chipMark(entry) }}</span>
        </RouterLink>
      </li>
    </ol>

    <p v-if="onBye" class="card muted">Your party rests on a bye this week, through to the next round.</p>
    <p v-else-if="stage === 'Consolation'" class="note small">A consolation battle: it counts for pride, not the title or the standings.</p>
    <FormError :error="error" />
    <p v-if="loading" class="muted" aria-busy="true">Loading…</p>

    <CrossoverResult v-if="result && league && crossover" :result="result" :my-party-id="myParty?.id ?? null" :league-id="league.id" />
    <MatchupResult v-else-if="result && league" :result="result" :week="week" :my-party-id="myParty?.id ?? null" :league-id="league.id" />
    <CrossoverPreview v-else-if="preview && league && crossover" :matchup="preview" :league-id="league.id" />
    <MatchupPreview v-else-if="preview && league" :matchup="preview" :league-id="league.id" />
  </template>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.small {
  font-size: 13px;
}
.weeks {
  margin-bottom: 10px;
  display: grid;
  grid-template-columns: var(--tap) 1fr var(--tap);
  align-items: center;
  gap: 8px;
}
.step {
  height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  font-size: 22px;
  text-decoration: none;
}
.step.disabled {
  border-color: var(--line);
  color: var(--line-strong);
}
.week-label {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.week-number {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
}
.week-state {
  color: var(--text-muted);
}
.week-state.next {
  color: var(--gold);
}
/* 14 weeks as two rows of seven, so every chip stays a full tap target on a phone. */
.strip {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}
.chip {
  min-height: var(--tap);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  color: var(--text-muted);
  text-decoration: none;
  line-height: 1.1;
}
.chip-week {
  font-size: 14px;
  font-weight: 700;
}
.chip-mark {
  min-height: 14px;
  font-size: 12px;
}
.chip.win {
  color: var(--gold);
  border-color: color-mix(in srgb, var(--gold) 45%, var(--line));
}
.chip.loss {
  color: var(--danger);
}
.chip.draw {
  color: var(--text);
}
/* Playoff weeks: a gold rule along the top */
.chip.playoff {
  border-top: 3px solid var(--gold);
}
.stage {
  color: var(--gold);
  font-weight: 700;
}
.chip.next {
  color: var(--gold);
  border-style: dashed;
  border-color: var(--gold);
}
.chip.selected {
  background: var(--surface-raised);
  border-color: var(--gold);
  border-style: solid;
  box-shadow: 0 0 0 1px var(--gold) inset;
  color: var(--text);
}
</style>
