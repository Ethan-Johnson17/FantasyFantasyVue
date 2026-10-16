<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../../api/inject'
import type { ResultSide, WeekResult } from '../../api/types'
import CrestShield from '../../components/CrestShield.vue'
import FormError from '../../components/FormError.vue'
import { synergyInfo } from '../../heroes'
import { useLeague } from '../../league'

const api = useApi()
const route = useRoute()
const { league, myParty } = useLeague()
const week = Number(route.params.week)
const result = ref<WeekResult | null>(null)
const error = ref<unknown>(null)

onMounted(async () => {
  if (!league.value) return
  try {
    result.value = await api.getWeekResult(league.value.id, week)
  } catch (caught) {
    error.value = caught
  }
})

const isMe = (side: ResultSide | null) => !!side && side.partyId === myParty.value?.id

/** The featured matchup: mine if I played, otherwise the first. Shown from my side when it's mine. */
const featured = computed(() => {
  const matchups = result.value?.matchups ?? []
  const matchup = matchups.find(m => isMe(m.home) || isMe(m.away)) ?? matchups[0]
  if (!matchup) return null
  const flip = !!matchup.away && isMe(matchup.away)
  const us = flip && matchup.away ? matchup.away : matchup.home
  const them = flip ? matchup.home : matchup.away
  const opponentName = them?.name ?? matchup.monster?.name ?? 'Dungeon monster'
  const opponentTotal = them?.total ?? matchup.monster?.total ?? 0
  const won = matchup.outcome !== 'draw' && (matchup.outcome === 'home') !== flip
  const verdict = matchup.outcome === 'draw' ? 'Draw' : isMe(us) ? (won ? 'Victory' : 'Defeat') : `${won ? us.name : opponentName} wins`
  const share = us.total + opponentTotal > 0 ? Math.round((us.total / (us.total + opponentTotal)) * 100) : 50
  return { us, them, opponentName, opponentTotal, verdict, share }
})

/** Heroes that dealt damage for a side: starters and swapped-in bench heroes, best first. */
function fighters(side: ResultSide) {
  return side.heroes.filter(hero => hero.slot !== 'Bench' || hero.swappedInto).sort((a, b) => b.damage - a.damage)
}

/** "Lyra was resting this week, so Freya stepped in from the bench at half damage." */
function swapNotes(side: ResultSide): string[] {
  return side.heroes
    .filter(hero => hero.swappedInto)
    .map(sub => {
      const rested = side.heroes.find(hero => hero.slot === sub.swappedInto && hero.resting)
      return `${rested?.name ?? 'A starter'} was resting this week, so ${sub.name} stepped in from the bench at half damage.`
    })
}

/** Explains a Champion who didn't fight; a Champion who fought is marked with a crown. */
function championNote(side: ResultSide): string {
  if (!side.champion) return isMe(side) ? 'No Champion was named for this battle.' : ''
  const hero = side.heroes.find(entry => entry.heroId === side.champion)
  return hero?.resting ? `${hero.name} was named Champion but was resting, so the bonus was lost.` : ''
}

const others = computed(() => (result.value?.matchups ?? []).filter(m => m.home.partyId !== featured.value?.us.partyId && m.away?.partyId !== featured.value?.us.partyId))
</script>

<template>
  <header class="page-header row">
    <RouterLink :to="`/leagues/${league?.id}/battles`" class="back-link">‹ Battles</RouterLink>
    <span class="eyebrow">Week {{ week }} of 14</span>
  </header>

  <FormError :error="error" />

  <template v-if="featured">
    <section class="scoreboard" aria-label="Battle result">
      <div class="verdict">{{ featured.verdict.toUpperCase() }}</div>
      <div class="scores">
        <div class="side">
          <span class="side-name">{{ featured.us.name }}</span>
          <span class="score">{{ Math.round(featured.us.total) }}</span>
        </div>
        <span class="vs">vs</span>
        <div class="side muted">
          <span class="side-name">{{ featured.opponentName }}</span>
          <span class="score">{{ Math.round(featured.opponentTotal) }}</span>
        </div>
      </div>
      <div
        class="share"
        role="img"
        :aria-label="`Share of damage: ${featured.us.name} ${Math.round(featured.us.total)}, ${featured.opponentName} ${Math.round(featured.opponentTotal)}`"
      >
        <div class="share-fill" :style="{ width: `${featured.share}%` }"></div>
      </div>
    </section>

    <ul v-if="featured.us.synergies.length" class="synergies" aria-label="Synergies">
      <li v-for="synergy in featured.us.synergies" :key="synergy" class="synergy" :title="synergyInfo(synergy).description">
        {{ synergyInfo(synergy).label }}
      </li>
    </ul>

    <div class="row-heading">
      <h2 class="section-title">{{ isMe(featured.us) ? 'Your party' : featured.us.name }}</h2>
      <span class="muted small">Damage, rounded per hero</span>
    </div>
    <ul class="fighters">
      <li v-for="(hero, index) in fighters(featured.us)" :key="hero.heroId" class="fighter" :class="{ swapped: hero.swappedInto }">
        <RouterLink :to="`/leagues/${league?.id}/heroes/${hero.heroId}`" class="fighter-name">
          <span v-if="hero.heroId === featured.us.champion" class="champion-tag" aria-label="Champion">♛ </span>{{ hero.name
          }}<span v-if="hero.swappedInto" class="swap-tag"> ↺ swapped in</span>
        </RouterLink>
        <span class="muted small">{{ hero.heroClass }}{{ hero.swappedInto ? ' · from the bench' : '' }}</span>
        <span class="damage" :class="{ top: index === 0 }">{{ hero.damage }}</span>
      </li>
    </ul>
    <p v-for="text in swapNotes(featured.us)" :key="text" class="note swap-note">{{ text }}</p>
    <p v-if="championNote(featured.us)" class="note swap-note">{{ championNote(featured.us) }}</p>

    <template v-if="featured.them">
      <h2 class="section-title opponent-title">{{ featured.them.name }}</h2>
      <div class="opponent-grid">
        <div v-for="hero in fighters(featured.them)" :key="hero.heroId" class="opponent-hero">
          <span class="opponent-damage">{{ hero.damage }}</span>
          <span class="muted tiny">{{ hero.heroClass }}</span>
        </div>
      </div>
    </template>
    <p v-else class="note swap-note">{{ featured.opponentName }} fought as strong as the league's average party this week.</p>

    <template v-if="others.length">
      <h2 class="section-title opponent-title">Elsewhere in the league</h2>
      <ul class="others">
        <li v-for="matchup in others" :key="matchup.home.partyId" class="card other">
          <CrestShield :crest="matchup.home.crest" :size="22" />
          <span>{{ matchup.home.name }} {{ Math.round(matchup.home.total) }}</span>
          <span class="muted">–</span>
          <span>{{ Math.round(matchup.away?.total ?? matchup.monster?.total ?? 0) }} {{ matchup.away?.name ?? matchup.monster?.name }}</span>
        </li>
      </ul>
    </template>
  </template>
</template>

<style scoped>
.row {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.small {
  font-size: 13px;
}
.tiny {
  font-size: 12px;
}
.scoreboard {
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  box-shadow:
    0 0 0 3px var(--ink),
    0 0 0 4px var(--line);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.verdict {
  align-self: center;
  padding: 3px 16px;
  border-radius: 999px;
  background: var(--gold);
  color: var(--on-gold);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
  letter-spacing: 0.12em;
}
.scores {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: end;
  gap: 10px;
  text-align: center;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.side-name {
  font-size: 15px;
  font-weight: 700;
}
.score {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 56px;
  line-height: 0.9;
}
.vs {
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--text-muted);
  padding-bottom: 8px;
}
.share {
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--line);
}
.share-fill {
  height: 100%;
  background: var(--gold);
}
.row-heading {
  margin: 16px 0 6px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.section-title {
  font-size: 22px;
}
.fighters {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fighter {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 12px;
  padding: 9px 12px;
  background: var(--surface);
  border-radius: var(--radius-sm);
}
.fighter.swapped {
  border: 1px dashed #8a7a5a;
}
.fighter-name {
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
}
.champion-tag {
  color: var(--gold);
}
.synergies {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.synergy {
  padding: 2px 10px;
  border: 1px solid var(--gold);
  border-radius: 999px;
  color: var(--gold);
  font-size: 14px;
}
.swap-tag {
  font-weight: 400;
  color: var(--gold);
}
.damage {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 24px;
}
.damage.top {
  color: var(--gold);
}
.swap-note {
  margin-top: 12px;
}
.opponent-title {
  margin: 18px 0 8px;
  color: var(--text-muted);
}
.opponent-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  text-align: center;
}
.opponent-hero {
  padding: 8px 4px;
  background: var(--surface-sunken);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
}
.opponent-damage {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
}
.others {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.other {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}
</style>
