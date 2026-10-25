<script setup lang="ts">
import { computed } from 'vue'
import type { Outcome, ResultHero, ResultSide, WeekResult } from '../../api/types'
import { critLabel, synergyInfo } from '../../heroes'
import ClassIcon from '../ClassIcon.vue'
import CrestShield from '../CrestShield.vue'
import D20Badge from '../D20Badge.vue'
import EncounterCard from '../EncounterCard.vue'

/* A played Crossover week: both boards, the football lineups with real points, and the Quest parties' damage. */

const props = defineProps<{ result: WeekResult; myPartyId: string | null; leagueId: string }>()

/** Crossover's football slots in lineup order (ruleset keys), with their labels. */
const SLOTS: readonly { key: string; label: string }[] = [
  { key: 'qb', label: 'QB' },
  { key: 'rb1', label: 'RB' },
  { key: 'rb2', label: 'RB' },
  { key: 'wr1', label: 'WR' },
  { key: 'wr2', label: 'WR' },
  { key: 'te', label: 'TE' },
  { key: 'flex', label: 'FLEX' },
  { key: 'def', label: 'DEF' }
]

const isMe = (side: ResultSide | null) => !!side && side.partyId === props.myPartyId

const featured = computed(() => {
  const matchup = props.result.matchups.find(m => isMe(m.home) || isMe(m.away)) ?? props.result.matchups[0]
  if (!matchup) return null
  const flip = !!matchup.away && isMe(matchup.away)
  const us = flip && matchup.away ? matchup.away : matchup.home
  const them = flip ? matchup.home : matchup.away
  // Outcomes are stored from the home side's view; turn them into ours.
  const ours = (outcome: Outcome | null | undefined): 'win' | 'loss' | 'draw' =>
    outcome === 'draw' || !outcome ? 'draw' : (outcome === 'home') !== flip ? 'win' : 'loss'
  const boards = [
    {
      name: 'Gridiron',
      hint: 'Football lineup · fantasy points',
      ours: us.gridiron ?? 0,
      theirs: them?.gridiron ?? matchup.monster?.gridiron ?? 0,
      outcome: ours(matchup.gridironOutcome)
    },
    { name: 'Quest', hint: 'Quest party vs the encounter', ours: us.total, theirs: them?.total ?? matchup.monster?.total ?? 0, outcome: ours(matchup.outcome) }
  ]
  const won = boards.reduce((sum, board) => sum + (board.outcome === 'win' ? 1 : board.outcome === 'draw' ? 0.5 : 0), 0)
  const opponentName = them?.name ?? matchup.monster?.name ?? 'The encounter'
  const verdict = isMe(us)
    ? won === 2
      ? 'SWEEP'
      : won === 0
        ? 'SWEPT'
        : won === 1
          ? 'SPLIT'
          : won > 1
            ? 'EDGED IT'
            : 'EDGED OUT'
    : won > 1
      ? `${us.name} wins`
      : won < 1
        ? `${opponentName} wins`
        : 'Split'
  return { us, them, opponentName, boards, verdict }
})

const round1 = (value: number) => Math.round(value * 10) / 10
const heroIn = (side: ResultSide | null, slot: string) => side?.heroes.find(hero => hero.slot === slot) ?? null
const footballRows = computed(() => {
  const value = featured.value
  if (!value) return []
  return SLOTS.filter(slot => value.us.heroes.some(hero => hero.slot === slot.key)).map(slot => ({
    ...slot,
    cells: value.them ? [heroIn(value.us, slot.key), heroIn(value.them, slot.key)] : [heroIn(value.us, slot.key)]
  }))
})
const questOf = (side: ResultSide | null) => (side?.heroes ?? []).filter(hero => hero.quest).sort((a, b) => b.damage - a.damage)
const questRows = computed(() => {
  const value = featured.value
  if (!value) return []
  const mine = questOf(value.us)
  const theirs = questOf(value.them)
  return Array.from({ length: Math.max(mine.length, theirs.length) }, (_, index) => ({
    key: index,
    cells: value.them ? [mine[index] ?? null, theirs[index] ?? null] : [mine[index] ?? null]
  }))
})
/** Heroes in neither lineup: what they scored. */
const sidelined = computed(() => {
  const value = featured.value
  if (!value) return []
  return value.us.heroes.filter(hero => hero.slot === 'Bench' && !hero.quest).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
})
const championOf = (index: number) => (index === 0 ? featured.value?.us.champion : featured.value?.them?.champion) ?? null
const pointsText = (hero: ResultHero) => (hero.resting ? 'Didn’t play' : `${String(round1(hero.points ?? 0))} pts`)
</script>

<template>
  <template v-if="featured">
    <EncounterCard v-if="result.encounter" :encounter="result.encounter" />

    <section class="scoreboard" aria-label="Battle result">
      <p class="verdict" :class="{ win: featured.verdict === 'SWEEP', loss: featured.verdict === 'SWEPT' }">{{ featured.verdict }}</p>
      <div class="sides">
        <div class="side">
          <CrestShield :crest="featured.us.crest" :size="40" />
          <span class="side-name">{{ featured.us.name }}</span>
        </div>
        <span class="vs">vs</span>
        <div class="side">
          <template v-if="featured.them">
            <CrestShield :crest="featured.them.crest" :size="40" />
            <span class="side-name">{{ featured.them.name }}</span>
          </template>
          <template v-else>
            <span class="monster-mark" aria-hidden="true">☠</span>
            <span class="side-name">{{ featured.opponentName }}</span>
          </template>
        </div>
      </div>
      <ul class="boards">
        <li v-for="board in featured.boards" :key="board.name" class="board" :class="board.outcome">
          <span class="board-name">{{ board.name }}<span class="muted small"> · {{ board.hint }}</span></span>
          <span class="board-scores">
            <strong :class="{ ahead: board.outcome === 'win' }">{{ round1(board.ours) }}</strong>
            <span class="muted">–</span>
            <strong :class="{ ahead: board.outcome === 'loss' }">{{ round1(board.theirs) }}</strong>
          </span>
        </li>
      </ul>
    </section>

    <div class="row-heading">
      <h2 class="section-title">Football lineups</h2>
      <span class="muted small">Fantasy points</span>
    </div>
    <ol class="lineups" :class="{ solo: !featured.them }">
      <li v-for="row in footballRows" :key="row.key" class="lineup-row">
        <template v-for="(hero, index) in row.cells" :key="index">
          <RouterLink v-if="hero" :to="`/leagues/${leagueId}/heroes/${hero.heroId}`" class="hero-cell" :class="{ resting: hero.resting, theirs: index === 1 }">
            <span class="hero-top">
              <span class="slot-label small">{{ row.label }}</span>
              <span class="hero-name">{{ hero.name }}</span>
            </span>
            <span class="points" :class="{ resting: hero.resting }">{{ pointsText(hero) }}</span>
          </RouterLink>
          <span v-else class="hero-cell empty muted small">—</span>
        </template>
      </li>
    </ol>

    <div class="row-heading">
      <h2 class="section-title">Quest parties</h2>
      <span class="muted small">Damage dealt to {{ result.encounter?.name ?? 'the encounter' }}</span>
    </div>
    <div class="synergy-columns">
      <ul class="synergies" aria-label="Your synergies">
        <li v-for="synergy in featured.us.synergies" :key="synergy" class="synergy" :title="synergyInfo(synergy).description">{{ synergyInfo(synergy).label }}</li>
      </ul>
      <ul v-if="featured.them" class="synergies theirs" aria-label="Their synergies">
        <li v-for="synergy in featured.them.synergies" :key="synergy" class="synergy" :title="synergyInfo(synergy).description">{{ synergyInfo(synergy).label }}</li>
      </ul>
    </div>
    <ol class="lineups quest" :class="{ solo: !featured.them }">
      <li v-for="row in questRows" :key="row.key" class="lineup-row">
        <template v-for="(hero, index) in row.cells" :key="index">
          <RouterLink
            v-if="hero"
            :to="`/leagues/${leagueId}/heroes/${hero.heroId}`"
            class="hero-cell"
            :class="{ resting: hero.resting, champion: hero.heroId === championOf(index), theirs: index === 1 }"
          >
            <span class="hero-top">
              <ClassIcon :hero-class="hero.heroClass" :size="24" />
              <span class="hero-name"><span v-if="hero.heroId === championOf(index)" class="crown" aria-label="Champion">♛ </span>{{ hero.name }}</span>
              <span class="damage">{{ hero.resting ? '–' : hero.damage }}</span>
            </span>
            <span v-if="hero.crit" class="crit small"><D20Badge :crit="hero.crit" :size="20" /> {{ critLabel(hero.crit, hero.heroClass) }}</span>
          </RouterLink>
          <span v-else class="hero-cell empty muted small">—</span>
        </template>
      </li>
    </ol>

    <template v-if="sidelined.length">
      <div class="row-heading">
        <h2 class="section-title">Sat out</h2>
        <span class="muted small">In neither lineup · didn't count</span>
      </div>
      <ul class="sidelined">
        <li v-for="hero in sidelined" :key="hero.heroId" class="muted small">{{ hero.name }} · {{ pointsText(hero) }}</li>
      </ul>
    </template>
  </template>
</template>

<style scoped src="./matchup.css"></style>
<style scoped>
.verdict {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 28px;
  letter-spacing: 0.08em;
}
.verdict.win {
  color: var(--gold);
}
.verdict.loss {
  color: var(--danger);
}
.boards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.board {
  padding: 6px 10px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  text-align: left;
}
.board.win {
  border-color: var(--gold);
}
.board-name {
  font-weight: 700;
}
.board-scores {
  flex: none;
  display: flex;
  gap: 6px;
  font-family: var(--font-display);
  font-size: 20px;
}
.board-scores .ahead {
  color: var(--gold);
}
.slot-label {
  flex: none;
  min-width: 34px;
  color: var(--text-muted);
  font-weight: 700;
}
.points {
  color: var(--gold);
  font-weight: 700;
}
.points.resting {
  color: var(--text-muted);
  font-weight: 400;
}
.damage {
  margin-left: auto;
  flex: none;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
}
.crit {
  display: flex;
  align-items: center;
  gap: 6px;
}
.quest {
  margin-top: 8px;
}
.sidelined {
  margin: 0;
  padding-left: 18px;
}
</style>
