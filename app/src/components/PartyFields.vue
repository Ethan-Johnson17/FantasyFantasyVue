<script setup lang="ts">
import { ref } from 'vue'
import type { PartyInput } from '../api/types'
import { crestName } from '../crests'
import CrestPicker from './CrestPicker.vue'
import CrestShield from './CrestShield.vue'

const party = defineModel<PartyInput>({ required: true })
const pickingCrest = ref(false)
</script>

<template>
  <fieldset class="party">
    <legend class="field-label">Your party</legend>
    <div class="field">
      <label for="party-name">Party name</label>
      <input
        id="party-name"
        v-model.trim="party.name"
        class="input"
        maxlength="30"
        required
        autocomplete="off"
      />
    </div>
    <div class="crest-row">
      <CrestShield :crest="party.crest" />
      <div class="crest-text">
        <span class="crest-name">{{ crestName(party.crest) }}</span>
        <span class="muted small">Your crest</span>
      </div>
      <button type="button" class="link-button" :aria-expanded="pickingCrest" @click="pickingCrest = !pickingCrest">
        {{ pickingCrest ? 'Done' : 'Change crest ›' }}
      </button>
    </div>
    <CrestPicker v-if="pickingCrest" v-model="party.crest" />
  </fieldset>
</template>

<style scoped>
.party {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
legend {
  padding: 0 6px;
}
.crest-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.crest-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.crest-name {
  font-weight: 700;
}
.small {
  font-size: 13px;
}
.link-button {
  min-height: var(--tap);
  border: 0;
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
</style>
