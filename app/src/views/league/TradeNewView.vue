<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '../../api/inject'
import type { Hero, Trades } from '../../api/types'
import ClassIcon from '../../components/ClassIcon.vue'
import FormError from '../../components/FormError.vue'
import PlayerTag from '../../components/PlayerTag.vue'
import { levelText, levelValue } from '../../heroes'
import { useLeague } from '../../league'
import { offerProblem, releasesNeeded, TRADE_MAX_HEROES, windowText } from '../../trades'

/* Making a trade offer (docs/TRADES_SPEC.md): up to 3 of theirs for up to 3 of mine, with releases if I'd be over. */

const api = useApi()
const route = useRoute()
const router = useRouter()
const { league, myParty } = useLeague()

const partyId = String(route.query.party ?? '')
const other = computed(() => (partyId === myParty.value?.id ? null : (league.value?.parties.find(party => party.id === partyId) ?? null)))
const heroes = ref<Hero[]>([])
const trades = ref<Trades | null>(null)
const error = ref<unknown>(null)
const busy = ref(false)

const getting = ref<string[]>(typeof route.query.want === 'string' ? [route.query.want] : [])
const giving = ref<string[]>([])
const releases = ref<string[]>([])

onMounted(async () => {
  if (!league.value) return
  try {
    ;[heroes.value, trades.value] = await Promise.all([api.listHeroes(league.value.id), api.listTrades(league.value.id)])
    // A hero asked for who isn't on their roster (traded since) is dropped from the offer.
    getting.value = getting.value.filter(id => theirs.value.some(hero => hero.id === id))
  } catch (caught) {
    error.value = caught
  }
})

const byLevel = (a: Hero, b: Hero) => levelValue(b) - levelValue(a) || a.name.localeCompare(b.name)
const theirs = computed(() => heroes.value.filter(hero => hero.partyId === partyId).sort(byLevel))
const mine = computed(() => heroes.value.filter(hero => hero.partyId === myParty.value?.id).sort(byLevel))
const rosterSize = computed(() => trades.value?.rosterSize ?? 0)
const needed = computed(() => releasesNeeded(mine.value.length, giving.value.length, getting.value.length, rosterSize.value))
/** Releases come from the heroes I'm keeping */
const releasable = computed(() => mine.value.filter(hero => !giving.value.includes(hero.id)))
const problem = computed(() =>
  offerProblem({ getting: getting.value, giving: giving.value, releases: releases.value, rosterCount: mine.value.length, rosterSize: rosterSize.value })
)
const nameOf = (id: string) => heroes.value.find(hero => hero.id === id)?.name ?? ''

/** Adds or removes a hero from one of the picks, up to `limit` */
function toggle(list: typeof getting, id: string, limit: number) {
  if (list.value.includes(id)) list.value = list.value.filter(entry => entry !== id)
  else if (list.value.length < limit) list.value = [...list.value, id]
}
function toggleGiving(id: string) {
  toggle(giving, id, TRADE_MAX_HEROES)
  // A hero I give can't also be released, and the releases needed may change.
  releases.value = releases.value.filter(entry => entry !== id).slice(0, needed.value)
}
function toggleRelease(id: string) {
  toggle(releases, id, needed.value)
}
function toggleGetting(id: string) {
  toggle(getting, id, TRADE_MAX_HEROES)
  releases.value = releases.value.slice(0, needed.value)
}

async function send() {
  if (!league.value || !other.value || problem.value) return
  busy.value = true
  error.value = null
  try {
    await api.offerTrade(league.value.id, { toPartyId: other.value.id, offered: giving.value, requested: getting.value, releases: releases.value })
    await router.push(`/leagues/${league.value.id}/trades`)
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <header class="page-header">
    <button type="button" class="back-link back-button" @click="$router.back()">‹ Back</button>
    <h1 class="title">{{ other ? `Trade with ${other.name}` : 'Trade' }}</h1>
  </header>

  <FormError :error="error" />
  <p v-if="league && !other" class="card muted">Choose another party in this league to trade with.</p>
  <p v-else-if="trades && !trades.window.open" class="card muted">{{ windowText(trades.window) }}</p>

  <template v-else-if="other && trades">
    <p class="muted small">
      Pick up to {{ TRADE_MAX_HEROES }} heroes from each side. {{ other.name }} can accept or decline; nothing changes until they accept.
    </p>

    <fieldset class="picks">
      <legend class="section-title">You get · {{ getting.length }} of {{ TRADE_MAX_HEROES }}</legend>
      <label v-for="hero in theirs" :key="hero.id" class="option" :class="{ chosen: getting.includes(hero.id) }">
        <input
          type="checkbox"
          :checked="getting.includes(hero.id)"
          :disabled="!getting.includes(hero.id) && getting.length >= TRADE_MAX_HEROES"
          :aria-label="`Ask for ${hero.name}`"
          @change="toggleGetting(hero.id)"
        />
        <ClassIcon :hero-class="hero.heroClass" :size="32" />
        <span class="text">
          <span class="name">{{ hero.name }}</span>
          <PlayerTag :hero="hero" />
          <span class="muted small">{{ hero.heroClass }}</span>
        </span>
        <span class="level">{{ levelText(hero) }}</span>
      </label>
    </fieldset>

    <fieldset class="picks">
      <legend class="section-title">You give · {{ giving.length }} of {{ TRADE_MAX_HEROES }}</legend>
      <label v-for="hero in mine" :key="hero.id" class="option" :class="{ chosen: giving.includes(hero.id) }">
        <input
          type="checkbox"
          :checked="giving.includes(hero.id)"
          :disabled="!giving.includes(hero.id) && giving.length >= TRADE_MAX_HEROES"
          :aria-label="`Give ${hero.name}`"
          @change="toggleGiving(hero.id)"
        />
        <ClassIcon :hero-class="hero.heroClass" :size="32" />
        <span class="text">
          <span class="name">{{ hero.name }}</span>
          <PlayerTag :hero="hero" />
          <span class="muted small">{{ hero.heroClass }}</span>
        </span>
        <span class="level">{{ levelText(hero) }}</span>
      </label>
    </fieldset>

    <fieldset v-if="needed > 0" class="picks releases">
      <legend class="section-title">Release · {{ releases.length }} of {{ needed }}</legend>
      <p class="muted small">
        You’d have {{ mine.length - giving.length + getting.length }} heroes, {{ needed }} over the {{ rosterSize }} a party holds. Released
        heroes become free agents if {{ other.name }} accepts.
      </p>
      <label v-for="hero in releasable" :key="hero.id" class="option" :class="{ chosen: releases.includes(hero.id) }">
        <input
          type="checkbox"
          :checked="releases.includes(hero.id)"
          :disabled="!releases.includes(hero.id) && releases.length >= needed"
          :aria-label="`Release ${hero.name}`"
          @change="toggleRelease(hero.id)"
        />
        <ClassIcon :hero-class="hero.heroClass" :size="32" />
        <span class="text">
          <span class="name">{{ hero.name }}</span>
          <span class="muted small">{{ hero.heroClass }}</span>
        </span>
        <span class="level">{{ levelText(hero) }}</span>
      </label>
    </fieldset>
    <p v-else-if="giving.length > getting.length" class="muted small">
      You’ll have {{ giving.length - getting.length }} open roster {{ giving.length - getting.length === 1 ? 'spot' : 'spots' }} afterwards: claim
      free agents to fill them.
    </p>

    <section class="summary card" aria-live="polite">
      <p v-if="getting.length && giving.length">
        You give <strong>{{ giving.map(nameOf).join(', ') }}</strong> for <strong>{{ getting.map(nameOf).join(', ') }}</strong>
        <template v-if="releases.length">, releasing {{ releases.map(nameOf).join(', ') }}</template>.
      </p>
      <p v-if="problem" class="muted small">{{ problem }}</p>
      <button type="button" class="btn btn-primary" :disabled="!!problem || busy" @click="send">{{ busy ? 'Sending…' : 'Send offer' }}</button>
    </section>
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
.title {
  font-size: 28px;
}
.small {
  font-size: 13px;
}
.picks {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.section-title {
  margin: 16px 0 8px;
  padding: 0;
  font-size: 20px;
}
.option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  padding: 6px 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.option.chosen {
  border-color: var(--gold);
}
.option input {
  width: 20px;
  height: 20px;
  accent-color: var(--gold);
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
.level {
  font-family: var(--font-display);
  font-weight: 700;
  white-space: nowrap;
}
.summary {
  position: sticky;
  bottom: 84px;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.summary p {
  margin: 0;
}
.summary .btn {
  width: 100%;
}
</style>
