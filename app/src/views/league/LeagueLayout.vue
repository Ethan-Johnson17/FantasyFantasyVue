<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../../api/inject'
import FormError from '../../components/FormError.vue'
import { provideLeague } from '../../league'

const api = useApi()
const route = useRoute()
const leagueId = () => String(route.params.id)
const { league, error, reload } = provideLeague(api, leagueId)

onMounted(reload)
watch(() => route.params.id, reload)

const base = computed(() => `/leagues/${leagueId()}`)
const tabs = computed(() => [
  { to: base.value, label: 'League', exact: true },
  { to: `${base.value}/party`, label: 'Party', exact: false },
  { to: `${base.value}/matchup`, label: 'Matchup', exact: false },
  { to: `${base.value}/battles`, label: 'Battles', exact: false },
  { to: `${base.value}/heroes`, label: 'Heroes', exact: false }
])
// Tabs matter once the league has a hero pool; before that the League tab has everything.
const showTabs = computed(() => !!league.value && league.value.status !== 'forming' && league.value.status !== 'canceled')
</script>

<template>
  <div class="league-shell">
    <main class="page">
      <FormError :error="error" />
      <p v-if="!league && !error" class="muted loading" aria-busy="true">Loading…</p>
      <RouterView v-if="league" />
    </main>

    <nav v-if="showTabs" class="tabs" aria-label="League">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="tab"
        :exact-active-class="tab.exact ? 'current' : ''"
        :active-class="tab.exact ? '' : 'current'"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.league-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.league-shell .page {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding-bottom: 88px;
}
.loading {
  padding-top: 24px;
}
.tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  max-width: 480px;
  margin: 0 auto;
  border-top: 1px solid var(--line);
  background: var(--surface-sunken);
  padding-bottom: env(safe-area-inset-bottom);
}
.tab {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-muted);
  text-decoration: none;
}
.tab.current {
  color: var(--gold);
  font-weight: 700;
}
</style>
