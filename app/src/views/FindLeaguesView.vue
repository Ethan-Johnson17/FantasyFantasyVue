<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../api/inject'
import type { Cadence, LeagueSummary } from '../api/types'
import FormError from '../components/FormError.vue'

/* Public leagues that still have room. Joining goes through the usual join screen with the PIN filled in. */

/** The API's page size: a full page means there may be more. */
const PAGE_SIZE = 20

const api = useApi()
const leagues = ref<LeagueSummary[] | null>(null)
const page = ref(1)
const hasMore = ref(false)
const loadingMore = ref(false)
const error = ref<unknown>(null)
const cadence = ref<Cadence | 'all'>('all')

async function load(next: number) {
  const batch = await api.listPublicLeagues(next)
  leagues.value = [...(next === 1 ? [] : (leagues.value ?? [])), ...batch]
  page.value = next
  hasMore.value = batch.length === PAGE_SIZE
}

onMounted(async () => {
  try {
    await load(1)
  } catch (caught) {
    error.value = caught
  }
})

async function showMore() {
  loadingMore.value = true
  try {
    await load(page.value + 1)
  } catch (caught) {
    error.value = caught
  } finally {
    loadingMore.value = false
  }
}

const shown = computed(() => (leagues.value ?? []).filter(league => cadence.value === 'all' || league.cadence === cadence.value))
const CADENCE_TEXT: Record<Cadence, string> = { daily: 'A battle every day', weekly: 'A battle every week' }
const spotsLeft = (league: LeagueSummary) => league.maxParties - league.partyCount
</script>

<template>
  <main class="page">
    <header class="page-header">
      <RouterLink to="/leagues" class="back-link">‹ Your leagues</RouterLink>
      <h1 class="title">Find a league</h1>
      <p class="muted">Public leagues looking for more parties. Join one and meet new rivals.</p>
    </header>

    <FormError :error="error" />
    <p v-if="!leagues && !error" class="muted" aria-busy="true">Looking for leagues…</p>

    <template v-if="leagues">
      <div v-if="leagues.length" class="filters" role="group" aria-label="Filter by pace">
        <button type="button" class="chip" :aria-pressed="cadence === 'all'" @click="cadence = 'all'">All</button>
        <button type="button" class="chip" :aria-pressed="cadence === 'daily'" @click="cadence = 'daily'">Daily</button>
        <button type="button" class="chip" :aria-pressed="cadence === 'weekly'" @click="cadence = 'weekly'">Weekly</button>
      </div>

      <section v-if="leagues.length === 0" class="card empty">
        <p>No public leagues need parties right now.</p>
        <p class="muted small">Host one and make it public, and others can find it here.</p>
        <RouterLink to="/leagues/new" class="btn btn-primary">Host a league</RouterLink>
      </section>
      <p v-else-if="shown.length === 0" class="muted">No {{ cadence }} leagues right now.</p>

      <ul class="list">
        <li v-for="league in shown" :key="league.id" class="card league">
          <div class="league-top">
            <span class="league-name">{{ league.name }}</span>
            <span class="spots">{{ spotsLeft(league) }} {{ spotsLeft(league) === 1 ? 'spot' : 'spots' }} left</span>
          </div>
          <div class="muted small">Hosted by {{ league.host.displayName }} · {{ CADENCE_TEXT[league.cadence] }}</div>
          <div class="slots" role="img" :aria-label="`${league.partyCount} of ${league.maxParties} parties joined`">
            <span v-for="slot in league.maxParties" :key="slot" class="slot" :class="{ filled: slot <= league.partyCount }"></span>
          </div>
          <RouterLink
            v-if="league.pin"
            :to="{ path: '/join', query: { pin: league.pin } }"
            class="btn btn-secondary join"
            :aria-label="`Join ${league.name}`"
          >
            Join
          </RouterLink>
        </li>
      </ul>

      <button v-if="hasMore" type="button" class="btn btn-secondary more" :disabled="loadingMore" @click="showMore">
        {{ loadingMore ? 'Loading…' : 'Show more' }}
      </button>
    </template>
  </main>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.small {
  font-size: 13px;
}
.filters {
  margin-bottom: 10px;
  display: flex;
  gap: 6px;
}
.empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.empty p {
  margin: 0;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.league {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.league-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.league-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
  overflow-wrap: anywhere;
}
.spots {
  flex: none;
  font-size: 13px;
  font-weight: 700;
  color: var(--gold);
}
.slots {
  display: flex;
  gap: 6px;
}
.slot {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--line);
}
.slot.filled {
  background: var(--gold);
}
.join {
  min-height: var(--tap);
}
.more {
  width: 100%;
  margin-top: 12px;
}
</style>
