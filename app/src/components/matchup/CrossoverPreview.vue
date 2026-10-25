<script setup lang="ts">
import { computed } from 'vue'
import type { Matchup, MatchupSide } from '../../api/types'
import { levelText, synergyInfo } from '../../heroes'
import { kickoffText, timeUntil } from '../../time'
import ClassIcon from '../ClassIcon.vue'
import CrestShield from '../CrestShield.vue'
import EncounterCard from '../EncounterCard.vue'
import PlayerTag from '../PlayerTag.vue'
import TraitChips from '../TraitChips.vue'

/*
 * A Crossover battle before it goes final: the week's encounter, both boards (Gridiron and Quest) projected, and on
 * game days live, each football lineup with kickoffs and real points, and each Quest party.
 */

const props = defineProps<{ matchup: Matchup; leagueId: string }>()

type SideHero = NonNullable<MatchupSide['starters'][number]['hero']>

const recordText = (side: MatchupSide) =>
  `${String(side.record.wins)}–${String(side.record.losses)}${side.record.draws ? `–${String(side.record.draws)}` : ''}`

const live = computed(() => !!props.matchup.games && props.matchup.games.final > 0)
/** One board's numbers for a side: live once games are final, the projection before. */
function boardText(side: MatchupSide, board: 'gridiron' | 'quest'): { value: number; label: string } {
  const projected = board === 'gridiron' ? (side.projectedGridiron ?? 0) : side.projectedTotal
  const current = board === 'gridiron' ? side.liveGridiron : side.liveTotal
  if (live.value && current !== null && current !== undefined) return { value: current, label: 'live' }
  return { value: projected, label: 'proj' }
}

/** A starter's game this week: kickoff, playing, final points, or a bye. */
function gameText(hero: SideHero): string {
  if (hero.restingNextWeek) return 'Bye'
  const game = hero.game
  if (!game) return `proj ${String(hero.projected)}`
  if (game.final) return `${String(game.points ?? 0)} pts`
  if (game.locked) return 'Playing now'
  return kickoffText(new Date(game.kickoff))
}

const rows = computed(() => {
  const { me, opponent } = props.matchup
  return me.starters.map((entry, index) => ({
    key: entry.slot,
    label: entry.label,
    cells: opponent ? [entry.hero, opponent.starters[index]?.hero ?? null] : [entry.hero]
  }))
})
const questRows = computed(() => {
  const { me, opponent } = props.matchup
  const mine = me.questParty ?? []
  const theirs = opponent?.questParty ?? []
  return Array.from({ length: Math.max(mine.length, theirs.length) }, (_, index) => ({
    key: index,
    cells: opponent ? [mine[index] ?? null, theirs[index] ?? null] : [mine[index] ?? null]
  }))
})
const championOf = (index: number) => (index === 0 ? props.matchup.me.champion : (props.matchup.opponent?.champion ?? null))
const sides = computed(() => (props.matchup.opponent ? [props.matchup.me, props.matchup.opponent] : [props.matchup.me]))
</script>

<template>
  <EncounterCard v-if="matchup.encounter" :encounter="matchup.encounter" />

  <section class="scoreboard" aria-label="Upcoming battle">
    <div class="sides">
      <div class="side">
        <CrestShield :crest="matchup.me.crest" :size="44" />
        <span class="side-name">{{ matchup.me.name }}</span>
        <span class="muted small">{{ recordText(matchup.me) }}</span>
      </div>
      <span class="vs">vs</span>
      <div class="side">
        <template v-if="matchup.opponent">
          <CrestShield :crest="matchup.opponent.crest" :size="44" />
          <span class="side-name">{{ matchup.opponent.name }}</span>
          <span class="muted small">{{ recordText(matchup.opponent) }}</span>
        </template>
        <template v-else>
          <span class="monster-mark" aria-hidden="true">☠</span>
          <span class="side-name">{{ matchup.monster?.name ?? 'The encounter' }}</span>
          <span class="muted small">Fights at the league average</span>
        </template>
      </div>
    </div>
    <dl class="boards">
      <template v-for="board in ['gridiron', 'quest'] as const" :key="board">
        <dt class="board-name">{{ board === 'gridiron' ? 'Gridiron' : 'Quest' }}</dt>
        <dd class="board-scores">
          <span v-for="(side, index) in sides" :key="side.partyId" class="board-score" :class="{ theirs: index === 1 }">
            <strong>{{ boardText(side, board).value }}</strong>
            <span class="muted small">{{ boardText(side, board).label }}</span>
          </span>
        </dd>
      </template>
    </dl>
    <p class="when small">
      <template v-if="matchup.games">{{ matchup.games.final }} of {{ matchup.games.total }} games final · </template>
      Goes final {{ timeUntil(new Date(matchup.resolvesAt)) }} · players lock at kickoff
    </p>
  </section>

  <div class="row-heading">
    <h2 class="section-title">Football lineups</h2>
    <RouterLink :to="`/leagues/${leagueId}/party`" class="edit-link">Edit yours ›</RouterLink>
  </div>
  <ol class="lineups" :class="{ solo: !matchup.opponent }">
    <li v-for="row in rows" :key="row.key" class="lineup-row">
      <template v-for="(hero, index) in row.cells" :key="index">
        <RouterLink
          v-if="hero"
          :to="`/leagues/${leagueId}/heroes/${hero.id}`"
          class="hero-cell"
          :class="{ resting: hero.restingNextWeek, theirs: index === 1, locked: hero.game?.locked }"
        >
          <span class="hero-top">
            <span class="slot-label small">{{ row.label }}</span>
            <span class="hero-name">{{ hero.name }}</span>
          </span>
          <PlayerTag :hero="hero" />
          <span class="game small" :class="{ final: hero.game?.final }">
            <span v-if="hero.game?.locked && !hero.game.final" aria-hidden="true">🔒 </span>{{ gameText(hero) }}
          </span>
        </RouterLink>
        <span v-else class="hero-cell empty muted small">Empty slot</span>
      </template>
    </li>
  </ol>

  <div class="row-heading">
    <h2 class="section-title">Quest parties</h2>
    <span class="muted small">Any 5 heroes · the Champion leads</span>
  </div>
  <div class="synergy-columns">
    <ul v-for="side in sides" :key="side.partyId" class="synergies" :class="{ theirs: side !== matchup.me }" :aria-label="`${side.name} synergies`">
      <li v-for="synergy in side.synergies" :key="synergy" class="synergy" :title="synergyInfo(synergy).description">{{ synergyInfo(synergy).label }}</li>
      <li v-if="!side.synergies.length" class="muted small">No synergies</li>
    </ul>
  </div>
  <ol class="lineups quest" :class="{ solo: !matchup.opponent }">
    <li v-for="row in questRows" :key="row.key" class="lineup-row">
      <template v-for="(hero, index) in row.cells" :key="index">
        <RouterLink
          v-if="hero"
          :to="`/leagues/${leagueId}/heroes/${hero.id}`"
          class="hero-cell"
          :class="{ resting: hero.restingNextWeek, champion: hero.id === championOf(index), theirs: index === 1 }"
        >
          <span class="hero-top">
            <ClassIcon :hero-class="hero.heroClass" :size="24" />
            <span class="hero-name"><span v-if="hero.id === championOf(index)" class="crown" aria-label="Champion">♛ </span>{{ hero.name }}</span>
          </span>
          <span class="muted small">
            {{ hero.heroClass }} · {{ levelText(hero) }} ·
            <span v-if="hero.restingNextWeek" class="resting-text">bye</span>
            <span v-else>proj {{ hero.projected }}</span>
            <template v-if="matchup.encounter?.weak.includes(hero.heroClass)"> · <span class="weak">weak spot</span></template>
            <template v-else-if="matchup.encounter?.resists === hero.heroClass"> · <span class="resisted">resisted</span></template>
          </span>
          <TraitChips :traits="hero.traits" />
        </RouterLink>
        <span v-else class="hero-cell empty muted small">—</span>
      </template>
    </li>
  </ol>
  <p v-if="!matchup.opponent" class="note">No opponent this week: {{ matchup.monster?.name ?? 'the encounter' }} fights at the league's average on both boards.</p>
</template>

<style scoped src="./matchup.css"></style>
<style scoped>
.boards {
  margin: 4px 0 0;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 6px 12px;
}
.board-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
  text-align: left;
}
.board-scores {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.board-score {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
}
.board-score strong {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--gold);
}
.when {
  margin: 0;
  color: var(--text-muted);
}
.slot-label {
  flex: none;
  min-width: 34px;
  color: var(--text-muted);
  font-weight: 700;
}
.game {
  color: var(--text-muted);
}
.game.final {
  color: var(--gold);
  font-weight: 700;
}
.hero-cell.locked {
  border-color: var(--line-strong);
}
.edit-link {
  font-size: 14px;
}
.weak {
  color: var(--trait-steadfast);
}
.resisted {
  color: var(--danger);
}
.quest {
  margin-top: 8px;
}
</style>
