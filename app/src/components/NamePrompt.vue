<script setup lang="ts">
import { ref } from 'vue'
import { useApi } from '../api/inject'
import { DISPLAY_NAME_MAX, useSessionStore } from '../stores/session'
import FormError from './FormError.vue'

const api = useApi()
const session = useSessionStore()
const name = ref('')
const saving = ref(false)
const error = ref<unknown>(null)

async function save() {
  saving.value = true
  error.value = null
  try {
    await session.rename(api, name.value)
  } catch (caught) {
    error.value = caught
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="card prompt" @submit.prevent="save">
    <label for="display-name" class="prompt-title">Choose your adventurer name</label>
    <span class="muted small">Other players in your leagues will see it. You can change it any time from your account (tap your initial).</span>
    <div class="row">
      <input id="display-name" v-model.trim="name" class="input" :maxlength="DISPLAY_NAME_MAX" required autocomplete="nickname" />
      <button type="submit" class="btn btn-primary" :disabled="saving || !name">Save</button>
    </div>
    <FormError :error="error" />
  </form>
</template>

<style scoped>
.prompt {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px dashed var(--gold);
}
.prompt-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
}
.small {
  font-size: 13px;
}
.row {
  display: flex;
  gap: 8px;
}
.row .input {
  flex: 1;
  min-width: 0;
}
.row .btn {
  min-height: 46px;
}
</style>
