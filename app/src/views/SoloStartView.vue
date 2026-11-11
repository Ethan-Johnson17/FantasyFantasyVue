<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../api/inject'
import type { PartyInput, SoloRules } from '../api/types'
import FormError from '../components/FormError.vue'
import PartyFields from '../components/PartyFields.vue'
import { DEFAULT_CREST } from '../crests'

/* Starting a Solo run (docs/SOLO_SPEC.md): name the party, then build it from the pool. One run at a time. */

const api = useApi()
const router = useRouter()

const form = reactive<{ party: PartyInput }>({ party: { name: '', crest: { ...DEFAULT_CREST } } })
const rules = ref<SoloRules | null>(null)
onMounted(async () => {
  try {
    rules.value = (await api.getRules()).solo ?? null
  } catch {
    // The form works without the numbers; the API refuses a start it can't take.
  }
})

const submitting = ref(false)
const error = ref<unknown>(null)
async function submit() {
  submitting.value = true
  error.value = null
  try {
    const run = await api.startSolo(form.party)
    await router.push(`/leagues/${run.id}/solo`)
  } catch (caught) {
    error.value = caught
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <RouterLink to="/leagues" class="back-link">‹ Cancel</RouterLink>
      <h1 class="title">Start a Solo run</h1>
    </header>

    <p class="intro">
      Your party alone against a campaign of monsters, with real NFL players from this season.
      <template v-if="rules">
        Sign {{ rules.rosterSize }} heroes under a budget of {{ rules.cap }} gold, send {{ rules.partySize }} on the quest each week, and bring
        down {{ rules.chapters - 1 }} monsters and {{ rules.boss }} before you lose {{ rules.lives }} lives.
      </template>
      <RouterLink to="/how-it-works#solo">How it works</RouterLink>
    </p>

    <form class="form" @submit.prevent="submit">
      <PartyFields v-model="form.party" />
      <FormError :error="error" />
      <button type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? 'Starting…' : 'Start and build your party' }}</button>
    </form>
  </main>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.intro {
  margin: 0 0 16px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
