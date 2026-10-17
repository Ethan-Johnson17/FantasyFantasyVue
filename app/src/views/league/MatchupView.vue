<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { Matchup, MatchupSide } from '../../api/types'
import ClassIcon from '../../components/ClassIcon.vue'
import CrestShield from '../../components/CrestShield.vue'
import FormError from '../../components/FormError.vue'
import TraitChips from '../../components/TraitChips.vue'
import { levelText, synergyInfo } from '../../heroes'
import { useLeague } from '../../league'
import { SEASON_WEEKS, timeUntil } from '../../time'

/* The head-to-head preview for my next battle. Past battles live on the result screen. */

const api = useApi()
const { league } = useLeague()
const matchup = ref<Matchup | null>(null)
const error = ref<unknown>(null)

onMounted(async () => {
  if (!league.value) return
  try {
    matchup.value = await api.getMatchup(league.value.id)
  } catch (caught) {
    error.value = caught
  }
})

const recordText = (side: MatchupSide) =>
  `${String(side.record.wins)}–${String(side.record.losses)}${side.record.draws ? `–${String(side.record.draws)}` : ''}`

/** One row per lineup slot: my hero, then theirs (none against the monster). */
const rows = computed(() => {
  const value = matchup.value
  if (!value) return []
  const cell = (side: MatchupSide, index: number, theirs: boolean) => {
    const hero = side.starters[index]?.hero ?? null
    return { hero, theirs, isChampion: !!hero && hero.id === side.champion }
  }
  return value.me.starters.map((entry, index) => ({
    key: entry.slot,
    cells: value.opponent ? [cell(value.me, index, false), cell(value.opponent, index, true)] : [cell(value.me, index, false)]
  }))
})

/** "You lead 2–1", "Tied 1–1", or "First meeting". */
const series = computed(() => {
  const meetings = matchup.value?.meetings ?? []
  if (!meetings.length) return 'First meeting'
  const won = meetings.filter(m => m.outcome === 'win').length
  const lost = meetings.filter(m => m.outcome === 'loss').length
  const score = `${String(won)}–${String(lost)}`
  return won > lost ? `You lead ${score}` : won < lost ? `They lead ${score}` : `Tied ${score}`
})

const OUTCOME = { win: 'Victory', loss: 'Defeat', draw: 'Draw' } as const
</script>

<template>
  <header class="page-header row">
    <RouterLink :to="`/leagues/${league?.id}/battles`" class="back-link">‹ Battles</RouterLink>
    <span v-if="matchup" class="eyebrow">Week {{ matchup.week }} of {{ SEASON_WEEKS }}</span>
  </header>

  <FormError :error="error" />

  <template v-if="matchup">
    <section class="scoreboard" aria-label="Next battle">
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
      <RouterLink :to="`/leagues/${league?.id}/party`" class="edit-link">Edit yours ›</RouterLink>
    </div>

    <ol class="lineups" :class="{ solo: !matchup.opponent }">
      <li v-for="row in rows" :key="row.key" class="lineup-row">
        <template v-for="cell in row.cells" :key="cell.theirs ? 'theirs' : 'mine'">
          <RouterLink
            v-if="cell.hero"
            :to="`/leagues/${league?.id}/heroes/${cell.hero.id}`"
            class="hero-cell"
            :class="{ resting: cell.hero.restingNextWeek, champion: cell.isChampion, theirs: cell.theirs }"
          >
            <span class="hero-top">
              <ClassIcon :hero-class="cell.hero.heroClass" :size="28" />
              <span class="hero-name">
                <span v-if="cell.isChampion" class="crown" aria-label="Champion">♛ </span>{{ cell.hero.name }}
              </span>
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
          <RouterLink :to="`/leagues/${league?.id}/battles/${meeting.week}`" class="card meeting">
            <span>Week {{ meeting.week }}</span>
            <span class="outcome" :class="meeting.outcome">{{ OUTCOME[meeting.outcome] }}</span>
            <span class="num">{{ Math.round(meeting.myTotal) }}–{{ Math.round(meeting.theirTotal) }}</span>
          </RouterLink>
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
  gap: 10px;
  text-align: center;
}
.sides {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.side-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.vs {
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--text-muted);
}
.monster-mark {
  font-size: 36px;
  line-height: 48px;
  color: var(--danger);
}
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
.synergy-columns {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.synergies {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.synergies.theirs {
  justify-content: flex-end;
}
.synergy {
  padding: 1px 9px;
  border: 1px solid var(--gold);
  border-radius: 999px;
  color: var(--gold);
  font-size: 13px;
}
.row-heading {
  margin: 16px 0 8px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.section-title {
  font-size: 22px;
}
.section-title.spaced {
  margin: 18px 0 8px;
}
.edit-link {
  font-size: 14px;
}
.lineups {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lineup-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.lineups.solo .lineup-row {
  grid-template-columns: minmax(0, 1fr);
}
.hero-cell {
  min-width: 0;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--text);
  text-decoration: none;
}
.hero-cell.theirs {
  background: var(--surface-sunken);
}
.hero-cell.champion {
  border-color: var(--gold);
}
.hero-cell.resting {
  border-style: dashed;
  border-color: #8a7a5a;
}
.hero-cell.empty {
  justify-content: center;
}
.hero-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.hero-name {
  font-weight: 700;
  font-size: 15px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.crown,
.resting-text {
  color: var(--gold);
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
