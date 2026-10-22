<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../api/inject'
import type { GameRules, HeroTrait } from '../api/types'
import ClassIcon from '../components/ClassIcon.vue'
import { CLASS_COLOR, CLASS_TEMPERAMENT, CRIT_NAMES, HERO_CLASSES, SYNERGY_ORDER, synergyInfo, TRAITS } from '../heroes'

/*
 * How the game works, readable before signing in. This is the one screen that explains the real
 * season behind the heroes; everywhere else stays pure fantasy. Numbers come from the live ruleset.
 */

const api = useApi()
const router = useRouter()
const rules = ref<GameRules | null>(null)

onMounted(async () => {
  try {
    rules.value = await api.getRules()
  } catch {
    // The page still reads well without the numbers.
  }
})

const times = (value: number) => `${String(value)}×`
const percent = (value: number) => `${String(Math.round(value * 100))}%`
const TRAIT_ORDER: HeroTrait[] = ['steadfast', 'wild', 'mighty']

const champion = computed(() =>
  rules.value
    ? `${times(rules.value.strategy.championMultiplier)} damage (${times(rules.value.strategy.mightyChampionMultiplier)} if they're Mighty)`
    : 'extra damage'
)

function back() {
  // Return where the reader came from; a direct visit goes home (or to sign-in when signed out).
  if (window.history.state && (window.history.state as { back?: unknown }).back) router.back()
  else void router.push('/')
}
</script>

<template>
  <main class="page how">
    <header class="page-header">
      <button type="button" class="back-link back-button" @click="back">‹ Back</button>
      <div class="eyebrow">FantasyFantasy</div>
      <h1 class="title">How it works</h1>
    </header>

    <section class="card lead">
      <p>
        Draft a party of {{ rules?.rosterSize ?? 10 }} heroes. Each week, your {{ rules?.starters ?? 5 }} starters battle another
        party, and the side that deals more damage wins. {{ rules?.seasonWeeks ?? 14 }} battles make a season.
      </p>
    </section>

    <nav class="contents" aria-label="On this page">
      <a href="#strength">Hero strength</a>
      <a href="#levels">Levels</a>
      <a href="#classes">Classes</a>
      <a href="#traits">Traits</a>
      <a href="#champion">Champion</a>
      <a href="#synergies">Synergies</a>
      <a href="#draft">The draft</a>
      <a href="#battles">Battles</a>
      <a href="#crits">Natural 20s</a>
      <a href="#season">The season</a>
    </nav>

    <section id="strength" class="section">
      <h2 class="section-title">Where a hero's strength comes from</h2>
      <p>
        Every hero quietly follows a real NFL player, or for some heroes a whole team's defense, through one past season.
        A hero's damage each week is how well their player did that week, scaled for their class. That is why heroes have
        big weeks and quiet ones, and why a hero sometimes rests: their player didn't play that week.
      </p>
      <p>
        The season is chosen at random when the draft is scheduled, and it stays secret. So does every hero's player: you
        never find out who is behind a hero, and damage is shown rounded so it can't be matched to real results. Knowing
        football helps a little; reading your heroes helps more.
      </p>
    </section>

    <section id="levels" class="section">
      <h2 class="section-title">Levels</h2>
      <p>
        A hero's Level, from 1 to 10, shows how strong they were the season before, compared with other heroes of their
        class. The top tenth of a class is Level 10.
      </p>
      <p>
        <strong>Mystery recruits</strong> are newcomers with no record yet. They show a range instead, set by how promising
        they were: the most sought-after Warriors show Lv 8–10, other top prospects Lv 1–7, and late finds Lv 1. After
        three battles, a mystery recruit also shows what Level they are playing like.
      </p>
    </section>

    <section id="classes" class="section">
      <h2 class="section-title">Classes</h2>
      <p>
        Damage is balanced so a Level means about the same in every class. Classes differ in how much they swing from week
        to week, and any class can fill any starting slot.
      </p>
      <ul class="classes">
        <li v-for="heroClass in HERO_CLASSES" :key="heroClass" class="class-row">
          <ClassIcon :hero-class="heroClass" :size="36" />
          <span>
            <strong :style="{ color: CLASS_COLOR[heroClass] }">{{ heroClass }}</strong>
            <span class="muted"> · {{ CLASS_TEMPERAMENT[heroClass].label }}</span>
          </span>
        </li>
      </ul>
    </section>

    <section id="traits" class="section">
      <h2 class="section-title">Traits</h2>
      <p>Traits come from a hero's season before, and set apart heroes of the same Level. Mystery recruits have none yet.</p>
      <dl class="terms">
        <template v-for="trait in TRAIT_ORDER" :key="trait">
          <dt :class="`trait-${trait}`">{{ TRAITS[trait].label }}</dt>
          <dd>{{ TRAITS[trait].description }}</dd>
        </template>
      </dl>
      <p class="muted">A hero is never both Steadfast and Wild. Mighty can come with either.</p>
    </section>

    <section id="champion" class="section">
      <h2 class="section-title">Your Champion</h2>
      <p>
        Name one starter as your Champion on the Party tab. Your Champion deals {{ champion }}, and stays Champion from
        battle to battle until you choose another. A resting Champion misses that week's bonus, and benching your Champion
        withdraws them.
      </p>
    </section>

    <section id="synergies" class="section">
      <h2 class="section-title">Synergies</h2>
      <p>Heroes whose traits complement each other fight better together. Synergies stack.</p>
      <dl class="terms">
        <template v-for="synergy in SYNERGY_ORDER" :key="synergy">
          <dt>{{ synergyInfo(synergy).label }}</dt>
          <dd>{{ synergyInfo(synergy, rules?.strategy).description }}</dd>
        </template>
      </dl>
      <p class="muted">The Party tab shows which synergies your lineup will trigger, and the matchup shows your opponent's.</p>
    </section>

    <section id="draft" class="section">
      <h2 class="section-title">The draft</h2>
      <p>
        Before the draft, rank the heroes you want. The draft runs automatically at the scheduled time, snaking through the
        parties: on your turn it takes your highest-ranked hero still available, or the best Level if none are left. It
        always leaves every party able to fill a lineup.
      </p>
      <p>
        A party can hold at most {{ rules?.classLimits.Paladin ?? 2 }} Paladins, so the scarce defenders are shared around;
        the draft skips any extra Paladins you rank, and free agency follows the same limit.
      </p>
      <p>Rank with traits in mind: a Steadfast and a Wild hero together, or a Mighty Champion, are worth more than Level alone.</p>
    </section>

    <section id="battles" class="section">
      <h2 class="section-title">Each battle</h2>
      <ul class="points">
        <li>Your lineup and Champion lock when the battle begins. Changes after that count from the next battle.</li>
        <li>
          A resting hero deals no damage. With auto-swap on, your best bench hero steps in at
          {{ rules ? percent(rules.autoSwapMultiplier) : 'reduced' }} damage.
        </li>
        <li>The side with more damage wins. Ties go to the side whose best hero dealt more, then to the stronger bench.</li>
        <li>With an odd number of parties, one party each week battles a dungeon monster as strong as the league's average party.</li>
      </ul>
    </section>

    <section id="crits" class="section">
      <h2 class="section-title">Natural 20s and natural 1s</h2>
      <p>
        A d20 lands on 20 one time in 20. When a hero has a battle in the top 5% for their class, they rolled a natural 20;
        a battle in the bottom 5% is a natural 1. Crits are for glory only: they never change damage or who wins.
      </p>
      <dl class="terms">
        <template v-for="heroClass in HERO_CLASSES" :key="heroClass">
          <dt :style="{ color: CLASS_COLOR[heroClass] }">{{ heroClass }}</dt>
          <dd>{{ CRIT_NAMES[heroClass].success }} · {{ CRIT_NAMES[heroClass].fail }}</dd>
        </template>
      </dl>
    </section>

    <section id="season" class="section">
      <h2 class="section-title">The season</h2>
      <ul class="points">
        <li>Standings rank parties by wins (a draw counts as half), then by total damage.</li>
        <li>
          Heroes nobody drafted, and heroes a party drops, are free agents. Claim one on the Heroes tab by dropping one of
          yours: first come, first served, counting from the next battle.
        </li>
      </ul>
    </section>

    <section class="section fine">
      <p class="muted">Free to play. No wagering, ever.</p>
      <p class="muted">Stats data provided by nflverse.</p>
    </section>
  </main>
</template>

<style scoped>
.how {
  padding-bottom: 32px;
}
.back-button {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}
.title {
  font-size: 32px;
}
.lead p {
  margin: 0;
  font-size: 17px;
  line-height: 1.5;
}
.contents {
  margin: 14px 0 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.contents a {
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 14px;
  text-decoration: none;
}
.section {
  margin-top: 20px;
  scroll-margin-top: 16px;
}
.section p {
  margin: 8px 0 0;
  line-height: 1.55;
}
.section-title {
  font-size: 22px;
}
.classes {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.class-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.terms {
  margin: 10px 0 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 14px;
}
.terms dt {
  font-weight: 700;
}
.terms dd {
  margin: 0;
  line-height: 1.45;
}
.trait-steadfast {
  color: var(--trait-steadfast);
}
.trait-wild {
  color: var(--trait-wild);
}
.trait-mighty {
  color: var(--trait-mighty);
}
.points {
  margin: 8px 0 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  line-height: 1.5;
}
.fine {
  margin-top: 28px;
  font-size: 14px;
}
@media (max-width: 380px) {
  .terms {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
