<script setup lang="ts">
/*
 * Pinned above the league tabs while a lineup swap is in progress, so the player always sees who they're swapping
 * and how to back out, wherever they've scrolled.
 */

defineProps<{ heroName: string; slotLabel: string; choices: number }>()
defineEmits<{ cancel: [] }>()
</script>

<template>
  <div class="swap-bar" role="status" aria-live="polite">
    <span class="text">
      <strong>Swapping out {{ heroName }}</strong>
      <span class="small">
        {{ slotLabel }} ·
        {{ choices ? `tap a bench hero marked “Swap in” (${String(choices)} can play here)` : 'nobody on your bench can play here' }}
      </span>
    </span>
    <button type="button" class="cancel" @click="$emit('cancel')">Cancel</button>
  </div>
</template>

<style scoped>
.swap-bar {
  position: sticky;
  bottom: calc(68px + env(safe-area-inset-bottom));
  z-index: 5;
  margin-top: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 2px solid var(--gold);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  box-shadow: 0 6px 18px rgb(0 0 0 / 45%);
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.small {
  color: var(--text-muted);
  font-size: 13px;
}
.cancel {
  flex: none;
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--gold);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  font-weight: 700;
  cursor: pointer;
}
</style>
