<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { Hero, Trade, Trades } from '../../api/types'
import FormError from '../../components/FormError.vue'
import { levelText } from '../../heroes'
import { useLeague } from '../../league'
import { heroNames, TRADE_STATUS, tradeLine, windowText } from '../../trades'

/* The Trades inbox (docs/TRADES_SPEC.md): offers waiting on me, offers I sent, and the latest answered. */

const api = useApi()
const { league, myParty, reload } = useLeague()

const trades = ref<Trades | null>(null)
const myHeroes = ref<Hero[]>([])
const error = ref<unknown>(null)
const busy = ref<string | null>(null)
/** The offer being accepted that needs releases, and the ones picked */
const accepting = ref<{ trade: Trade; releases: string[] } | null>(null)
const notice = ref('')

async function load() {
  if (!league.value) return
  const [fresh, heroes] = await Promise.all([api.listTrades(league.value.id), api.listHeroes(league.value.id)])
  trades.value = fresh
  myHeroes.value = heroes.filter(hero => hero.partyId === myParty.value?.id)
}
onMounted(async () => {
  try {
    await load()
  } catch (caught) {
    error.value = caught
  }
})

const waiting = computed(() => trades.value?.open.filter(trade => trade.waitingOnMe) ?? [])
const sent = computed(() => trades.value?.open.filter(trade => !trade.waitingOnMe) ?? [])
const myId = computed(() => myParty.value?.id ?? null)
/** Heroes I could release on accepting: mine, other than the ones the offer asks for */
const releasable = computed(() =>
  accepting.value ? myHeroes.value.filter(hero => !accepting.value?.trade.requested.some(asked => asked.heroId === hero.id)) : []
)

async function act(trade: Trade, work: () => Promise<Trade>, done: string) {
  if (!league.value) return
  busy.value = trade.id
  error.value = null
  notice.value = ''
  try {
    await work()
    accepting.value = null
    notice.value = done
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = null
  }
  // Either way: an offer that failed may have expired, and the badge may have changed.
  try {
    await Promise.all([load(), reload()])
  } catch (caught) {
    error.value = caught
  }
}

function accept(trade: Trade) {
  const id = league.value?.id
  if (!id) return
  if (trade.releasesNeeded > 0 && accepting.value?.trade.id !== trade.id) {
    accepting.value = { trade, releases: [] }
    return
  }
  const releases = accepting.value?.trade.id === trade.id ? accepting.value.releases : []
  if (!window.confirm(`Accept? ${tradeLine(trade, myId.value)}. It happens at once.`)) return
  void act(trade, () => api.acceptTrade(id, trade.id, releases), `Trade done: ${heroNames(trade.offered)} joined your party.`)
}
function decline(trade: Trade) {
  const id = league.value?.id
  if (id) void act(trade, () => api.declineTrade(id, trade.id), 'Offer declined.')
}
function withdraw(trade: Trade) {
  const id = league.value?.id
  if (id) void act(trade, () => api.withdrawTrade(id, trade.id), 'Offer withdrawn.')
}
function toggleRelease(heroId: string) {
  const current = accepting.value
  if (!current) return
  const picked = current.releases.includes(heroId)
  if (!picked && current.releases.length >= current.trade.releasesNeeded) return
  current.releases = picked ? current.releases.filter(id => id !== heroId) : [...current.releases, heroId]
}
</script>

<template>
  <header class="page-header">
    <div class="eyebrow">{{ league?.name }}</div>
    <h1 class="title">Trades</h1>
    <p v-if="trades" class="muted small window">{{ windowText(trades.window) }}</p>
  </header>

  <FormError :error="error" />
  <p v-if="notice" class="notice" role="status">✓ {{ notice }}</p>

  <template v-if="trades">
    <p class="muted small">To make an offer, open a party from the standings or your matchup and tap a hero you want.</p>

    <h2 class="section-title">Waiting on you</h2>
    <p v-if="!waiting.length" class="muted small">No offers waiting on you.</p>
    <ul class="offers">
      <li v-for="trade in waiting" :key="trade.id" class="card offer">
        <p class="line">{{ tradeLine(trade, myId) }}</p>
        <p v-if="trade.fromReleases.length" class="muted small">{{ trade.from.name }} releases {{ heroNames(trade.fromReleases) }} to make room.</p>
        <p v-if="trade.releasesNeeded" class="muted small">
          You’d be {{ trade.releasesNeeded }} over your roster: accepting releases {{ trade.releasesNeeded }} of your heroes.
        </p>

        <fieldset v-if="accepting?.trade.id === trade.id" class="releases">
          <legend class="small">Release {{ accepting.releases.length }} of {{ trade.releasesNeeded }}</legend>
          <label v-for="hero in releasable" :key="hero.id" class="option" :class="{ chosen: accepting.releases.includes(hero.id) }">
            <input
              type="checkbox"
              :checked="accepting.releases.includes(hero.id)"
              :disabled="!accepting.releases.includes(hero.id) && accepting.releases.length >= trade.releasesNeeded"
              :aria-label="`Release ${hero.name}`"
              @change="toggleRelease(hero.id)"
            />
            <span class="name">{{ hero.name }}</span>
            <span class="muted small">{{ hero.heroClass }} · {{ levelText(hero) }}</span>
          </label>
        </fieldset>

        <div class="actions">
          <button type="button" class="btn btn-secondary" :disabled="busy === trade.id" @click="decline(trade)">Decline</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy === trade.id || (accepting?.trade.id === trade.id && accepting.releases.length !== trade.releasesNeeded)"
            @click="accept(trade)"
          >
            {{ trade.releasesNeeded && accepting?.trade.id !== trade.id ? 'Accept…' : 'Accept' }}
          </button>
        </div>
      </li>
    </ul>

    <h2 class="section-title">Sent</h2>
    <p v-if="!sent.length" class="muted small">No open offers from you.</p>
    <ul class="offers">
      <li v-for="trade in sent" :key="trade.id" class="card offer">
        <p class="line">{{ tradeLine(trade, myId) }}</p>
        <p v-if="trade.fromReleases.length" class="muted small">You release {{ heroNames(trade.fromReleases) }} if they accept.</p>
        <div class="actions">
          <button type="button" class="link-button" :disabled="busy === trade.id" @click="withdraw(trade)">Withdraw</button>
        </div>
      </li>
    </ul>

    <template v-if="trades.answered.length">
      <h2 class="section-title">Earlier</h2>
      <ul class="offers">
        <li v-for="trade in trades.answered" :key="trade.id" class="answered">
          <span class="status" :class="trade.status">{{ TRADE_STATUS[trade.status] }}</span>
          {{ tradeLine(trade, myId) }}
          <span v-if="trade.status === 'accepted' && trade.effectiveWeek" class="muted small">· from battle {{ trade.effectiveWeek }}</span>
        </li>
      </ul>
    </template>
  </template>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.small {
  font-size: 13px;
}
.window {
  margin: 4px 0 0;
}
.notice {
  color: var(--gold);
}
.section-title {
  margin: 18px 0 8px;
  font-size: 22px;
}
.offers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.offer {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.offer p {
  margin: 0;
}
.line {
  line-height: 1.4;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.releases {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
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
.name {
  flex: 1;
  font-weight: 700;
}
.link-button {
  min-height: var(--tap);
  border: 0;
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.answered {
  padding: 8px 12px;
  border-left: 2px solid var(--line-strong);
  line-height: 1.4;
}
.status {
  margin-right: 6px;
  font-weight: 700;
}
.status.accepted {
  color: var(--gold);
}
</style>
