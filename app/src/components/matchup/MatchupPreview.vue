<script setup lang="ts">
import { computed } from 'vue'
import type { Matchup, MatchupSide } from '../../api/types'
import { levelText, synergyInfo } from '../../heroes'
import { timeUntil } from '../../time'
import ClassIcon from '../ClassIcon.vue'
import CrestShield from '../CrestShield.vue'
import TraitChips from '../TraitChips.vue'

/* An upcoming battle: both lineups as they stand now, Champions, synergies, and the series so far. */

const props = defineProps<{ matchup: Matchup; leagueId: string }>()

const recordText = (side: MatchupSide) =>
  `${String(side.record.wins)}–${String(side.record.losses)}${side.record.draws ? `–${String(side.record.draws)}` : ''}`

/** One row per lineup slot: my hero, then theirs (none against the monster). */
const rows = computed(() => {
  const { me, opponent } = props.matchup
  const cell = (side: MatchupSide, index: number, theirs: boolean) => {
    const hero = side.starters[index]?.hero ?? null
    return { hero, theirs, isChampion: !!hero && hero.id === side.champion }
  }
  return me.starters.map((entry, index) => ({
    key: entry.slot,
    cells: opponent ? [cell(me, index, false), cell(opponent, index, true)] : [cell(me, index, false)]
  }))
})

/** "You lead 2–1", "Tied 1–1", or "First meeting". */
const series = computed(() => {
  const { meetings } = props.matchup
  if (!meetings.length) return 'First meeting'
  const won = meetings.filter(m => m.outcome === 'win').length
  const lost = meetings.filter(m => m.outcome === 'loss').length
  const score = `${String(won)}–${String(lost)}`
  return won > lost ? `You lead ${score}` : won < lost ? `They lead ${score}` : `Tied ${score}`
})

const OUTCOME = { win: 'Victory', loss: 'Defeat', draw: 'Draw' } as const
</script>

<template>
  <section class="scoreboard" aria-label="Upcoming battle">
    <div class="sides">
      <div class="side">
        <CrestShield :crest="matchup.me.crest" :size="48" />
        <span class="side-name">{{ matchup.me.name }}</span>
        <span class="muted small">{{ recordText(matchup.me) }}</span>
      </div>
      <span class="vs">vs</span>
      <div class="side">
        <template v-if="matchup.opponent">
          <CrestShield :crest="matchup.opponent.crest" :size="48" />
          <span class="side-name">{{ matchup.opponent.name }}</span>
          <span class="muted small">{{ recordText(matchup.opponent) }}</span>
        </template>
        <template v-else>
          <span class="monster-mark" aria-hidden="true">☠</span>
          <span class="side-name">{{ matchup.monster?.name ?? 'Dungeon monster' }}</span>
          <span class="muted small">Dungeon monster</span>
        </template>
      </div>
    </div>
    <p class="when small">Battle begins {{ timeUntil(new Date(matchup.resolvesAt)) }} · lineups lock then</p>
    <p v-if="matchup.opponent" class="series">{{ series }}</p>
  </section>

  <div class="synergy-columns">
    <ul class="synergies" :aria-label="`${matchup.me.name} synergies`">
      <li v-for="synergy in matchup.me.synergies" :key="synergy" class="synergy" :title="synergyInfo(synergy).description">
        {{ synergyInfo(synergy).label }}
      </li>
      <li v-if="!matchup.me.synergies.length" class="muted small">No synergies</li>
    </ul>
    <ul v-if="matchup.opponent" class="synergies theirs" :aria-label="`${matchup.opponent.name} synergies`">
      <li v-for="synergy in matchup.opponent.synergies" :key="synergy" class="synergy" :title="synergyInfo(synergy).description">
        {{ synergyInfo(synergy).label }}
      </li>
      <li v-if="!matchup.opponent.synergies.length" class="muted small">No synergies</li>
    </ul>
  </div>

  <div class="row-heading">
    <h2 class="section-title">Starting lineups</h2>
    <RouterLink :to="`/leagues/${leagueId}/party`" class="edit-link">Edit yours ›</RouterLink>
  </div>
  <p v-if="!matchup.restingKnown" class="muted small lineup-note">Lineups as they stand today. Who rests shows once this is the next battle.</p>

  <ol class="lineups" :class="{ solo: !matchup.opponent }">
    <li v-for="row in rows" :key="row.key" class="lineup-row">
      <template v-for="cell in row.cells" :key="cell.theirs ? 'theirs' : 'mine'">
        <RouterLink
          v-if="cell.hero"
          :to="`/leagues/${leagueId}/heroes/${cell.hero.id}`"
          class="hero-cell"
          :class="{ resting: cell.hero.restingNextWeek, champion: cell.isChampion, theirs: cell.theirs }"
        >
          <span class="hero-top">
            <ClassIcon :hero-class="cell.hero.heroClass" :size="28" />
            <span class="hero-name"><span v-if="cell.isChampion" class="crown" aria-label="Champion">♛ </span>{{ cell.hero.name }}</span>
          </span>
          <span class="muted small">
            {{ cell.hero.heroClass }} · {{ levelText(cell.hero) }}<span v-if="cell.hero.restingNextWeek" class="resting-text"> · resting</span>
          </span>
          <TraitChips :traits="cell.hero.traits" />
        </RouterLink>
        <span v-else class="hero-cell empty muted small">Empty slot</span>
      </template>
    </li>
  </ol>
  <p v-if="!matchup.opponent" class="note">{{ matchup.monster?.name ?? 'The monster' }} fights as strong as the league's average party this week.</p>

  <template v-if="matchup.meetings.length">
    <h2 class="section-title spaced">Earlier meetings</h2>
    <ul class="meetings">
      <li v-for="meeting in matchup.meetings" :key="meeting.week">
        <RouterLink :to="`/leagues/${leagueId}/matchup/${meeting.week}`" class="card meeting">
          <span>Week {{ meeting.week }}</span>
          <span class="outcome" :class="meeting.outcome">{{ OUTCOME[meeting.outcome] }}</span>
          <span class="num">{{ Math.round(meeting.myTotal) }}–{{ Math.round(meeting.theirTotal) }}</span>
        </RouterLink>
      </li>
    </ul>
  </template>
</template>

<style scoped src="./matchup.css"></style>
<style scoped>
.when,
.series {
  margin: 0;
}
.series {
  align-self: center;
  padding: 2px 12px;
  border: 1px solid var(--gold);
  border-radius: 999px;
  color: var(--gold);
  font-size: 14px;
}
.edit-link {
  font-size: 14px;
}
.lineup-note {
  margin: -2px 0 8px;
}
.section-title.spaced {
  margin: 18px 0 8px;
}
.meetings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.meeting {
  padding: 10px 12px;
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  color: var(--text);
  text-decoration: none;
}
.outcome.win {
  color: var(--gold);
}
.outcome.loss {
  color: var(--danger);
}
.num {
  font-variant-numeric: tabular-nums;
}
</style>
