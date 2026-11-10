/**
 * Co-op balancing simulation (docs/COOP_SPEC.md, "HP and difficulty"). Read-only: it loads past seasons' stats and
 * runs leagues entirely in memory through the real pool, draft, lineup, auto-swap and strategy code. Nothing is
 * written to the database.
 *
 *   npm run simulate:coop                              measure, then search difficulty factors
 *   npm run simulate:coop -- --chapter 1.0 --boss 1.2  report one setting in detail
 *   npm run simulate:coop -- --seeds 4                 fewer leagues per season and size (faster)
 *   npm run simulate:coop -- --season-hp --jitter 0.1  HP follows the hidden season; each monster varies up to ±10%
 *
 * Not simulated: free agency and lineup changes beyond each plan's own rules.
 */
import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { loadEnv } from '../config/env.js'
import { configureMongoose } from '../db/mongoose.js'
import { createRng } from '../lib/random.js'
import { FIRST_LEAGUE_SEASON, LAST_LEAGUE_SEASON, LAST_MATCHUP_WEEK, loadPoolCandidates } from '../modules/draft/candidates.js'
import { runSnakeDraft } from '../modules/draft/snakeDraft.js'
import type { HeroClass } from '../modules/heroes/classes.js'
import { autoLineup, planAutoSwaps, type Lineup } from '../modules/heroes/lineup.js'
import { expectedLevel, selectHeroPool, type PoolEntry } from '../modules/heroes/pool.js'
import { COOP_V1, RULESET_V1, type CoopRules, type Ruleset } from '../modules/scoring/rulesets.js'
import { scoreDefense, scoreOffense } from '../modules/scoring/scoring.js'
import { coopMonsters, monsterMultiplier, playCampaignWeek, startCampaign, type CoopMonster } from '../modules/season/campaign.js'
import { applyStrategy } from '../modules/season/strategy.js'
import { DefenseWeekStatModel, PlayerWeekStatModel } from '../modules/stats/stats.models.js'

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '12' },
    chapter: { type: 'string' },
    boss: { type: 'string' },
    'season-hp': { type: 'boolean', default: false },
    jitter: { type: 'string', default: '0' }
  }
})
const SEEDS = Number(values.seeds)
if (!Number.isInteger(SEEDS) || SEEDS < 1 || SEEDS > 100) throw new Error('--seeds must be 1-100')
const SEASON_HP = values['season-hp']
const JITTER = Number(values.jitter)
if (!(JITTER >= 0 && JITTER < 0.5)) throw new Error('--jitter must be 0 to 0.5')

const RULESET: Ruleset = RULESET_V1
const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
/** Sizes shown in the summary tables */
const SHOWN_SIZES = [2, 4, 6, 8, 12]
const PLANS = ['level', 'weakness', 'noChampion'] as const
type Plan = (typeof PLANS)[number]
const PLAN_NAMES: Record<Plan, string> = {
  level: 'Rank by Level, best starter Champion',
  weakness: 'Play to the monster (lineup + Champion)',
  noChampion: 'Rank by Level, never a Champion'
}
/** The campaign rules being tuned: deadlines, lives and class modifiers as in the Co-op ruleset */
const COOP = (() => {
  const rules = COOP_V1.coop
  if (!rules) throw new Error('The Co-op ruleset has no campaign rules')
  return rules
})()
const CHAPTERS = COOP.deadlines.length

interface Hero {
  id: string
  heroClass: HeroClass
  value: number
  traits: PoolEntry['traits']
}

/** Points by hero id, per week; a missing entry is a resting hero */
type WeekPoints = Map<string, number>[]

async function loadWeeks(season: number): Promise<WeekPoints> {
  const weeks: WeekPoints = Array.from({ length: LAST_MATCHUP_WEEK + 1 }, () => new Map<string, number>())
  const [players, defenses] = await Promise.all([
    PlayerWeekStatModel.find({ season, seasonType: 'REG', week: mongoose.trusted({ $lte: LAST_MATCHUP_WEEK }) }, 'playerId week stats').lean(),
    DefenseWeekStatModel.find({ season, seasonType: 'REG', week: mongoose.trusted({ $lte: LAST_MATCHUP_WEEK }) }, 'team week stats').lean()
  ])
  for (const line of players) weeks[line.week]?.set(line.playerId, scoreOffense(line.stats, RULESET))
  for (const line of defenses) weeks[line.week]?.set(line.team, scoreDefense(line.stats, RULESET))
  return weeks
}

const multiplierOf = (monster: CoopMonster | null, heroClass: HeroClass) => (monster ? monsterMultiplier(monster, heroClass, COOP) : 1)

/** What a hero is expected to deal: the ruleset's damage for their Level, times the monster's modifier */
function expectedDamage(hero: Hero, monster: CoopMonster | null): number {
  const table = RULESET.levelDamage[hero.heroClass]
  const level = Math.min(10, Math.max(1, Math.round(hero.value)))
  return (table[level - 1] ?? 0) * multiplierOf(monster, hero.heroClass)
}

interface PartySetup {
  lineup: Lineup
  champion: string | null
}

/** A plan's lineup and Champion against a monster (null: no modifiers, to measure plain damage) */
function setup(plan: Plan, roster: readonly Hero[], monster: CoopMonster | null): PartySetup {
  const slots = RULESET.lineup.slots
  const aware = plan === 'weakness'
  const ranked = roster.map(hero => ({ id: hero.id, heroClass: hero.heroClass, value: aware ? expectedDamage(hero, monster) : hero.value }))
  const lineup = autoLineup(ranked, slots)
  if (plan === 'noChampion') return { lineup, champion: null }
  const starters = new Set(Object.values(lineup))
  const best = ranked.filter(hero => starters.has(hero.id)).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))[0]
  return { lineup, champion: best?.id ?? null }
}

/** One party's damage for a week: the engine's Classic battle (buildSide) with the monster's modifiers per hero */
function partyDamage(roster: readonly Hero[], party: PartySetup, points: ReadonlyMap<string, number>, monster: CoopMonster | null): number {
  const { slots, classMultipliers, autoSwapMultiplier } = RULESET.lineup
  const round2 = (value: number) => Math.round(value * 100) / 100
  const starters = new Set(Object.values(party.lineup))
  const resting = (id: string) => !points.has(id)
  const swaps = planAutoSwaps(
    party.lineup,
    slots,
    new Set([...starters].filter(resting)),
    roster.filter(hero => !starters.has(hero.id)).map(hero => ({ id: hero.id, heroClass: hero.heroClass, value: hero.value, resting: resting(hero.id) }))
  )
  const swappedIn = new Set(swaps.values())
  const fighters = roster.flatMap(hero => {
    const starter = starters.has(hero.id)
    if (!(starter && !resting(hero.id)) && !swappedIn.has(hero.id)) return []
    const damage = (points.get(hero.id) ?? 0) * classMultipliers[hero.heroClass] * multiplierOf(monster, hero.heroClass)
    return [
      {
        heroId: hero.id,
        traits: hero.traits,
        damage: round2(starter ? damage : damage * autoSwapMultiplier),
        isChampion: starter && hero.id === party.champion
      }
    ]
  })
  return applyStrategy(fighters, RULESET.strategy).total
}

/**
 * One league's damage table: for each week and each of its five monsters, every party's total. The campaign then
 * runs on this table for any HP setting without recomputing battles.
 */
interface LeagueRun {
  season: number
  size: number
  plan: Plan
  seed: string
  /** [week][monster index] league damage */
  damage: number[][]
  /** [week] each party's damage with no monster modifiers, for the expected-damage measure */
  plain: number[][]
}

function draftLeague(season: number, size: number, seed: string, candidates: Awaited<ReturnType<typeof loadPoolCandidates>>) {
  const pool = selectHeroPool(candidates, size, RULESET.pool)
  const heroes: Hero[] = pool.map(entry => ({
    id: entry.sourceId,
    heroClass: entry.heroClass,
    value: expectedLevel(entry),
    traits: entry.traits
  }))
  const byId = new Map(heroes.map(hero => [hero.id, hero]))
  const parties = Array.from({ length: size }, (_, index) => ({ id: `p${String(index)}`, ranking: [] }))
  // Bots rank nothing, so the draft takes the best Level available: every plan drafts the same way.
  const { picks } = runSnakeDraft(parties, heroes, createRng(seed, 'draft'), RULESET.lineup)
  return parties.map(party => picks.filter(pick => pick.partyId === party.id).flatMap(pick => byId.get(pick.heroId) ?? []))
}

function runLeague(season: number, size: number, plan: Plan, seed: string, rosters: Hero[][], weeks: WeekPoints): LeagueRun {
  // The league's monsters as the engine sets them (only their weaknesses matter for the damage table)
  const monsters = coopMonsters(seed, season, size, COOP)
  // Each party with its plan's setup per monster, and with no monster for the plain measure
  const parties = rosters.map(roster => ({
    roster,
    against: monsters.map(monster => setup(plan, roster, monster)),
    plain: setup(plan, roster, null)
  }))
  const damage: number[][] = []
  const plain: number[][] = []
  for (let week = 1; week <= LAST_MATCHUP_WEEK; week++) {
    const points = weeks[week] ?? new Map<string, number>()
    damage[week] = monsters.map((monster, index) =>
      parties.reduce((sum, party) => sum + partyDamage(party.roster, party.against[index] ?? party.plain, points, monster), 0)
    )
    plain[week] = parties.map(party => partyDamage(party.roster, party.plain, points, null))
  }
  return { season, size, plan, seed, damage, plain }
}

interface Campaign {
  won: boolean
  livesLost: number
  /** Chapters failed (1-5) */
  failed: number[]
  /** The chapter the league lost at, or null on a win */
  lostAt: number | null
  /** Weeks banked: boss start week earlier than its window */
  bossStart: number
  cascades: number
}

/** The Co-op rules with this run's measured damage and the factors being tried */
function rulesFor(chapterFactor: number, bossFactor: number): CoopRules {
  return {
    ...COOP,
    partyDamage: Object.fromEntries(perParty),
    // Without --season-hp every season counts as average.
    seasonFactors: SEASON_HP ? Object.fromEntries(seasonFactor) : {},
    chapterFactor,
    bossFactor,
    hpVariation: JITTER
  }
}

/** Plays a league's damage table through the engine's campaign rules (season/campaign.ts). */
function campaign(run: LeagueRun, rules: CoopRules): Campaign {
  const monsters = coopMonsters(run.seed, run.season, run.size, rules)
  let state = startCampaign(monsters, rules)
  let cascades = 0
  let bossStart = (rules.deadlines.at(-2) ?? 0) + 1
  const failed: number[] = []
  for (let week = 1; week <= LAST_MATCHUP_WEEK && state.outcome === 'ongoing'; week++) {
    if (state.chapter === monsters.length) bossStart = Math.min(bossStart, week)
    const played = playCampaignWeek(state, run.damage[week]?.[state.chapter - 1] ?? 0, week, monsters)
    if (played.fallen.length > 1) cascades++
    if (played.failed !== null) failed.push(played.failed)
    state = played.state
  }
  const won = state.outcome === 'won'
  return { won, livesLost: rules.lives - state.livesLeft, failed, lostAt: won ? null : state.chapter, bossStart, cascades }
}

const pct = (part: number, whole: number) => `${((100 * part) / Math.max(1, whole)).toFixed(0)}%`
const mean = (items: readonly number[]) => items.reduce((sum, value) => sum + value, 0) / Math.max(1, items.length)

const env = loadEnv()
configureMongoose()
await mongoose.connect(env.MONGODB_URI)
const runs: LeagueRun[] = []
try {
  for (let season = FIRST_LEAGUE_SEASON; season <= LAST_LEAGUE_SEASON; season++) {
    const [candidates, weeks] = await Promise.all([loadPoolCandidates(season, RULESET), loadWeeks(season)])
    for (const size of SIZES) {
      for (let n = 0; n < SEEDS; n++) {
        const seed = `coop-sim:${String(season)}:${String(size)}:${String(n)}`
        const rosters = draftLeague(season, size, seed, candidates)
        for (const plan of PLANS) runs.push(runLeague(season, size, plan, seed, rosters, weeks))
      }
    }
    process.stdout.write(`${String(season)} `)
  }
} finally {
  await mongoose.disconnect()
}
console.log(`\n${String(runs.length)} leagues (${String(SEEDS)} per season, size and plan)\n`)

// Expected party damage: the plain weekly damage of the default plan, every season and size.
const plainOf = (filter: (run: LeagueRun) => boolean) =>
  mean(runs.filter(run => run.plan === 'level' && filter(run)).flatMap(run => run.plain.slice(1).flat()))
// Bigger leagues spread the talent thinner, so each size has its own value (rounded, as the ruleset stores it).
const perParty = new Map(SIZES.map(size => [size as number, Math.round(plainOf(run => run.size === size))]))
console.log(`Expected party damage per week (Level plan, no monster), all sizes: ${plainOf(() => true).toFixed(1)}`)
console.log(`  by size: ${SIZES.map(size => `${String(size)}: ${String(perParty.get(size))}`).join('  ')}`)
const seasons = Array.from({ length: LAST_LEAGUE_SEASON - FIRST_LEAGUE_SEASON + 1 }, (_, index) => FIRST_LEAGUE_SEASON + index)
const bySeason = seasons.map(season => plainOf(run => run.season === season))
console.log(`  by season: lowest ${Math.min(...bySeason).toFixed(1)}, highest ${Math.max(...bySeason).toFixed(1)}`)
// A season's scoring relative to the average, across every size (sizes differ by about the same share each season)
const overall = plainOf(() => true)
const seasonFactor = new Map(seasons.map((season, index) => [season, Math.round(((bySeason[index] ?? overall) / overall) * 100) / 100]))
console.log(`  season factors: ${seasons.map(season => `${String(season)}: ${String(seasonFactor.get(season))}`).join('  ')}`)
console.log(`HP: ${SEASON_HP ? 'scaled to the season' : 'the same every season'}, each monster ±${String(JITTER * 100)}%\n`)

const winRate = (plan: Plan, chapterFactor: number, bossFactor: number) => {
  const ofPlan = runs.filter(run => run.plan === plan)
  const rules = rulesFor(chapterFactor, bossFactor)
  return ofPlan.filter(run => campaign(run, rules).won).length / ofPlan.length
}

if (values.chapter === undefined || values.boss === undefined) {
  const chapterFactors = [0.85, 0.9, 0.95, 1, 1.05, 1.1]
  const bossFactors = [1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3]
  console.log('Win rate, Level plan (rows: chapter factor, columns: boss factor)')
  console.log(`        ${bossFactors.map(factor => factor.toFixed(2).padStart(6)).join('')}`)
  for (const chapterFactor of chapterFactors) {
    const row = bossFactors.map(bossFactor => pct(winRate('level', chapterFactor, bossFactor) * 100, 100).padStart(6))
    console.log(`  ${chapterFactor.toFixed(2)}  ${row.join('')}`)
  }
  for (const plan of ['weakness', 'noChampion'] as const) {
    console.log(`\nWin rate, ${PLAN_NAMES[plan]}`)
    for (const chapterFactor of chapterFactors) {
      const row = bossFactors.map(bossFactor => pct(winRate(plan, chapterFactor, bossFactor) * 100, 100).padStart(6))
      console.log(`  ${chapterFactor.toFixed(2)}  ${row.join('')}`)
    }
  }
  console.log('\nRerun with --chapter X --boss Y for the detailed report.')
} else {
  const chapterFactor = Number(values.chapter)
  const bossFactor = Number(values.boss)
  if (!(chapterFactor > 0 && bossFactor > 0)) throw new Error('--chapter and --boss must be positive numbers')
  console.log(`Chapter factor ${String(chapterFactor)}, boss factor ${String(bossFactor)}\n`)

  const rules = rulesFor(chapterFactor, bossFactor)
  const results = runs.map(run => ({ run, result: campaign(run, rules) }))
  const report = (label: string, rows: typeof results) => {
    const won = rows.filter(row => row.result.won)
    const lives = [0, 1, 2, 3].map(lost => rows.filter(row => row.result.livesLost === lost).length)
    console.log(
      `${label.padEnd(44)} win ${pct(won.length, rows.length).padStart(4)}   lives lost 0/1/2/3: ${lives.map(count => pct(count, rows.length)).join(' / ')}`
    )
  }
  console.log('By plan')
  for (const plan of PLANS) report(`  ${PLAN_NAMES[plan]}`, results.filter(row => row.run.plan === plan))
  const level = results.filter(row => row.run.plan === 'level')
  console.log('\nBy league size (Level plan)')
  for (const size of SHOWN_SIZES) report(`  ${String(size)} parties`, level.filter(row => row.run.size === size))

  console.log('\nWhere Level-plan leagues lost')
  const losses = level.filter(row => !row.result.won)
  for (let chapter = 1; chapter <= CHAPTERS; chapter++) {
    console.log(`  chapter ${String(chapter)}${chapter === CHAPTERS ? ' (boss)' : ''}: ${pct(losses.filter(row => row.result.lostAt === chapter).length, level.length)} of leagues`)
  }
  console.log('\nHow often each chapter is failed (Level plan)')
  for (let chapter = 1; chapter <= CHAPTERS; chapter++) {
    console.log(`  chapter ${String(chapter)}: ${pct(level.filter(row => row.result.failed.includes(chapter)).length, level.length)}`)
  }
  const reachedBoss = level.filter(row => row.result.lostAt === CHAPTERS || row.result.won)
  console.log(`\nBoss reached in ${pct(reachedBoss.length, level.length)}; average boss start week ${mean(reachedBoss.map(row => row.result.bossStart)).toFixed(1)} (window starts week 13)`)
  console.log(`Overkill felled a second monster the same week in ${pct(level.filter(row => row.result.cascades > 0).length, level.length)} of leagues`)

  console.log('\nWin rate by season (Level plan)')
  console.log(`  ${seasons.map(season => `${String(season)}: ${pct(level.filter(row => row.run.season === season && row.result.won).length, level.filter(row => row.run.season === season).length)}`).join('  ')}`)
}
