<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../api/inject'
import type { LeagueDetail } from '../api/types'
import CrestShield from '../components/CrestShield.vue'
import FormError from '../components/FormError.vue'

const api = useApi()
const route = useRoute()
const league = ref<LeagueDetail | null>(null)
const error = ref<unknown>(null)

onMounted(async () => {
  try {
    league.value = await api.getLeague(String(route.params.id))
  } catch (caught) {
    error.value = caught
  }
})

const statusText = computed(() => {
  switch (league.value?.status) {
    case 'forming':
      return 'Gathering parties'
    case 'drafting':
      return 'Draft scheduled'
    case 'active':
      return 'Season underway'
    case 'complete':
      return 'Season complete'
    case 'canceled':
      return 'Canceled'
    default:
      return ''
  }
})
</script>

<template>
  <main class="page">
    <header class="page-header">
      <RouterLink to="/leagues" class="back-link">‹ Your leagues</RouterLink>
      <h1 v-if="league" class="title">{{ league.name }}</h1>
      <div v-if="league" class="muted">{{ statusText }} · {{ league.partyCount }} of {{ league.maxParties }} parties</div>
    </header>

    <FormError :error="error" />
    <p v-if="!league && !error" class="muted" aria-busy="true">Loading…</p>

    <template v-if="league">
      <section v-if="league.isHost && league.status === 'forming' && league.pin" class="card invite">
        <div class="muted">Invite your friends with this PIN</div>
        <div class="pin">{{ league.pin }}</div>
      </section>

      <h2 class="section-title">Parties</h2>
      <ul class="parties">
        <li v-for="party in league.parties" :key="party.id" class="card party">
          <CrestShield :crest="party.crest" :size="36" />
          <div class="party-text">
            <span class="party-name">{{ party.name }} <span v-if="party.isMine" class="you">you</span></span>
            <span class="muted small">{{ party.owner.displayName }}</span>
          </div>
        </li>
      </ul>
    </template>
  </main>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.invite {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border-color: var(--line-strong);
}
.pin {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 36px;
  letter-spacing: 0.3em;
}
.section-title {
  margin: 18px 0 8px;
  font-size: 22px;
}
.parties {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.party {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}
.party-text {
  display: flex;
  flex-direction: column;
}
.party-name {
  font-weight: 700;
}
.you {
  font-size: 12px;
  color: var(--gold);
}
.small {
  font-size: 13px;
}
</style>
