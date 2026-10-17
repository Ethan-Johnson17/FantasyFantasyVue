<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../../api/inject'
import type { Matchup, WeekResult } from '../../api/types'
import FormError from '../../components/FormError.vue'
import MatchupPreview from '../../components/matchup/MatchupPreview.vue'
import MatchupResult from '../../components/matchup/MatchupResult.vue'
import { useLeague } from '../../league'
import { SEASON_WEEKS } from '../../time'

/*
 * My matchup for any week of the season: the result once it's played, a preview before that.
 * Opens on the current week; the switcher steps through the season.
 */

const api = useApi()
const route = useRoute()
const { league, myParty } = useLeague()

const scheduled = computed(() => league.value?.status === 'active' || league.value?.status === 'complete')
/** The week to open on: the next battle, or the last one once the season is over. */
const currentWeek = computed(() => Math.min(SEASON_WEEKS, (league.value?.resolvedWeeks ?? 0) + (league.value?.status === 'complete' ? 0 : 1)))
const week = computed(() => {
  const requested = Number(route.params.week)
  return Number.isInteger(requested) && requested >= 1 && requested <= SEASON_WEEKS ? requested : currentWeek.value
})
const played = computed(() => week.value <= (league.value?.resolvedWeeks ?? 0))
const label = computed(() => (played.value ? 'Played' : week.value === currentWeek.value ? 'Next battle' : 'Upcoming'))

const result = ref<WeekResult | null>(null)
const preview = ref<Matchup | null>(null)
const error = ref<unknown>(null)
const loading = ref(false)

async function load() {
  const id = league.value?.id
  if (!id || !scheduled.value) return
  loading.value = true
  error.value = null
  result.value = null
  preview.value = null
  try {
    if (played.value) result.value = await api.getWeekResult(id, week.value)
    else preview.value = await api.getMatchup(id, week.value)
  } catch (caught) {
    error.value = caught
  } finally {
    loading.value = false
  }
}
watch([week, () => league.value?.resolvedWeeks], load, { immediate: true })

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
        <span class="week-number">Week {{ week }} of {{ SEASON_WEEKS }}</span>
        <span class="week-state small" :class="{ next: label === 'Next battle' }">{{ label }}</span>
      </div>
      <RouterLink v-if="week < SEASON_WEEKS" :to="linkTo(week + 1)" class="step" :aria-label="`Week ${week + 1}`">›</RouterLink>
      <span v-else class="step disabled" aria-hidden="true">›</span>
    </nav>
    <RouterLink v-if="week !== currentWeek" :to="linkTo(currentWeek)" class="jump small">Back to {{ league?.status === 'complete' ? 'the final week' : 'the next battle' }} ›</RouterLink>

    <FormError :error="error" />
    <p v-if="loading" class="muted" aria-busy="true">Loading…</p>

    <MatchupResult v-if="result && league" :result="result" :week="week" :my-party-id="myParty?.id ?? null" :league-id="league.id" />
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
.jump {
  display: block;
  margin: -4px 0 10px;
  text-align: center;
}
</style>
