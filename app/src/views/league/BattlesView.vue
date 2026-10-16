<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { ScheduleWeek } from '../../api/types'
import FormError from '../../components/FormError.vue'
import { useLeague } from '../../league'

const api = useApi()
const { league, myParty } = useLeague()
const schedule = ref<ScheduleWeek[] | null>(null)
const error = ref<unknown>(null)

onMounted(async () => {
  if (!league.value) return
  try {
    schedule.value = await api.getSchedule(league.value.id)
  } catch (caught) {
    error.value = caught
  }
})

/** My matchup each week, described from my side. */
const weeks = computed(() =>
  (schedule.value ?? []).map(week => {
    const mine = week.matchups.find(m => m.home.partyId === myParty.value?.id || m.away?.partyId === myParty.value?.id)
    const amHome = mine?.home.partyId === myParty.value?.id
    const opponent = mine ? (amHome ? (mine.away?.name ?? mine.result?.monster ?? 'Dungeon monster') : mine.home.name) : null
    const result = mine?.result
    const mineTotal = result ? (amHome ? result.homeTotal : result.awayTotal) : null
    const theirTotal = result ? (amHome ? result.awayTotal : result.homeTotal) : null
    const outcome = !result ? null : result.outcome === 'draw' ? 'Draw' : (result.outcome === 'home') === amHome ? 'Win' : 'Loss'
    return { week: week.week, opponent, monster: !!mine && !mine.away, mineTotal, theirTotal, outcome, played: !!result }
  })
)
</script>

<template>
  <header class="page-header">
    <div class="eyebrow">{{ league?.name }}</div>
    <h1 class="title">Battles</h1>
  </header>

  <FormError :error="error" />
  <p v-if="schedule && schedule.length === 0" class="card muted">The schedule appears once the draft has run.</p>

  <ol class="weeks">
    <li v-for="row in weeks" :key="row.week">
      <component
        :is="row.played ? 'RouterLink' : 'div'"
        :to="row.played ? `/leagues/${league?.id}/battles/${row.week}` : undefined"
        class="card week"
        :class="{ played: row.played, monster: row.monster }"
      >
        <span class="week-number">Week {{ row.week }}</span>
        <span class="opponent">vs {{ row.opponent ?? '—' }}</span>
        <span v-if="row.played" class="result" :class="row.outcome?.toLowerCase()">
          {{ row.outcome }} · {{ Math.round(row.mineTotal ?? 0) }}–{{ Math.round(row.theirTotal ?? 0) }}
        </span>
        <span v-else class="muted upcoming">Upcoming</span>
      </component>
    </li>
  </ol>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.weeks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.week {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  color: var(--text);
  text-decoration: none;
}
.week.played:hover {
  border-color: var(--line-strong);
}
.week.monster {
  border-style: dashed;
}
.week-number {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
}
.opponent {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.result {
  font-weight: 700;
  white-space: nowrap;
}
.result.win {
  color: var(--gold);
}
.result.loss {
  color: var(--text-muted);
}
.upcoming {
  font-size: 13px;
}
</style>
