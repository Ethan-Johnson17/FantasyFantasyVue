<script setup lang="ts">
import { computed } from 'vue'
import type { HeroXp } from '../api/types'

/* A dynasty hero's experience: their XP tier and the damage bonus it gives this season. */

const props = defineProps<{ xp: HeroXp }>()
const label = computed(() => {
  const { xp, tier, bonus } = props.xp
  return tier ? `XP ${String(xp)} · tier ${String(tier)} · +${String(Math.round(bonus * 100))}%` : `XP ${String(xp)}`
})
const hint = computed(() => (props.xp.nextTierAt === null ? 'Top tier' : `${String(props.xp.nextTierAt - props.xp.xp)} XP to the next tier`))
</script>

<template>
  <span class="xp" :class="{ top: xp.nextTierAt === null }" :title="hint">{{ label }}</span>
</template>

<style scoped>
.xp {
  display: inline-block;
  padding: 1px 8px;
  border: 1px solid var(--trait-steadfast);
  border-radius: 999px;
  color: var(--trait-steadfast);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.xp.top {
  border-color: var(--gold);
  color: var(--gold);
}
</style>
