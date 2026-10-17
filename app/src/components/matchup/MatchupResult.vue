<script setup lang="ts">
import { computed } from 'vue'
import type { ResultHero, ResultSide, WeekResult } from '../../api/types'
import { critLabel, synergyInfo } from '../../heroes'
import { battleRecap } from '../../recap'
import CrestShield from '../CrestShield.vue'
import D20Badge from '../D20Badge.vue'

/* A played battle, laid out like the preview: both lineups hero by hero, with damage and crits. */

const props = defineProps<{ result: WeekResult; week: number; myPartyId: string | null; leagueId: string }>()

const isMe = (side: ResultSide | null) => !!side && side.partyId === props.myPartyId

/** The featured matchup: mine if I played, otherwise the first. Shown from my side when it's mine. */
const featured = computed(() => {
  const matchup = props.result.matchups.find(m => isMe(m.home) || isMe(m.away)) ?? props.result.matchups[0]
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

const recap = computed(() => (featured.value ? battleRecap({ week: props.week, ...featured.value }) : []))

interface Cell {
  /** The hero who fought the slot: the starter, or the bench hero swapped in for them */
  hero: ResultHero
  /** The resting starter a swapped-in hero replaced */
  replaced: ResultHero | null
  theirs: boolean
  isChampion: boolean
}

/** What happened in one slot for one side. */
function cellFor(side: ResultSide, slot: string, theirs: boolean): Cell | null {
  const starter = side.heroes.find(hero => hero.slot === slot)
  const sub = side.heroes.find(hero => hero.swappedInto === slot)
  const hero = sub ?? starter
  if (!hero) return null
  return { hero, replaced: sub ? (starter ?? null) : null, theirs, isChampion: hero.heroId === side.champion }
}

/** One row per starting slot, my side first. */
const rows = computed(() => {
  const value = featured.value
  if (!value) return []
  const sides = value.them ? [value.us, value.them] : [value.us]
  const slots = [...new Set(sides.flatMap(side => side.heroes.map(hero => hero.slot)).filter(slot => slot !== 'Bench'))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  )
  return slots.map(slot => ({
    key: slot,
    cells: value.them ? [cellFor(value.us, slot, false), cellFor(value.them, slot, true)] : [cellFor(value.us, slot, false)]
  }))
})

/** Explains a Champion who didn't fight; a Champion who fought is marked with a crown. */
function championNote(side: ResultSide): string {
  if (!side.champion) return isMe(side) ? 'No Champion was named for this battle.' : ''
  const hero = side.heroes.find(entry => entry.heroId === side.champion)
  return hero?.resting ? `${hero.name} was named Champion but was resting, so the bonus was lost.` : ''
}

const others = computed(() =>
  props.result.matchups.filter(m => m.home.partyId !== featured.value?.us.partyId && m.away?.partyId !== featured.value?.us.partyId)
)
</script>

<template>
  <template v-if="featured">
    <section class="scoreboard" aria-label="Battle result">
      <div class="verdict">{{ featured.verdict.toUpperCase() }}</div>
      <div class="sides">
        <div class="side">
          <CrestShield :crest="featured.us.crest" :size="40" />
          <span class="side-name">{{ featured.us.name }}</span>
          <span class="score">{{ Math.round(featured.us.total) }}</span>
        </div>
        <span class="vs">vs</span>
        <div class="side">
          <CrestShield v-if="featured.them" :crest="featured.them.crest" :size="40" />
          <span v-else class="monster-mark" aria-hidden="true">☠</span>
          <span class="side-name">{{ featured.opponentName }}</span>
          <span class="score muted">{{ Math.round(featured.opponentTotal) }}</span>
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

    <section v-if="recap.length" class="recap" aria-label="Battle recap">
      <p v-for="line in recap" :key="line">{{ line }}</p>
    </section>

    <div class="synergy-columns">
      <ul class="synergies" :aria-label="`${featured.us.name} synergies`">
        <li v-for="synergy in featured.us.synergies" :key="synergy" class="synergy" :title="synergyInfo(synergy).description">
          {{ synergyInfo(synergy).label }}
        </li>
      </ul>
      <ul v-if="featured.them" class="synergies theirs" :aria-label="`${featured.them.name} synergies`">
        <li v-for="synergy in featured.them.synergies" :key="synergy" class="synergy" :title="synergyInfo(synergy).description">
          {{ synergyInfo(synergy).label }}
        </li>
      </ul>
    </div>

    <div class="row-heading">
      <h2 class="section-title">Lineups</h2>
      <span class="muted small">Damage, rounded per hero</span>
    </div>
    <ol class="lineups" :class="{ solo: !featured.them }">
      <li v-for="row in rows" :key="row.key" class="lineup-row">
        <template v-for="(cell, index) in row.cells" :key="index">
          <RouterLink
            v-if="cell"
            :to="`/leagues/${leagueId}/heroes/${cell.hero.heroId}`"
            class="hero-cell result-cell"
            :class="[{ champion: cell.isChampion, theirs: cell.theirs, swapped: cell.replaced, resting: cell.hero.resting }, cell.hero.crit ?? '']"
          >
            <span class="hero-top">
              <span class="hero-name"><span v-if="cell.isChampion" class="crown" aria-label="Champion">♛ </span>{{ cell.hero.name }}</span>
              <span class="damage">
                <D20Badge v-if="cell.hero.crit" :crit="cell.hero.crit" :size="22" />{{ cell.hero.resting ? '–' : cell.hero.damage }}
              </span>
            </span>
            <span class="muted small">
              {{ cell.hero.heroClass }}<template v-if="cell.hero.resting"> · resting</template>
            </span>
            <span v-if="cell.replaced" class="swap-tag small">↺ in for {{ cell.replaced.name }} · half damage</span>
            <span v-if="cell.hero.crit" class="crit-name small" :class="cell.hero.crit">{{ critLabel(cell.hero.crit, cell.hero.heroClass) }}</span>
          </RouterLink>
          <span v-else class="hero-cell empty muted small">Empty slot</span>
        </template>
      </li>
    </ol>
    <p v-if="championNote(featured.us)" class="note">{{ championNote(featured.us) }}</p>
    <p v-if="!featured.them" class="note">{{ featured.opponentName }} fought as strong as the league's average party this week.</p>

    <template v-if="others.length">
      <h2 class="section-title others-title">Elsewhere in the league</h2>
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

<style scoped src="./matchup.css"></style>
<style scoped>
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
.score {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 48px;
  line-height: 0.95;
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
.recap {
  margin-top: 12px;
  padding: 12px 14px;
  border-left: 3px solid var(--gold);
  background: var(--surface-sunken);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-style: italic;
}
.recap p {
  margin: 0;
  line-height: 1.5;
}
.recap p + p {
  margin-top: 4px;
}
.result-cell .hero-top {
  justify-content: space-between;
  align-items: flex-start;
}
.damage {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
  line-height: 1;
}
.hero-cell.success {
  box-shadow: 0 0 0 1px var(--gold) inset;
}
.hero-cell.fail {
  box-shadow: 0 0 0 1px var(--danger) inset;
}
.swap-tag {
  color: var(--gold);
}
.crit-name.success {
  color: var(--gold-bright);
}
.crit-name.fail {
  color: var(--danger);
}
.others-title {
  margin: 18px 0 8px;
  color: var(--text-muted);
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
