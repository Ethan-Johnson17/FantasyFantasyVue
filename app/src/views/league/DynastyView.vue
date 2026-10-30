<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { DynastySummary } from '../../api/types'
import CrestShield from '../../components/CrestShield.vue'
import FormError from '../../components/FormError.vue'
import { useLeague } from '../../league'

/* A dynasty at a glance: each season and its champion, and the all-time standings across every season. */

const api = useApi()
const { league } = useLeague()
const data = ref<DynastySummary | null>(null)
const error = ref<unknown>(null)

onMounted(async () => {
  if (!league.value) return
  try {
    data.value = await api.getDynasty(league.value.id)
  } catch (caught) {
    error.value = caught
  }
})

const record = (row: { wins: number; losses: number; draws: number }) =>
  `${String(row.wins)}–${String(row.losses)}${row.draws ? `–${String(row.draws)}` : ''}`
const STATUS = { forming: 'Offseason', drafting: 'Drafting', active: 'In progress', complete: 'Finished', canceled: 'Canceled' } as const
</script>

<template>
  <header class="page-header">
    <RouterLink :to="`/leagues/${league?.id}`" class="back-link">‹ {{ league?.name }}</RouterLink>
    <h1 class="title">The dynasty</h1>
    <p v-if="data" class="muted">Season {{ data.current }} of {{ data.seasons }}</p>
  </header>

  <FormError :error="error" />

  <template v-if="data">
    <h2 class="section-title">Seasons</h2>
    <ol class="seasons">
      <li v-for="season in data.history" :key="season.leagueId">
        <RouterLink :to="`/leagues/${season.leagueId}`" class="card season" :class="{ current: season.number === data.current }">
          <span class="season-number">Season {{ season.number }}</span>
          <span v-if="season.champion" class="champion">
            <CrestShield :crest="season.champion.crest" :size="24" decorative />
            ♛ {{ season.champion.name }}
          </span>
          <span v-else class="muted small">{{ STATUS[season.status] }}</span>
        </RouterLink>
      </li>
      <li v-for="number in data.seasons - data.history.length" :key="`ahead-${number}`" class="card season ahead muted small">
        Season {{ data.history.length + number }} · still to come
      </li>
    </ol>

    <h2 class="section-title">All-time standings</h2>
    <ol class="standings">
      <li v-for="(row, index) in data.standings" :key="`${row.name}-${index}`" class="row" :class="{ mine: row.isMine }">
        <span class="rank">{{ index + 1 }}</span>
        <CrestShield :crest="row.crest" :size="28" decorative />
        <span class="name">{{ row.name }}<span v-if="row.isMine" class="you"> · you</span></span>
        <span class="titles" :aria-label="`${row.titles} titles`">{{ row.titles ? '♛'.repeat(row.titles) : '' }}</span>
        <span class="muted small">{{ record(row) }}</span>
      </li>
    </ol>
    <p class="muted small">Ranked by titles, then wins. A party taken over by a new member keeps its history.</p>
  </template>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.small {
  font-size: 13px;
}
.section-title {
  margin: 18px 0 8px;
  font-size: 22px;
}
.seasons,
.standings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.season {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  color: var(--text);
  text-decoration: none;
}
.season.current {
  border-color: var(--gold);
}
.season.ahead {
  border-style: dashed;
}
.season-number {
  font-weight: 700;
}
.champion {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--gold);
  font-weight: 700;
}
.row {
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.row.mine {
  border-color: var(--gold);
}
.rank {
  width: 20px;
  color: var(--text-muted);
  font-weight: 700;
}
.name {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.you {
  color: var(--gold);
  font-weight: 400;
}
.titles {
  color: var(--gold);
}
</style>
