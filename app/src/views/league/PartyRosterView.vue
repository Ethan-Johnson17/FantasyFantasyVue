<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../../api/inject'
import type { Hero, Trades } from '../../api/types'
import ClassIcon from '../../components/ClassIcon.vue'
import CrestShield from '../../components/CrestShield.vue'
import FormError from '../../components/FormError.vue'
import PlayerTag from '../../components/PlayerTag.vue'
import TraitChips from '../../components/TraitChips.vue'
import XpBadge from '../../components/XpBadge.vue'
import { heroFormText, isMystery, levelText, levelValue } from '../../heroes'
import { useLeague } from '../../league'
import { hasTrades } from '../../trades'

/* Any party's roster (docs/TRADES_SPEC.md, "App"): each hero links to their page, and to a trade while trades are open. */

const api = useApi()
const route = useRoute()
const { league, myParty } = useLeague()

const partyId = computed(() => String(route.params.partyId))
const party = computed(() => league.value?.parties.find(entry => entry.id === partyId.value) ?? null)
const mine = computed(() => !!party.value && party.value.id === myParty.value?.id)
const heroes = ref<Hero[]>([])
const trades = ref<Trades | null>(null)
const error = ref<unknown>(null)

async function load() {
  if (!league.value || league.value.status === 'forming') return
  error.value = null
  try {
    heroes.value = await api.listHeroes(league.value.id)
    // Only members trade, and only while the league is running.
    trades.value = myParty.value && hasTrades(league.value) && league.value.status === 'active' ? await api.listTrades(league.value.id) : null
  } catch (caught) {
    error.value = caught
  }
}
onMounted(load)
watch(partyId, load)

const battlesPlayed = computed(() => (league.value?.resolvedWeeks ?? 0) > 0)
const roster = computed(() =>
  heroes.value
    .filter(hero => hero.partyId === partyId.value)
    .sort((a, b) => levelValue(b) - levelValue(a) || a.name.localeCompare(b.name))
)
const canTrade = computed(() => !mine.value && !!myParty.value && !!trades.value?.window.open)
const tradeLink = (hero?: Hero) => ({
  path: `/leagues/${league.value?.id ?? ''}/trades/new`,
  query: { party: partyId.value, ...(hero ? { want: hero.id } : {}) }
})
</script>

<template>
  <header class="page-header">
    <button type="button" class="back-link back-button" @click="$router.back()">‹ Back</button>
  </header>

  <FormError :error="error" />
  <p v-if="league && !party" class="card muted">That party is not in this league.</p>

  <template v-else-if="party">
    <section class="party-header">
      <CrestShield :crest="party.crest" :size="64" />
      <div>
        <h1 class="title">{{ party.name }}</h1>
        <div class="muted">{{ party.owner.displayName }}<template v-if="mine"> · your party</template></div>
      </div>
    </section>

    <p v-if="mine" class="muted small">
      This is how your roster looks to the league. <RouterLink :to="`/leagues/${league?.id}/party`">Set your lineup ›</RouterLink>
    </p>
    <template v-else-if="trades">
      <RouterLink v-if="canTrade" :to="tradeLink()" class="btn btn-secondary propose">Propose a trade</RouterLink>
      <p v-else class="muted small">The trade deadline has passed.</p>
    </template>

    <h2 class="section-title">Heroes · {{ roster.length }}</h2>
    <p v-if="league?.status === 'forming'" class="muted small">Rosters fill at the draft.</p>
    <ul class="list">
      <li v-for="hero in roster" :key="hero.id" class="row" :class="{ mystery: isMystery(hero) }">
        <ClassIcon :hero-class="hero.heroClass" :size="36" />
        <RouterLink :to="`/leagues/${league?.id}/heroes/${hero.id}`" class="hero-text">
          <span class="hero-name">{{ hero.name }}</span>
          <PlayerTag :hero="hero" />
          <XpBadge v-if="hero.xp" :xp="hero.xp" />
          <span class="muted small">{{ hero.race }} {{ hero.heroClass }}{{ isMystery(hero) ? ' · mystery recruit' : '' }}</span>
          <span v-if="heroFormText(hero, battlesPlayed, league?.status === 'active')" class="form small">
            {{ heroFormText(hero, battlesPlayed, league?.status === 'active') }}
          </span>
          <TraitChips :traits="hero.traits" />
        </RouterLink>
        <span class="level">{{ levelText(hero) }}</span>
        <RouterLink v-if="canTrade" :to="tradeLink(hero)" class="trade-button" :aria-label="`Trade for ${hero.name}`">Trade</RouterLink>
      </li>
    </ul>
  </template>
</template>

<style scoped>
.back-button {
  border: 0;
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}
.party-header {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.title {
  margin: 0;
  font-size: 28px;
}
.small {
  font-size: 13px;
}
.propose {
  width: 100%;
  margin: 4px 0 8px;
}
.section-title {
  margin: 16px 0 8px;
  font-size: 22px;
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
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 8px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}
.row.mystery {
  border-style: dashed;
  border-color: var(--gold);
}
.hero-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--text);
  text-decoration: none;
}
.hero-name {
  font-weight: 700;
}
.form {
  color: var(--gold);
}
.level {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
  white-space: nowrap;
}
.trade-button {
  min-height: var(--tap);
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--gold);
  border-radius: var(--radius-sm);
  color: var(--gold);
  font-weight: 700;
  text-decoration: none;
}
</style>
