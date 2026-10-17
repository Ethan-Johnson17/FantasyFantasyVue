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
// Icons on a 24x24 grid: castle, shield, crossed swords, star.
const tabs = computed(() => [
  { to: base.value, label: 'League', exact: true, icon: 'M4 21V9l3 2V6l3 2V4h4v4l3-2v5l3-2v12zM10 21v-5h4v5' },
  { to: `${base.value}/party`, label: 'Party', exact: false, icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' },
  { to: `${base.value}/matchup`, label: 'Matchup', exact: false, icon: 'M5 4l10 10M4 14l4 4 M19 4L9 14M20 14l-4 4M3 19l2 2M21 19l-2 2' },
  { to: `${base.value}/heroes`, label: 'Heroes', exact: false, icon: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z' }
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
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="tab.icon" />
        </svg>
        <span class="tab-label">{{ tab.label }}</span>
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
  min-width: 0;
  min-height: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 12px;
  color: var(--text-muted);
  text-decoration: none;
}
.tab-label {
  white-space: nowrap;
}
.tab.current {
  color: var(--gold);
  font-weight: 700;
}
</style>
