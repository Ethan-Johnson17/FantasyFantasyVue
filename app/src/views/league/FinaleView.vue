<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { Award, Finale } from '../../api/types'
import CrestShield from '../../components/CrestShield.vue'
import FormError from '../../components/FormError.vue'
import { useLeague } from '../../league'

/* The season finale: the champion, the podium, awards, and final standings. No reveal. */

const api = useApi()
const { league } = useLeague()
const finale = ref<Finale | null>(null)
const error = ref<unknown>(null)

onMounted(async () => {
  if (!league.value) return
  try {
    finale.value = await api.getFinale(league.value.id)
  } catch (caught) {
    error.value = caught
  }
})

const ordinal = (n: number) => {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${String(n)}${suffix}`
}
const record = (row: { wins: number; losses: number; draws: number }) =>
  `${String(row.wins)}–${String(row.losses)}${row.draws ? `–${String(row.draws)}` : ''}`
const number = (value: number) => Math.round(value).toLocaleString()

const myLine = computed(() => {
  const value = finale.value
  if (!value?.myFinish) return null
  if (value.myFinish.rank === 1) return 'Your party are the champions!'
  const row = value.standings[value.myFinish.rank - 1]
  return `You finished ${ordinal(value.myFinish.rank)} of ${String(value.standings.length)}${row ? ` · ${record(row)}` : ''}`
})

/** Second, first, third: the classic podium order. */
const podium = computed(() => {
  const [first, second, third] = finale.value?.standings ?? []
  return [
    second && { row: second, place: 2 },
    first && { row: first, place: 1 },
    third && { row: third, place: 3 }
  ].filter(entry => !!entry)
})

function describe(award: Award): { icon: string; title: string; subject: string; detail: string } {
  switch (award.kind) {
    case 'mightiestBlow':
      return { icon: '⚔', title: 'Mightiest Blow', subject: award.party.name, detail: `Dealt ${number(award.total)} in week ${String(award.week)}` }
    case 'heroOfTheSeason':
      return {
        icon: '★',
        title: 'Hero of the Season',
        subject: award.hero.name,
        detail: `${award.hero.heroClass} · ${number(award.damage)} damage for ${award.party.name}`
      }
    case 'greatestStrike':
      return {
        icon: '✦',
        title: 'Greatest Strike',
        subject: award.hero.name,
        detail: `Hit for ${number(award.damage)} in week ${String(award.week)} for ${award.party.name}`
      }
    case 'closestBattle':
      return {
        icon: '⚖',
        title: 'Closest Battle',
        subject: `${award.winner.name} over ${award.loser.name}`,
        detail: `Won by ${award.margin < 1 ? award.margin.toFixed(2) : award.margin.toFixed(1)} in week ${String(award.week)}`
      }
    case 'unbreakable':
      return { icon: '⛨', title: 'Unbreakable', subject: award.party.name, detail: `Faced the least damage: ${number(award.damageFaced)}` }
    case 'natural20':
      return { icon: '20', title: 'Natural 20', subject: award.party.name, detail: `Rolled the most natural 20s: ${String(award.count)}` }
    case 'cursedDice':
      return { icon: '1', title: 'Cursed Dice', subject: award.party.name, detail: `Rolled the most natural 1s: ${String(award.count)}` }
  }
}
</script>

<template>
  <header class="page-header row">
    <RouterLink :to="`/leagues/${league?.id}`" class="back-link">‹ {{ league?.name ?? 'League' }}</RouterLink>
    <span class="eyebrow">Season complete</span>
  </header>

  <FormError :error="error" />

  <template v-if="finale">
    <section class="crown" aria-label="Champions">
      <svg class="trophy" viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 8h24v14a12 12 0 0 1-24 0z" />
        <path d="M20 12h-8c0 8 4 12 9 13M44 12h8c0 8-4 12-9 13" />
        <path d="M32 34v10M24 54h16l-2-10H26z" />
      </svg>
      <CrestShield :crest="finale.champion.crest" :size="88" />
      <h1 class="champion-name">{{ finale.champion.name }}</h1>
      <p class="champion-line">Champions of {{ league?.name }} · {{ record(finale.champion) }}</p>
      <p v-if="myLine" class="my-line" :class="{ won: finale.myFinish?.rank === 1 }">{{ myLine }}</p>
    </section>

    <ol v-if="podium.length > 1" class="podium" aria-label="Podium">
      <li v-for="entry in podium" :key="entry.row.partyId" class="step" :class="`place-${entry.place}`">
        <CrestShield :crest="entry.row.crest" :size="entry.place === 1 ? 44 : 36" />
        <span class="step-name">{{ entry.row.name }}</span>
        <span class="block"><span class="place">{{ ordinal(entry.place) }}</span></span>
      </li>
    </ol>

    <h2 class="section-title">Awards</h2>
    <ul class="awards">
      <li v-for="award in finale.awards" :key="award.kind" class="card award">
        <span class="award-icon" aria-hidden="true">{{ describe(award).icon }}</span>
        <span class="award-text">
          <span class="award-title">{{ describe(award).title }}</span>
          <span class="award-subject">{{ describe(award).subject }}</span>
          <span class="muted small">{{ describe(award).detail }}</span>
        </span>
      </li>
    </ul>

    <h2 class="section-title">Final standings</h2>
    <table class="standings">
      <thead>
        <tr>
          <th scope="col"><span class="visually-hidden">Place</span></th>
          <th scope="col">Party</th>
          <th scope="col" class="num">W–L</th>
          <th scope="col" class="num">Damage</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in finale.standings" :key="row.partyId" :class="{ mine: row.partyId === finale.myFinish?.partyId }">
          <td class="num">{{ index + 1 }}</td>
          <td>
            <span class="party-cell"><CrestShield :crest="row.crest" :size="22" />{{ row.name }}</span>
          </td>
          <td class="num">{{ record(row) }}</td>
          <td class="num">{{ number(row.totalDamage) }}</td>
        </tr>
      </tbody>
    </table>

    <nav class="links">
      <RouterLink :to="`/leagues/${league?.id}/battles`">Every battle ›</RouterLink>
      <RouterLink v-if="league?.draft" :to="`/leagues/${league.id}/draft`">The draft ›</RouterLink>
    </nav>
  </template>
</template>

<style scoped>
.row {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.small {
  font-size: 13px;
}
.crown {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  border: 1px solid var(--gold);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(110% 80% at 50% 0%, color-mix(in srgb, var(--gold) 22%, transparent), transparent 70%),
    var(--surface);
  box-shadow:
    0 0 0 3px var(--ink),
    0 0 0 4px var(--line-strong),
    0 10px 30px rgb(0 0 0 / 35%);
}
.champion-name {
  font-size: 34px;
  line-height: 1.05;
  overflow-wrap: anywhere;
}
.champion-line,
.my-line {
  margin: 0;
}
.champion-line {
  color: var(--gold);
  font-weight: 700;
}
.my-line {
  margin-top: 4px;
  padding: 3px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  font-size: 14px;
}
.my-line.won {
  border-color: var(--gold);
  background: var(--gold);
  color: var(--on-gold);
  font-weight: 700;
}
.podium {
  list-style: none;
  margin: 18px 0 4px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
}
.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
  min-width: 0;
}
.step-name {
  font-weight: 700;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.block {
  width: 100%;
  display: flex;
  justify-content: center;
  padding-top: 6px;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-bottom: 0;
}
.place-1 .block {
  height: 72px;
  border-color: var(--gold);
}
.place-2 .block {
  height: 52px;
}
.place-3 .block {
  height: 36px;
}
.place {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
}
.place-1 .place {
  color: var(--gold);
}
.section-title {
  margin: 20px 0 8px;
  font-size: 22px;
}
.awards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.award {
  display: flex;
  align-items: center;
  gap: 12px;
}
.award-icon {
  flex: none;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--gold);
  border-radius: 50%;
  color: var(--gold);
  font-size: 18px;
}
.award-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.award-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gold);
}
.award-subject {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 19px;
  overflow-wrap: anywhere;
}
.standings {
  width: 100%;
  border-collapse: collapse;
}
.standings th {
  padding: 6px 8px;
  text-align: left;
  font-size: 12px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--line);
}
.standings td {
  padding: 8px;
  border-bottom: 1px solid var(--line);
}
.standings tr.mine td {
  background: var(--surface-raised);
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.party-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}
.links {
  margin-top: 16px;
  display: flex;
  gap: 16px;
}
</style>
