/**
 * Solo balancing simulation (docs/SOLO_SPEC.md, "Balancing"). Read-only: it loads past seasons' stats and plays Solo
 * runs entirely in memory, as if each past season were the current one. Heroes are ranked and given Levels the way
 * Crossover does it, week by week; the Quest damage is Crossover's (class damage, natural 20s and 1s, the monster's
 * weaknesses, Champion and synergies); prices, the best-party search and the monsters are the server's own Solo code
 * (solo/soloRules.ts), and the campaign is the engine's (season/campaign.ts). Nothing is written to the database.
 *
 *   npm run simulate:solo                              measure, then search the boss factor (Level² costs, cap 116)
 *   npm run simulate:solo -- --cap 116 --boss 1.1      report one setting in detail
 *   npm run simulate:solo -- --cap 100,116,132         compare caps
 *   npm run simulate:solo -- --seeds 4                 fewer runs per season and start week (faster)
 *   npm run simulate:solo -- --hp-fixed                one weekly value for every run, instead of each run's best
 *                                                      buyable party's projection (docs/SOLO_SPEC.md, "HP")
 *   npm run simulate:solo -- --curve 1                 costs by another curve: round(Level ^ curve) (Solo uses 2)
 *   npm run simulate:solo -- --pool league             Levels as deciles of a six-party Crossover pool
 *
 * Simplifications: a player with no stat line in a week is known to be resting before kickoff (byes, and injuries
 * announced in time); kickoff order within a week is ignored.
 */
import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { loadEnv } from '../config/env.js'
import { configureMongoose } from '../db/mongoose.js'
import { FIRST_LEAGUE_SEASON, LAST_LEAGUE_SEASON, MIN_PREVIOUS_GAMES, weeklyProfile } from '../modules/draft/candidates.js'
import { levelOnePoints } from '../modules/draft/crossoverCandidates.js'
import { CLASS_BY_POSITION, HERO_CLASSES, type HeroClass } from '../modules/heroes/classes.js'
import { assignTraits, type HeroTrait, type PoolCandidate } from '../modules/heroes/pool.js'
import { CROSSOVER_V1, getRuleset, RULESET_FOR_MODE, type Ruleset } from '../modules/scoring/rulesets.js'
import { scoreDefense, scoreOffense } from '../modules/scoring/scoring.js'
import { monsterMultiplier, playCampaignWeek, startCampaign, type CoopMonster } from '../modules/season/campaign.js'
import { critOf } from '../modules/season/crits.js'
import { ENCOUNTERS } from '../modules/season/encounters.js'
import { projectDamage } from '../modules/season/form.service.js'
import { applyStrategy } from '../modules/season/strategy.js'
import { bestParty, soloMonsters, soloWindows, type PartySlots } from '../modules/solo/soloRules.js'
import { DefenseWeekStatModel, PlayerWeekStatModel } from '../modules/stats/stats.models.js'

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '8' },
    cap: { type: 'string' },
    chapter: { type: 'string', default: '1' },
    boss: { type: 'string' },
    jitter: { type: 'string', default: '0.15' },
    pool: { type: 'string', default: 'all' },
    curve: { type: 'string', default: '2' },
    'hp-fixed': { type: 'boolean', default: false }
  }
})
const SEEDS = Number(values.seeds)
if (!Number.isInteger(SEEDS) || SEEDS < 1 || SEEDS > 100) throw new Error('--seeds must be 1-100')
const JITTER = Number(values.jitter)
if (!(JITTER >= 0 && JITTER < 0.5)) throw new Error('--jitter must be 0 to 0.5')
const POOL_KINDS = ['all', 'league'] as const
type PoolKind = (typeof POOL_KINDS)[number]
const isPoolKind = (value: string): value is PoolKind => (POOL_KINDS as readonly string[]).includes(value)
const POOL_KIND: PoolKind = isPoolKind(values.pool) ? values.pool : (() => { throw new Error('--pool must be all or league') })()

const HP_FIXED = values['hp-fixed']
const CURVE = Number(values.curve)
if (!(CURVE >= 1 && CURVE <= 3)) throw new Error('--curve must be 1 to 3')
/** What a hero costs by Level: Level squared (decided 2026-11-10), or another curve to compare */
const COSTS = Array.from({ length: 10 }, (_, index) => Math.max(1, Math.round((index + 1) ** CURVE)))

/** Crossover's scoring: class multipliers, crits, Quest modifiers, Champion and synergies */
const RULESET: Ruleset = CROSSOVER_V1
const QUEST = (() => {
  if (!RULESET.quest) throw new Error('The Crossover ruleset has no Quest rules')
  return RULESET.quest
})()
/** The ruleset new Solo runs start with (docs/SOLO_SPEC.md) */
const SOLO_RULESET = getRuleset(RULESET_FOR_MODE.solo)
/** Solo's rules (docs/SOLO_SPEC.md): lives and class modifiers, the budget, swaps and calendar */
const SOLO = (() => {
  if (!SOLO_RULESET.solo) throw new Error('The Solo ruleset has no Solo rules')
  return SOLO_RULESET.solo
})()
const ROSTER = SOLO_RULESET.lineup.rosterSize
const PARTY = SOLO_RULESET.quest?.partySize ?? 5
const SWAPS_PER_WEEK = SOLO.swapsPerWeek
const MAX_PALADINS = SOLO_RULESET.lineup.classLimits.Paladin ?? 2
const LAST_WEEK = SOLO.lastWeek
/** Decided 2026-11-10: with fewer, most monsters get one week and a bad Sunday costs a life */
const MIN_WEEKS = SOLO.minWeeks
/** The pool only has players who have played this season, so the earliest start is NFL week 2. */
const FIRST_START = SOLO.firstWeek
const LAST_START = LAST_WEEK - MIN_WEEKS + 1
/** A league-sized pool, for comparison: what a six-party Crossover league would draw */
const LEAGUE_PARTIES = 6

const PLANS = ['sensible', 'planner', 'stars', 'even', 'churn', 'noChampion'] as const
type Plan = (typeof PLANS)[number]
const PLAN_NAMES: Record<Plan, string> = {
  sensible: 'Sensible: best value, top 5 fight, swaps cover byes',
  planner: 'Planner: party + Champion set for each monster',
  stars: 'Stars: the best two Level 10s, then best value',
  even: 'Even: fighters within a Level of their average',
  churn: 'Churn: both swaps every week chase the best value',
  noChampion: 'Sensible, never a Champion'
}
/** How much a bench spot is worth when buying, against a fighter's 1: it only covers byes */
const BENCH_WEIGHT = SOLO.benchWeight

// ---------------------------------------------------------------------------
// Stats: each season's weekly points and the season before (for priors and traits)

interface Source {
  id: string
  heroClass: HeroClass
  /** Points by NFL week, for weeks played */
  weeks: Map<number, number>
  /** Last season's profile, if they played enough */
  profile: ReturnType<typeof weeklyProfile> | null
}

async function loadSeason(season: number): Promise<Source[]> {
  const weekFilter = mongoose.trusted({ $lte: LAST_WEEK })
  const [players, previous, defenses, previousDefenses] = await Promise.all([
    PlayerWeekStatModel.find({ season, seasonType: 'REG', week: weekFilter }, 'playerId position week stats').lean(),
    PlayerWeekStatModel.find({ season: season - 1, seasonType: 'REG' }, 'playerId stats').lean(),
    DefenseWeekStatModel.find({ season, seasonType: 'REG', week: weekFilter }, 'team week stats').lean(),
    DefenseWeekStatModel.find({ season: season - 1, seasonType: 'REG' }, 'team stats').lean()
  ])
  const sources = new Map<string, Source>()
  for (const line of players) {
    const heroClass = CLASS_BY_POSITION[line.position]
    const source = sources.get(line.playerId) ?? { id: line.playerId, heroClass, weeks: new Map<number, number>(), profile: null }
    source.heroClass = heroClass // the latest line decides, as in Crossover
    source.weeks.set(line.week, scoreOffense(line.stats, RULESET))
    sources.set(line.playerId, source)
  }
  for (const line of defenses) {
    const source = sources.get(`D:${line.team}`) ?? { id: `D:${line.team}`, heroClass: 'Paladin' as HeroClass, weeks: new Map<number, number>(), profile: null }
    source.weeks.set(line.week, scoreDefense(line.stats, RULESET))
    sources.set(source.id, source)
  }
  const lastSeason = new Map<string, number[]>()
  for (const line of previous) lastSeason.set(line.playerId, [...(lastSeason.get(line.playerId) ?? []), scoreOffense(line.stats, RULESET)])
  for (const line of previousDefenses) lastSeason.set(`D:${line.team}`, [...(lastSeason.get(`D:${line.team}`) ?? []), scoreDefense(line.stats, RULESET)])
  for (const source of sources.values()) {
    const weeks = lastSeason.get(source.id)
    source.profile = weeks && weeks.length >= MIN_PREVIOUS_GAMES ? weeklyProfile(weeks) : null
  }
  return [...sources.values()]
}

// ---------------------------------------------------------------------------
// The pool as of a week: Crossover's ranking blend, Levels as deciles within each class

interface Hero {
  id: string
  heroClass: HeroClass
  level: number
  /** Its price by Level (docs/SOLO_SPEC.md, "The budget") */
  cost: number
  /** Projected class damage per game: the ranking blend times the class multiplier */
  value: number
  traits: readonly HeroTrait[]
}

/** Everyone in the pool before `week`'s games, by id */
function poolAsOf(sources: readonly Source[], week: number, kind: PoolKind): Map<string, Hero> {
  const candidates: PoolCandidate[] = []
  for (const source of sources) {
    const played = [...source.weeks].filter(([w]) => w < week).map(([, points]) => points)
    if (played.length === 0) continue
    const prior = source.profile ? source.profile.ppg : levelOnePoints(source.heroClass, RULESET)
    candidates.push({
      sourceKind: source.heroClass === 'Paladin' ? 'defense' : 'player',
      sourceId: source.id,
      heroClass: source.heroClass,
      ppg: projectDamage(played, prior),
      ...(source.profile ? { volatility: source.profile.volatility, ceiling: source.profile.ceiling } : {})
    })
  }
  const pool = new Map<string, Hero>()
  for (const heroClass of HERO_CLASSES) {
    const ofClass = candidates
      .filter(candidate => candidate.heroClass === heroClass)
      .sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0) || a.sourceId.localeCompare(b.sourceId))
    const taken = kind === 'all' ? ofClass : ofClass.slice(0, RULESET.pool.perParty[heroClass] * LEAGUE_PARTIES)
    const traits = assignTraits(taken)
    taken.forEach((candidate, index) => {
      pool.set(candidate.sourceId, {
        id: candidate.sourceId,
        heroClass,
        level: 10 - Math.floor((index * 10) / taken.length),
        cost: COSTS[9 - Math.floor((index * 10) / taken.length)] ?? 1,
        value: (candidate.ppg ?? 0) * RULESET.lineup.classMultipliers[heroClass],
        traits: traits.get(candidate.sourceId) ?? []
      })
    })
  }
  return pool
}

// ---------------------------------------------------------------------------
// Buying a party under the cap: the server's exact search over fighters (worth 1) and bench spots (worth BENCH_WEIGHT)

type Slots = PartySlots

function buy(pool: Iterable<Hero>, cap: number, slots: Slots, maxCost = Infinity): Hero[] {
  const found = bestParty(pool, cap, slots, BENCH_WEIGHT, maxCost)
  return [...found.fighters, ...found.bench]
}

const FULL: Slots = { fighters: PARTY, bench: ROSTER - PARTY, paladins: MAX_PALADINS }

function build(plan: Plan, pool: Map<string, Hero>, cap: number): Hero[] {
  // Even fighters: with the cheapest bench, no hero costs more than the fighters' average price plus one Level's step
  if (plan === 'even') {
    const fighterAverage = Math.round((cap - (ROSTER - PARTY) * (COSTS[0] ?? 1)) / PARTY)
    const level = COSTS.findIndex(cost => cost >= fighterAverage)
    return buy(pool.values(), cap, FULL, COSTS[Math.min(9, (level < 0 ? 9 : level) + 1)] ?? fighterAverage)
  }
  if (plan !== 'stars') return buy(pool.values(), cap, FULL)
  // The two best Level 10s fight; the knapsack buys the rest around them.
  // As many of the two as the cap allows, leaving the cheapest price for everyone else
  const cheapest = COSTS[0] ?? 1
  const stars = [...pool.values()]
    .filter(hero => hero.level === 10 && hero.heroClass !== 'Paladin')
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
    .slice(0, 2)
    .filter((hero, index) => (index + 1) * hero.cost + (ROSTER - index - 1) * cheapest <= cap)
  const taken = new Set(stars.map(hero => hero.id))
  const rest = buy(
    [...pool.values()].filter(hero => !taken.has(hero.id)),
    cap - stars.reduce((sum, hero) => sum + hero.cost, 0),
    { ...FULL, fighters: PARTY - stars.length }
  )
  return [...stars, ...rest]
}

// ---------------------------------------------------------------------------
// The campaign, scaled to the weeks left (docs/SOLO_SPEC.md, "The campaign")

/** The run's monsters, from the server's own code (soloRules.ts), with HP from the expected weekly damage */
function monstersFor(seed: string, weeks: number, perWeek: number, chapterFactor: number, bossFactor: number) {
  // perWeek is already what a party deals, so no projection scale here
  const monsters = soloMonsters(seed, weeks, perWeek, { ...SOLO, projectionScale: 1, hpVariation: JITTER, chapterFactor, bossFactor })
  return monsters.map(monster => {
    // Each encounter has its own pair of weaknesses, so they identify it (the boss carries the next one's).
    const encounter = ENCOUNTERS.findIndex(entry => entry.resists === monster.resists && entry.weak.join() === monster.weak.join())
    if (encounter < 0) throw new Error(`Monster ${monster.name} matches no encounter`)
    return { monster, encounter }
  })
}

// ---------------------------------------------------------------------------
// A party through the season. Its roster doesn't depend on the monsters, so each week's damage is measured once
// against each of the ten encounters; every seed's campaign then reads its own monsters from that table.

interface Run {
  season: number
  start: number
  plan: Plan
  cap: number
  /** [run week][encounter index] the party's damage */
  byEncounter: number[][]
  /** [run week] damage with no monster modifiers, for the expected-damage measure */
  plain: number[]
  /** The bought party's Levels, highest first */
  levels: number[]
  swapsUsed: number
  /** The bought party's projected damage per game: its best five, by value */
  projected: number
}

interface Owned {
  hero: Hero
  /** The Level paid at signing */
  paid: number
}

type Points = ReadonlyMap<string, number>
type Modifiers = Pick<CoopMonster, 'weak' | 'resists'> | null

/** One week's Quest damage for a party of fighters (Crossover's buildCrossoverSide, without the database) */
function questDamage(fighters: readonly Hero[], champion: string | null, points: Points, monster: Modifiers): number {
  const lines = fighters.flatMap(hero => {
    const earned = points.get(hero.id)
    if (earned === undefined) return []
    let damage = earned * RULESET.lineup.classMultipliers[hero.heroClass]
    const crit = critOf({ slot: 'quest', points: earned, resting: false }, hero.heroClass, RULESET)
    if (crit === 'success') damage *= QUEST.natural20Multiplier
    if (crit === 'fail') damage *= QUEST.natural1Multiplier
    if (monster) damage *= monsterMultiplier(monster, hero.heroClass, SOLO)
    return [{ heroId: hero.id, traits: hero.traits, damage: Math.round(damage * 100) / 100, isChampion: hero.id === champion }]
  })
  return applyStrategy(lines, RULESET.strategy).total
}

/** The plan's five fighters and Champion for a week, from the heroes not resting */
function setup(plan: Plan, roster: readonly Hero[], points: Points, monster: Modifiers) {
  const worth = (hero: Hero) => hero.value * (plan === 'planner' && monster ? monsterMultiplier(monster, hero.heroClass, SOLO) : 1)
  const fighters = roster
    .filter(hero => points.has(hero.id))
    .sort((a, b) => worth(b) - worth(a) || a.id.localeCompare(b.id))
    .slice(0, PARTY)
  return { fighters, champion: plan === 'noChampion' ? null : (fighters[0]?.id ?? null) }
}

function playRun(season: number, start: number, plan: Plan, cap: number, pools: Map<number, Map<string, Hero>>, weeks: Map<number, Points>): Run {
  const startPool = pools.get(start)
  if (!startPool) throw new Error(`No pool for week ${String(start)}`)
  let owned: Owned[] = build(plan, startPool, cap).map(hero => ({ hero, paid: hero.cost }))
  const levels = owned.map(entry => entry.hero.level).sort((a, b) => b - a)
  const projected = owned
    .map(entry => entry.hero.value)
    .sort((a, b) => b - a)
    .slice(0, PARTY)
    .reduce((sum, value) => sum + value, 0)
  const byEncounter: number[][] = []
  const plain: number[] = []
  let swapsUsed = 0

  for (let week = start; week <= LAST_WEEK; week++) {
    const pool = pools.get(week) ?? startPool
    const points = weeks.get(week) ?? new Map<string, number>()
    // Levels and projections move with the season; prices stay as paid.
    owned = owned.map(entry => ({ hero: pool.get(entry.hero.id) ?? entry.hero, paid: entry.paid }))
    const plays = (hero: Hero) => points.has(hero.id)
    const sign = (release: Owned, wanted: (hero: Hero) => boolean): boolean => {
      const others = owned.filter(entry => entry !== release)
      const budget = cap - others.reduce((sum, entry) => sum + entry.paid, 0)
      const ids = new Set(owned.map(entry => entry.hero.id))
      const paladinRoom = others.filter(entry => entry.hero.heroClass === 'Paladin').length < MAX_PALADINS
      let pick: Hero | undefined
      for (const hero of pool.values()) {
        if (ids.has(hero.id) || hero.cost > budget || !wanted(hero) || (hero.heroClass === 'Paladin' && !paladinRoom)) continue
        if (!pick || hero.value > pick.value || (hero.value === pick.value && hero.id < pick.id)) pick = hero
      }
      if (!pick) return false
      owned = [...others, { hero: pick, paid: pick.cost }]
      return true
    }

    let swaps = SWAPS_PER_WEEK
    if (plan === 'churn') {
      // Every week, swap the weakest hero for the best value the budget allows, if it's better and plays.
      while (swaps > 0) {
        const weakest = [...owned].sort((a, b) => a.hero.value - b.hero.value)[0]
        if (!weakest || !sign(weakest, hero => hero.value > weakest.hero.value && plays(hero))) break
        swaps--
      }
    }
    // Cover byes: while fewer than five can fight, release the weakest hero who won't fight and sign one who will.
    while (swaps > 0 && owned.filter(entry => plays(entry.hero)).length < PARTY) {
      const keep = new Set(
        owned
          .filter(entry => plays(entry.hero))
          .sort((a, b) => b.hero.value - a.hero.value)
          .slice(0, PARTY)
          .map(entry => entry.hero.id)
      )
      const release = owned.filter(entry => !keep.has(entry.hero.id)).sort((a, b) => a.hero.value - b.hero.value)[0]
      if (!release || !sign(release, plays)) break
      swaps--
    }
    swapsUsed += SWAPS_PER_WEEK - swaps

    const roster = owned.map(entry => entry.hero)
    const run = week - start + 1
    byEncounter[run] = ENCOUNTERS.map(encounter => {
      const { fighters, champion } = setup(plan, roster, points, encounter)
      return questDamage(fighters, champion, points, encounter)
    })
    const plainSetup = setup(plan === 'planner' ? 'sensible' : plan, roster, points, null)
    plain[run] = questDamage(plainSetup.fighters, plainSetup.champion, points, null)
  }
  return { season, start, plan, cap, byEncounter, plain, levels, swapsUsed, projected }
}

// ---------------------------------------------------------------------------
// Playing the campaign on a run's damage table, for one seed

interface Result {
  won: boolean
  livesLost: number
  lostAt: number | null
}

const SEED_NAMES = Array.from({ length: SEEDS }, (_, n) => n)

function campaign(run: Run, n: number, perWeek: number, chapterFactor: number, bossFactor: number): Result {
  const weeks = LAST_WEEK - run.start + 1
  const drawn = monstersFor(`solo-sim:${String(run.season)}:${String(run.start)}:${String(n)}`, weeks, perWeek, chapterFactor, bossFactor)
  const monsters = drawn.map(entry => entry.monster)
  const rules = SOLO
  let state = startCampaign(monsters, rules)
  for (let week = 1; week <= weeks && state.outcome === 'ongoing'; week++) {
    const encounter = drawn[state.chapter - 1]?.encounter ?? 0
    state = playCampaignWeek(state, run.byEncounter[week]?.[encounter] ?? 0, week, monsters).state
  }
  const won = state.outcome === 'won'
  return { won, livesLost: rules.lives - state.livesLeft, lostAt: won ? null : state.chapter }
}

const pct = (part: number, whole: number) => `${((100 * part) / Math.max(1, whole)).toFixed(0)}%`
const mean = (items: readonly number[]) => items.reduce((sum, value) => sum + value, 0) / Math.max(1, items.length)

// ---------------------------------------------------------------------------

const CAPS = values.cap === undefined ? [SOLO.cap] : values.cap.split(',').map(Number)
const MAX_CAP = ROSTER * (COSTS[9] ?? 10)
if (CAPS.some(cap => !Number.isInteger(cap) || cap < ROSTER || cap > MAX_CAP)) throw new Error(`--cap must be ${String(ROSTER)}-${String(MAX_CAP)}`)

const env = loadEnv()
configureMongoose()
await mongoose.connect(env.MONGODB_URI)
const runs: Run[] = []
const spread: Partial<Record<HeroClass, number[]>> = {}
/** Projected damage by Level at the earliest start, every class */
const valueByLevel = Array.from({ length: 11 }, () => [] as number[])
try {
  for (let season = FIRST_LEAGUE_SEASON; season <= LAST_LEAGUE_SEASON; season++) {
    const sources = await loadSeason(season)
    const pools = new Map<number, Map<string, Hero>>()
    const weeks = new Map<number, Points>()
    for (let week = FIRST_START; week <= LAST_WEEK; week++) {
      pools.set(week, poolAsOf(sources, week, POOL_KIND))
      weeks.set(week, new Map(sources.flatMap(source => {
        const points = source.weeks.get(week)
        return points === undefined ? [] : [[source.id, points] as const]
      })))
    }
    // Cost spread: how many heroes each class has at each Level, at the earliest start
    for (const hero of pools.get(FIRST_START)?.values() ?? []) {
      const counts = (spread[hero.heroClass] ??= Array.from({ length: 11 }, () => 0))
      counts[hero.level] = (counts[hero.level] ?? 0) + 1
      valueByLevel[hero.level]?.push(hero.value)
    }
    for (let start = FIRST_START; start <= LAST_START; start++) {
      for (const cap of CAPS) for (const plan of PLANS) runs.push(playRun(season, start, plan, cap, pools, weeks))
    }
    process.stdout.write(`${String(season)} `)
  }
} finally {
  await mongoose.disconnect()
}
const seasonCount = LAST_LEAGUE_SEASON - FIRST_LEAGUE_SEASON + 1
console.log(`\n${String(runs.length)} parties, each played against ${String(SEEDS)} seeded campaigns (pool: ${POOL_KIND})\n`)

console.log(`Pool at NFL week ${String(FIRST_START)}: heroes at Level 1 ... 10, average per season`)
for (const heroClass of HERO_CLASSES) {
  console.log(`  ${heroClass.padEnd(8)} ${(spread[heroClass] ?? []).slice(1).map(count => (count / seasonCount).toFixed(0).padStart(4)).join('')}`)
}

console.log(`\nCosts by Level 1 ... 10 (--curve ${String(CURVE)}): ${COSTS.join(' ')}`)
console.log(`Projected damage per game by Level: ${valueByLevel.slice(1).map(list => mean(list).toFixed(1)).join(' ')}`)

// Expected damage per week: the sensible plan's plain damage at each cap, every season and start week
const ofPlan = (plan: Plan, cap: number) => runs.filter(run => run.plan === plan && run.cap === cap)
const perWeekOf = new Map(CAPS.map(cap => [cap, mean(ofPlan('sensible', cap).flatMap(run => run.plain.slice(1)))]))
console.log('\nExpected party damage per week, no monster (and the bought party)')
for (const cap of CAPS) {
  const line = PLANS.map(plan => {
    const list = ofPlan(plan, cap)
    return `${plan} ${mean(list.flatMap(run => run.plain.slice(1))).toFixed(0)} (L${mean(list.map(run => run.levels[0] ?? 0)).toFixed(1)} top, ${mean(list.map(run => mean(run.levels))).toFixed(1)} avg)`
  })
  console.log(`  cap ${String(cap)}: ${line.join('  ')}`)
}
const firstCap = CAPS[0] ?? 48
const churnSwaps = mean(ofPlan('churn', firstCap).map(run => run.swapsUsed / (LAST_WEEK - run.start + 1)))
const coverSwaps = mean(ofPlan('sensible', firstCap).map(run => run.swapsUsed / (LAST_WEEK - run.start + 1)))
console.log(`  swaps used a week (cap ${String(firstCap)}): sensible ${coverSwaps.toFixed(2)}, churn ${churnSwaps.toFixed(2)}`)
// Bye weeks: the sensible plan's plain damage by NFL week, against its average
const byWeek = Array.from({ length: LAST_WEEK + 1 }, () => [] as number[])
for (const run of ofPlan('sensible', firstCap)) {
  run.plain.forEach((value, index) => {
    if (index > 0) byWeek[run.start + index - 1]?.push(value)
  })
}
const overallWeek = mean(byWeek.flat())
console.log(`\nDamage by NFL week against the average (cap ${String(firstCap)}):`)
console.log(`  ${byWeek.map((list, week) => (list.length ? `${String(week)}: ${(mean(list) / overallWeek).toFixed(2)}` : '')).filter(Boolean).join('  ')}`)

// How much the real season decides: the sensible party's damage by season, against its average
const sensibleRuns = ofPlan('sensible', firstCap)
const overallPlain = mean(sensibleRuns.flatMap(run => run.plain.slice(1)))
const bySeason = Array.from({ length: seasonCount }, (_, index) => FIRST_LEAGUE_SEASON + index)
console.log(`\nThe sensible party's damage by season, against its average:`)
console.log(`  ${bySeason.map(season => `${String(season)}: ${(mean(sensibleRuns.filter(run => run.season === season).flatMap(run => run.plain.slice(1))) / overallPlain).toFixed(2)}`).join('  ')}`)

const startWeeks = Array.from({ length: LAST_START - FIRST_START + 1 }, (_, index) => FIRST_START + index)
const projectedMean = mean(sensibleRuns.map(run => run.projected))
console.log(`\nThe sensible party by start week, against the average: damage dealt / projected at the start`)
console.log(
  `  ${startWeeks
    .map(start => {
      const ofStart = sensibleRuns.filter(run => run.start === start)
      const dealt = mean(ofStart.flatMap(run => run.plain.slice(1))) / overallPlain
      return `${String(start)}: ${dealt.toFixed(2)} / ${(mean(ofStart.map(run => run.projected)) / projectedMean).toFixed(2)}`
    })
    .join('  ')}`
)

// Each run's expected weekly damage: the best buyable party's projection at its start (the sensible build is that
// party), scaled so the average matches what sensible parties actually dealt. Every plan in a run faces the same HP.
const projectedKey = (run: Run) => `${String(run.season)}:${String(run.start)}:${String(run.cap)}`
const projectedAt = new Map(runs.filter(run => run.plan === 'sensible').map(run => [projectedKey(run), run.projected]))
const projectionScale = new Map(
  CAPS.map(cap => [cap, (perWeekOf.get(cap) ?? 0) / Math.max(1, mean(ofPlan('sensible', cap).map(run => run.projected)))])
)
console.log(
  HP_FIXED
    ? '\nHP: one weekly value for every run'
    : `\nHP: the best party's projection at the start, ×${CAPS.map(cap => (projectionScale.get(cap) ?? 0).toFixed(2)).join(' / ')}`
)
const expectedFor = (run: Run, cap: number) =>
  HP_FIXED ? (perWeekOf.get(cap) ?? 0) : (projectedAt.get(projectedKey(run)) ?? 0) * (projectionScale.get(cap) ?? 0)

const results = (plan: Plan, cap: number, chapterFactor: number, bossFactor: number) =>
  ofPlan(plan, cap).flatMap(run => SEED_NAMES.map(n => ({ run, result: campaign(run, n, expectedFor(run, cap), chapterFactor, bossFactor) })))
const winRate = (plan: Plan, cap: number, chapterFactor: number, bossFactor: number) => {
  const rows = results(plan, cap, chapterFactor, bossFactor)
  return rows.filter(row => row.result.won).length / Math.max(1, rows.length)
}

const chapterFactor = Number(values.chapter)
if (!(chapterFactor > 0)) throw new Error('--chapter must be a positive number')
if (values.boss === undefined) {
  const bossFactors = [1, 1.1, 1.2, 1.25, 1.3, 1.4]
  for (const cap of CAPS) {
    console.log(`\nCap ${String(cap)}, chapter factor ${String(chapterFactor)}: win rate by boss factor ${bossFactors.map(factor => factor.toFixed(2)).join(' / ')}`)
    for (const plan of PLANS) {
      console.log(`  ${PLAN_NAMES[plan].padEnd(54)} ${bossFactors.map(factor => pct(winRate(plan, cap, chapterFactor, factor), 1).padStart(6)).join('')}`)
    }
  }
  console.log('\nRerun with --cap X --boss Y (and --chapter Z) for the detailed report.')
} else {
  const bossFactor = Number(values.boss)
  if (!(bossFactor > 0)) throw new Error('--boss must be a positive number')
  const cap = firstCap
  console.log(`\nCap ${String(cap)}, chapter factor ${String(chapterFactor)}, boss factor ${String(bossFactor)}, expected ${(perWeekOf.get(cap) ?? 0).toFixed(1)} a week\n`)
  type Row = ReturnType<typeof results>[number]
  const report = (label: string, rows: readonly Row[]) => {
    const lives = [0, 1, 2, 3].map(lost => rows.filter(row => row.result.livesLost === lost).length)
    console.log(`${label.padEnd(58)} win ${pct(rows.filter(row => row.result.won).length, rows.length).padStart(4)}   lives lost 0/1/2/3: ${lives.map(count => pct(count, rows.length)).join(' / ')}`)
  }
  console.log('By plan')
  for (const plan of PLANS) report(`  ${PLAN_NAMES[plan]}`, results(plan, cap, chapterFactor, bossFactor))
  const sensible = results('sensible', cap, chapterFactor, bossFactor)
  console.log('\nBy start week (sensible)')
  for (let start = FIRST_START; start <= LAST_START; start++) {
    const weeks = LAST_WEEK - start + 1
    report(`  NFL week ${String(start)} (${String(weeks)} weeks: ${soloWindows(weeks, SOLO.chapters).join('/')})`, sensible.filter(row => row.run.start === start))
  }
  console.log('\nWhere sensible runs lost')
  for (let chapter = 1; chapter <= 5; chapter++) {
    console.log(`  chapter ${String(chapter)}${chapter === 5 ? ' (boss)' : ''}: ${pct(sensible.filter(row => row.result.lostAt === chapter).length, sensible.length)} of runs`)
  }
  console.log('\nWin rate by season (sensible)')
  const years = Array.from({ length: seasonCount }, (_, index) => FIRST_LEAGUE_SEASON + index)
  console.log(`  ${years.map(season => `${String(season)}: ${pct(sensible.filter(row => row.run.season === season && row.result.won).length, sensible.filter(row => row.run.season === season).length)}`).join('  ')}`)
}
