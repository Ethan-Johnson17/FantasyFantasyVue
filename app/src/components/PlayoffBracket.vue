<script setup lang="ts">
import type { Playoffs } from '../api/types'
import CrestShield from './CrestShield.vue'

/*
 * The playoff bracket, one round per column (stacked on narrow screens): each game's seeds, totals once played,
 * and who went through. Rounds still waiting on earlier results show what's to come.
 */

const props = defineProps<{ playoffs: Playoffs; myPartyId: string | null }>()

const total = (value: number | null) => (value === null ? '' : String(Math.round(value)))
/** Games in a round not yet set: a top-6 bracket's semifinals are 2, as the top seeds rejoin after their bye. */
const waiting = (round: number) => (props.playoffs.format.spots === 6 ? [2, 2, 1][round - 1] ?? 1 : props.playoffs.format.spots / 2 ** round)
</script>

<template>
  <div class="bracket" :style="{ '--rounds': playoffs.rounds.length }">
    <section v-for="round in playoffs.rounds" :key="round.round" class="round" :aria-label="`${round.name}, week ${round.week}`">
      <h3 class="round-name">
        {{ round.name }} <span class="muted small">· week {{ round.week }}</span>
      </h3>
      <ul class="games">
        <li v-for="bye in round.byes" :key="`bye-${bye.partyId}`" class="game">
          <span class="side">
            <span class="seed">{{ bye.seed }}</span>
            <CrestShield :crest="bye.crest" :size="20" decorative />
            <span class="name">{{ bye.name }}<span v-if="bye.partyId === myPartyId" class="you"> · you</span></span>
            <span class="muted small">bye</span>
          </span>
        </li>
        <li v-for="game in round.games" :key="game.high.partyId" class="game">
          <span
            v-for="side in [game.high, game.low]"
            :key="side.partyId"
            class="side"
            :class="{ won: game.winner === side.partyId, out: game.winner && game.winner !== side.partyId }"
          >
            <span class="seed">{{ side.seed }}</span>
            <CrestShield :crest="side.crest" :size="20" decorative />
            <span class="name">{{ side.name }}<span v-if="side.partyId === myPartyId" class="you"> · you</span></span>
            <span class="total">{{ total(side.total) }}</span>
          </span>
        </li>
        <template v-if="!round.games.length">
          <li v-for="slot in waiting(round.round)" :key="`tbd-${slot}`" class="game tbd muted small">Winners of the round before</li>
        </template>
      </ul>
    </section>
  </div>
  <p class="muted small">
    <template v-if="playoffs.provisional">Seeds follow the standings until week 14. </template>
    Higher seeds go through on a draw.
  </p>
</template>

<style scoped>
.small {
  font-size: 13px;
}
.bracket {
  display: grid;
  grid-template-columns: repeat(var(--rounds), minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 560px) {
  .bracket {
    grid-template-columns: 1fr;
  }
}
.round-name {
  margin: 0 0 6px;
  font-size: 16px;
}
.games {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.game {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}
.game.tbd {
  padding: 10px;
  border-style: dashed;
  background: transparent;
}
.side {
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.side + .side {
  border-top: 1px solid var(--line);
}
.seed {
  width: 16px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}
.name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.total {
  font-variant-numeric: tabular-nums;
}
.won {
  color: var(--gold);
  font-weight: 700;
}
.out {
  opacity: 0.6;
}
.you {
  color: var(--gold);
  font-weight: 400;
}
</style>
