<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../../api/inject'
import type { Campaign, CoopRules, ResultHero, WeekResult } from '../../api/types'
import CampaignBoard from '../../components/CampaignBoard.vue'
import CrestShield from '../../components/CrestShield.vue'
import D20Badge from '../../components/D20Badge.vue'
import FormError from '../../components/FormError.vue'
import { chapterTitle, damageText, hpShown, weekStory } from '../../campaign'
import { critLabel } from '../../heroes'
import { useLeague } from '../../league'
import { timeUntil } from '../../time'

/*
 * Co-op's quest board (docs/COOP_SPEC.md): the monster the whole league is fighting, the lives left, who's dealing
 * the damage, every chapter of the campaign, and each played week. No party plays another: the list of parties is a
 * friendly ranking of who helped most.
 */

const api = useApi()
const route = useRoute()
const { league, myParty } = useLeague()

const campaign = ref<Campaign | null>(null)
const rules = ref<CoopRules | null>(null)
const result = ref<WeekResult | null>(null)
const error = ref<unknown>(null)
const started = computed(() => league.value?.status === 'active' || league.value?.status === 'complete')

async function loadCampaign() {
  const id = league.value?.id
  if (!id || !started.value) return
  try {
    campaign.value = await api.getCampaign(id)
  } catch (caught) {
    error.value = caught
  }
}
watch(() => league.value?.resolvedWeeks, loadCampaign, { immediate: true })
onMounted(async () => {
  try {
    rules.value = (await api.getRules()).coop ?? null
  } catch {
    // The board falls back to the standard ×1.25 / ×0.75.
  }
})

/** The played week to show: the one asked for, or the latest */
const playedWeeks = computed(() => Array.from({ length: campaign.value?.lastWeek ?? 0 }, (_, index) => index + 1))
const week = computed(() => {
  const requested = Number(route.params.week)
  const last = campaign.value?.lastWeek ?? 0
  return Number.isInteger(requested) && requested >= 1 && requested <= last ? requested : last
})
let loads = 0
watch(
  week,
  async value => {
    const current = ++loads
    const id = league.value?.id
    result.value = null
    if (!id || value < 1) return
    try {
      const fetched = await api.getWeekResult(id, value)
      if (current === loads) result.value = fetched
    } catch (caught) {
      if (current === loads) error.value = caught
    }
  },
  { immediate: true }
)

const isMine = (partyId: string) => partyId === myParty.value?.id
const mySide = computed(() => result.value?.sides?.find(side => isMine(side.partyId)) ?? null)
/** A hero who dealt damage that week: a starter who played, or a bench hero swapped in */
const fought = (hero: ResultHero) => (hero.slot !== 'Bench' || !!hero.swappedInto) && !hero.resting
/** My heroes who fought that week, then the rest, most damage first */
const myHeroes = computed(() =>
  [...(mySide.value?.heroes ?? [])].sort((a, b) => Number(fought(b)) - Number(fought(a)) || b.damage - a.damage || a.name.localeCompare(b.name))
)
const STATUS_TEXT = { upcoming: 'Ahead', active: 'Now', fallen: 'Fallen', failed: 'Escaped' } as const
const linkTo = (target: number) => `/leagues/${league.value?.id ?? ''}/quest/${String(target)}`
</script>

<template>
  <header class="page-header">
    <div class="eyebrow">{{ league?.name }}</div>
    <h1 class="title">The quest</h1>
  </header>

  <p v-if="!started" class="card muted">The campaign begins once the draft has run.</p>
  <FormError :error="error" />

  <template v-if="campaign && league">
    <CampaignBoard :campaign="campaign" :weak-multiplier="rules?.weakMultiplier" :resist-multiplier="rules?.resistMultiplier" />
    <p v-if="campaign.nextWeek && campaign.outcome === 'ongoing'" class="muted small">
      Week {{ campaign.nextWeek.week }}'s battle {{ timeUntil(new Date(campaign.nextWeek.at)) }}. Every party's damage counts against the
      monster.
    </p>
    <RouterLink v-if="campaign.outcome !== 'ongoing'" :to="`/leagues/${league.id}/finale`" class="finale-link">See the finale and awards ›</RouterLink>

    <RouterLink
      v-if="campaign.outcome === 'ongoing' && campaign.myParty && !campaign.myParty.hasChampion"
      :to="`/leagues/${league.id}/party`"
      class="card reminder"
    >
      <span class="crown" aria-hidden="true">♛</span>
      <span><strong>Name a Champion.</strong> They deal extra damage every battle until you choose another. Your league needs it. ›</span>
    </RouterLink>

    <h2 class="section-title spaced">Who's dealing the damage</h2>
    <p class="muted small">This chapter so far, and last week. Everyone fights the same monster.</p>
    <ol class="helpers">
      <li v-for="row in campaign.contributions" :key="row.partyId" class="helper" :class="{ mine: isMine(row.partyId) }">
        <CrestShield :crest="row.crest" :size="26" decorative />
        <span class="helper-name">{{ row.name }} <span v-if="isMine(row.partyId)" class="you">you</span></span>
        <span class="num"><strong>{{ damageText(row.chapter) }}</strong><span class="visually-hidden"> this chapter</span></span>
        <span class="num muted small">{{ damageText(row.lastWeek) }}<span class="visually-hidden"> last week</span></span>
      </li>
    </ol>

    <h2 class="section-title spaced">The campaign</h2>
    <ol class="chapters">
      <li v-for="chapter in campaign.chapters" :key="chapter.chapter" class="chapter" :class="chapter.status">
        <span class="chapter-status small">{{ STATUS_TEXT[chapter.status] }}</span>
        <span class="chapter-name">
          {{ chapter.name }}
          <span class="muted small">{{ chapterTitle(chapter, campaign.chapters.length) }} · by week {{ chapter.deadline }}</span>
        </span>
        <span class="num small">
          <template v-if="chapter.status === 'fallen'">Week {{ chapter.endedWeek }}</template>
          <template v-else-if="chapter.status === 'failed'">{{ hpShown(chapter.hpLeft).toLocaleString() }} HP left</template>
          <template v-else>{{ chapter.hp.toLocaleString() }} HP</template>
        </span>
      </li>
    </ol>

    <template v-if="playedWeeks.length">
      <h2 class="section-title spaced">Week by week</h2>
      <ol class="strip" aria-label="Played weeks">
        <li v-for="entry in playedWeeks" :key="entry">
          <RouterLink :to="linkTo(entry)" class="chip" :class="{ selected: entry === week }" :aria-current="entry === week ? 'page' : undefined">
            {{ entry }}
          </RouterLink>
        </li>
      </ol>
      <template v-if="result">
        <p class="story">{{ weekStory(result, campaign.chapters) }}</p>
        <ol class="sides">
          <li v-for="side in result.sides ?? []" :key="side.partyId" class="side" :class="{ mine: isMine(side.partyId) }">
            <CrestShield :crest="side.crest" :size="22" decorative />
            <span class="helper-name">{{ side.name }}</span>
            <span class="num">{{ damageText(side.total) }}</span>
          </li>
        </ol>
        <template v-if="mySide">
          <h3 class="sub-title">Your heroes in week {{ week }}</h3>
          <p v-if="!mySide.champion" class="muted small">No Champion was named for this battle.</p>
          <ul class="heroes">
            <li v-for="hero in myHeroes" :key="hero.heroId" class="hero" :class="{ bench: !fought(hero) }">
              <RouterLink :to="`/leagues/${league.id}/heroes/${hero.heroId}`" class="hero-name">
                <span v-if="hero.heroId === mySide.champion" class="crown" aria-label="Champion">♛</span>
                {{ hero.name }}
              </RouterLink>
              <span class="muted small">
                {{ hero.heroClass }} ·
                <template v-if="hero.resting">resting</template>
                <template v-else-if="hero.swappedInto">swapped in</template>
                <template v-else-if="hero.slot === 'Bench'">bench (would have dealt)</template>
                <template v-else>fought</template>
              </span>
              <D20Badge v-if="hero.crit" :crit="hero.crit" :size="22" :title="critLabel(hero.crit, hero.heroClass)" />
              <span class="num">{{ hero.resting ? '–' : damageText(hero.damage) }}</span>
            </li>
          </ul>
        </template>
      </template>
    </template>
  </template>
</template>

<style scoped>
.title {
  font-size: 30px;
}
.small {
  font-size: 13px;
}
.spaced {
  margin-top: 22px;
}
.finale-link {
  display: block;
  margin: 6px 0;
}
.reminder {
  margin: 10px 0;
  display: flex;
  gap: 10px;
  align-items: center;
  border-color: var(--gold);
  text-decoration: none;
  color: var(--text);
}
.crown {
  color: var(--gold);
  font-size: 20px;
}
.hero .crown {
  font-size: 15px;
}
.helpers,
.chapters,
.sides,
.heroes {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.helper,
.side,
.hero {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.side {
  grid-template-columns: auto 1fr auto;
}
.hero {
  grid-template-columns: 1fr auto auto auto;
}
.hero.bench {
  opacity: 0.7;
}
.mine {
  border-color: var(--gold);
}
.helper-name,
.hero-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.you {
  color: var(--gold);
  font-size: 12px;
}
.num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.chapter {
  display: grid;
  grid-template-columns: 64px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.chapter-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.chapter-status {
  font-weight: 700;
  color: var(--text-muted);
}
.chapter.active {
  border-color: var(--danger);
}
.chapter.active .chapter-status {
  color: var(--danger);
}
.chapter.fallen .chapter-status {
  color: var(--gold);
}
.chapter.failed {
  opacity: 0.7;
}
.strip {
  list-style: none;
  margin: 8px 0 12px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}
.chip {
  min-height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-weight: 700;
  text-decoration: none;
}
.chip.selected {
  background: var(--surface-raised);
  border-color: var(--gold);
  color: var(--text);
}
.story {
  margin: 0 0 8px;
}
.sub-title {
  margin: 16px 0 0;
  font-size: 16px;
}
</style>
