<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { Keepers } from '../../api/types'
import ClassIcon from '../../components/ClassIcon.vue'
import FormError from '../../components/FormError.vue'
import TraitChips from '../../components/TraitChips.vue'
import XpBadge from '../../components/XpBadge.vue'
import { useLeague } from '../../league'

/*
 * Dynasty, between seasons: choose which of last season's heroes to keep (docs/DYNASTY_SPEC.md). Each is shown
 * re-leveled for the new season, with the XP they'd carry and any trait they'd earn. Keepers use your first picks.
 */

const api = useApi()
const { league } = useLeague()
const data = ref<Keepers | null>(null)
const chosen = ref<string[]>([])
const saving = ref(false)
const error = ref<unknown>(null)
const notice = ref('')

onMounted(async () => {
  if (!league.value) return
  try {
    apply(await api.getKeepers(league.value.id))
  } catch (caught) {
    error.value = caught
  }
})

function apply(keepers: Keepers) {
  data.value = keepers
  chosen.value = keepers.options.filter(option => option.kept).map(option => option.heroId)
}

const locked = computed(() => league.value?.status !== 'forming')
const changed = computed(() => JSON.stringify([...chosen.value].sort()) !== JSON.stringify((data.value?.options ?? []).filter(o => o.kept).map(o => o.heroId).sort()))

function toggle(heroId: string) {
  if (locked.value) return
  if (chosen.value.includes(heroId)) chosen.value = chosen.value.filter(id => id !== heroId)
  else if (chosen.value.length < (data.value?.limit ?? 0)) chosen.value = [...chosen.value, heroId]
}

async function save() {
  if (!league.value) return
  saving.value = true
  error.value = null
  notice.value = ''
  try {
    apply(await api.setKeepers(league.value.id, chosen.value))
    notice.value = chosen.value.length ? `Keeping ${String(chosen.value.length)}.` : 'Keeping nobody.'
  } catch (caught) {
    error.value = caught
  } finally {
    saving.value = false
  }
}

const levelChange = (previous: number | null, next: number | null) => {
  if (previous === null || next === null || previous === next) return ''
  return next > previous ? `▲ ${String(next - previous)}` : `▼ ${String(previous - next)}`
}
</script>

<template>
  <header class="page-header">
    <RouterLink :to="`/leagues/${league?.id}`" class="back-link">‹ {{ league?.name }}</RouterLink>
    <h1 class="title">Keepers</h1>
    <p class="muted small">
      Keep up to {{ data?.limit ?? 3 }} heroes from last season. They use your first picks in the draft; everyone else goes
      back into the pool. Levels are set fresh from last season, and kept heroes carry their XP.
    </p>
  </header>

  <FormError :error="error" />
  <p v-if="locked" class="note">The draft is scheduled, so keepers are locked.</p>
  <p v-if="data && !data.options.length" class="card muted">Your party is new this season, so it has nobody to keep.</p>

  <ul v-if="data" class="options">
    <li v-for="option in data.options" :key="option.heroId">
      <button
        type="button"
        class="option"
        :class="{ on: chosen.includes(option.heroId), retired: option.retired }"
        :aria-pressed="chosen.includes(option.heroId)"
        :disabled="option.retired || locked || (!chosen.includes(option.heroId) && chosen.length >= data.limit)"
        @click="toggle(option.heroId)"
      >
        <ClassIcon :hero-class="option.heroClass" :size="28" />
        <span class="text">
          <span class="name">{{ option.name }}</span>
          <span v-if="option.retired" class="muted small">Retired · can’t be kept</span>
          <template v-else>
            <span class="small">
              {{ option.heroClass }} · Lv {{ option.level }}
              <span v-if="levelChange(option.previousLevel, option.level)" :class="(option.level ?? 0) > (option.previousLevel ?? 0) ? 'up' : 'down'">
                {{ levelChange(option.previousLevel, option.level) }}
              </span>
              <span class="muted">(was Lv {{ option.previousLevel ?? '?' }})</span>
            </span>
            <span class="badges">
              <XpBadge :xp="option.xp" />
              <span v-if="option.earnedTrait" class="earned small">Earns {{ option.earnedTrait }}</span>
            </span>
            <TraitChips :traits="option.traits" />
          </template>
        </span>
        <span class="check" aria-hidden="true">{{ chosen.includes(option.heroId) ? '✓' : '' }}</span>
      </button>
    </li>
  </ul>

  <template v-if="data && !locked">
    <p class="muted small">{{ chosen.length }} of {{ data.limit }} chosen</p>
    <button type="button" class="btn btn-primary save" :disabled="saving || !changed" @click="save">{{ saving ? 'Saving…' : 'Save keepers' }}</button>
  </template>
  <p v-if="notice" class="muted" role="status">{{ notice }}</p>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.small {
  font-size: 13px;
}
.options {
  list-style: none;
  margin: 12px 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.option {
  width: 100%;
  min-height: var(--tap);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.option.on {
  border: 2px solid var(--gold);
  background: color-mix(in srgb, var(--gold) 12%, var(--surface));
}
.option:disabled {
  cursor: not-allowed;
}
.option.retired {
  opacity: 0.55;
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.name {
  font-weight: 700;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.earned {
  color: var(--gold);
  font-weight: 700;
}
.up {
  color: var(--trait-steadfast);
  font-weight: 700;
}
.down {
  color: var(--danger);
  font-weight: 700;
}
.check {
  flex: none;
  width: 24px;
  color: var(--gold);
  font-weight: 700;
  font-size: 18px;
  text-align: center;
}
.save {
  width: 100%;
}
</style>
