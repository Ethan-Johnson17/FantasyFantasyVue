<script setup lang="ts">
import { computed } from 'vue'
import type { Hero } from '../api/types'

/* The real player behind a Crossover hero. Classic heroes have none, so nothing shows. */

const props = defineProps<{ hero: Pick<Hero, 'player'> }>()

const text = computed(() => {
  const player = props.hero.player
  if (!player) return ''
  return player.position === 'DEF' ? `${player.name} defense` : `${player.name} · ${player.team} ${player.position}`
})
</script>

<template>
  <span v-if="text" class="player-tag">{{ text }}</span>
</template>

<style scoped>
.player-tag {
  display: block;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
