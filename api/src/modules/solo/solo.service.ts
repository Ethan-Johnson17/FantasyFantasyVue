import mongoose from 'mongoose'
import { isDuplicateKeyError } from '../../db/mongoose.js'
import { BadRequest, Conflict } from '../../lib/errors.js'
import { createRng, newSeed } from '../../lib/random.js'
import { AccountModel, type AccountDocument } from '../accounts/account.model.js'
import { loadCrossoverCandidates } from '../draft/crossoverCandidates.js'
import { toHeroView, type HeroView } from '../draft/draft.service.js'
import { generateAppearances } from '../heroes/generator.js'
import { HeroModel, type HeroDocument } from '../heroes/hero.model.js'
import { selectHeroPool } from '../heroes/pool.js'
import { inTransaction, loadLeagueAsMember } from '../leagues/league.access.js'
import { LeagueModel, SOLO_PARTIES, type LeagueDocument } from '../leagues/league.model.js'
import type { PartyInput } from '../leagues/league.schemas.js'
import { PartyModel } from '../leagues/party.model.js'
import { generatePin } from '../leagues/pin.js'
import { RosterMoveModel } from '../roster/rosterMove.model.js'
import { getRuleset, RULESET_FOR_MODE, type Ruleset, type SoloRules } from '../scoring/rulesets.js'
import { heroForm } from '../season/form.service.js'
import { crossoverWeeks, firstWeekAfter, latestFinalWeek } from '../season/nflWeeks.js'
import { lockedThisWeek, nextWeek, readyWeekCount, weekGames } from '../season/season.service.js'
import { currentNflSeason } from '../stats/seasons.js'
import { NflGameModel } from '../stats/stats.models.js'
import { bestParty, soloCost, soloEncounters, soloMonsters, soloWindows } from './soloRules.js'

/*
 * Solo runs (docs/SOLO_SPEC.md): one private party, bought under a budget from the whole current-season pool, against
 * a campaign scaled to the weeks left. A run is a league of one: it reuses the league's calendar, week results,
 * campaign board and finale. It has a PIN only because every league does; the PIN is never shown or accepted.
 */

const { trusted } = mongoose
const PIN_ATTEMPTS = 5
const RUN_NAME = 'Solo run'
const IN_PROGRESS = ['forming', 'active'] as const

export interface SoloOptions {
  /** Solo runs can be started only once the mode is finished (SOLO_ENABLED) */
  soloEnabled: boolean
}

const soloRuleset = (): Ruleset & { solo: SoloRules } => {
  const ruleset = getRuleset(RULESET_FOR_MODE.solo)
  if (!ruleset.solo) throw new Error('The Solo ruleset has no Solo rules')
  return { ...ruleset, solo: ruleset.solo }
}

const rulesOf = (league: Pick<LeagueDocument, 'mode' | 'rulesetVersion'>): Ruleset & { solo: SoloRules } => {
  const ruleset = getRuleset(league.rulesetVersion)
  if (league.mode !== 'solo' || !ruleset.solo) throw new BadRequest('This is not a Solo run')
  return { ...ruleset, solo: ruleset.solo }
}

/**
 * The rules a run plays by. A run still being built moves to the ruleset new runs start with, so a new budget reaches
 * it: nothing has been paid yet. Confirmed runs keep the ruleset they were confirmed with.
 */
async function soloRulesFor(league: LeagueDocument): Promise<Ruleset & { solo: SoloRules }> {
  const current = RULESET_FOR_MODE.solo
  if (league.mode !== 'solo' || league.status !== 'forming' || league.rulesetVersion === current) return rulesOf(league)
  // A league's ruleset is otherwise immutable; this is the one move it makes, before anything is played or paid.
  const moved = await LeagueModel.updateOne(
    { _id: league._id, status: 'forming' },
    { $set: { rulesetVersion: current } },
    { overwriteImmutable: true }
  )
  // The loaded document keeps its old value (immutable), so the rules are passed on rather than read from it again.
  return rulesOf({ mode: league.mode, rulesetVersion: moved.modifiedCount > 0 ? current : league.rulesetVersion })
}

export interface SoloStart {
  season: number
  /** The run's first NFL week: the first one kicking off after `at` */
  firstWeek: number
  /** Game weeks, from firstWeek through the last week */
  weeks: number
  /** The latest NFL week gone final: what the pool reflects */
  poolWeek: number
}

/**
 * When a run confirmed at `at` would start, or why it can't: the pool needs a final week, and the run needs
 * rules.minWeeks through rules.lastWeek.
 */
export async function soloStart(at: Date, rules: SoloRules): Promise<SoloStart> {
  const season = currentNflSeason(at)
  if (!(await NflGameModel.exists({ season, seasonType: 'REG' }))) {
    throw new Conflict(`The ${String(season)} NFL schedule isn’t available yet, so Solo runs can’t start`)
  }
  const [firstWeek, poolWeek] = await Promise.all([firstWeekAfter(season, at), latestFinalWeek(season, rules.lastWeek, at)])
  const lastStart = rules.lastWeek - rules.minWeeks + 1
  if (firstWeek === null || firstWeek > lastStart) {
    throw new Conflict(
      `Too little of the NFL season is left: Solo runs start by NFL week ${String(lastStart)}, so they open again next season`
    )
  }
  if (firstWeek < rules.firstWeek || poolWeek === null) {
    throw new Conflict('Solo opens once NFL week 1 has gone final: heroes are bought from players who have played')
  }
  return { season, firstWeek, weeks: rules.lastWeek - firstWeek + 1, poolWeek }
}

/**
 * Starts a Solo run for the account: one at a time, so it's refused while another is being built or played. The pool
 * is filled in when the run is first opened (refreshSoloPool), and nothing is played until the party is confirmed.
 * Returns the new run's id.
 */
export async function startRun(account: AccountDocument, party: PartyInput, options: SoloOptions): Promise<string> {
  if (!options.soloEnabled) throw new Conflict('Solo runs aren’t available yet')
  const ruleset = soloRuleset()
  const { season } = await soloStart(new Date(), ruleset.solo)
  for (let attempt = 1; ; attempt++) {
    try {
      return await inTransaction(async session => {
        // Writing the account makes two starts at once conflict, so only one can pass the check below.
        await AccountModel.updateOne({ _id: account._id }, { $set: { updatedAt: new Date() } }, { session })
        const running = await LeagueModel.exists({ hostId: account._id, mode: 'solo', status: trusted({ $in: IN_PROGRESS }) }).session(session)
        if (running) throw new Conflict('You already have a Solo run in progress: finish or abandon it first')
        const [league] = await LeagueModel.create(
          [
            {
              name: RUN_NAME,
              mode: 'solo',
              visibility: 'private',
              cadence: 'weekly',
              playoffs: false,
              maxParties: SOLO_PARTIES,
              partyCount: SOLO_PARTIES,
              rulesetVersion: ruleset.version,
              hostId: account._id,
              pin: generatePin(),
              season,
              seed: newSeed(),
              solo: { poolWeek: 0, abandoned: false }
            }
          ],
          { session }
        )
        if (!league) throw new Error('The run was not created')
        await PartyModel.create([{ ...party, leagueId: league._id, accountId: account._id, autoSwap: false }], { session })
        return league.id
      })
    } catch (error) {
      // A random PIN can collide with an existing one; pick another.
      if (isDuplicateKeyError(error, 'pin') && attempt < PIN_ATTEMPTS) continue
      throw error
    }
  }
}

/**
 * Brings a run's pool up to the latest final NFL week: every current-season player and defense who has played, with
 * Levels as deciles of each class and traits from last season. Players new to the pool get heroes; heroes already in
 * it keep their names and looks, and only their Level, traits and team move. Prices paid don't change. Safe to call
 * often and concurrently: only one caller refreshes each week.
 */
export async function refreshSoloPool(leagueId: string): Promise<void> {
  const league = await LeagueModel.findById(leagueId).select('+season +seed')
  if (league?.mode !== 'solo' || !league.solo || !IN_PROGRESS.some(status => status === league.status)) return
  const { season, seed } = league
  if (season === undefined || season === null || !seed) throw new Error(`Run ${league.id} has no season`)
  const ruleset = rulesOf(league)
  const latest = await latestFinalWeek(season, ruleset.solo.lastWeek)
  const before = league.solo.poolWeek
  if (latest === null || latest <= before) return

  const { candidates, cards } = await loadCrossoverCandidates(season, ruleset, latest)
  const entries = selectHeroPool(candidates, SOLO_PARTIES, ruleset.pool)
  await inTransaction(async session => {
    const claim = await LeagueModel.updateOne({ _id: league._id, 'solo.poolWeek': before }, { $set: { 'solo.poolWeek': latest } }, { session })
    if (claim.modifiedCount === 0) return // another request refreshed it
    const existing = await HeroModel.find({ leagueId: league._id }).select('+source').session(session)
    const bySource = new Map(existing.map(hero => [`${hero.source.kind}:${hero.source.id}`, hero]))
    const card = (id: string) => cards.get(id) ?? null
    const known = entries.filter(entry => bySource.has(`${entry.sourceKind}:${entry.sourceId}`))
    const fresh = entries.filter(entry => !bySource.has(`${entry.sourceKind}:${entry.sourceId}`))
    if (known.length) {
      await HeroModel.bulkWrite(
        known.map(entry => ({
          updateOne: {
            filter: { _id: bySource.get(`${entry.sourceKind}:${entry.sourceId}`)?._id },
            update: { $set: { level: entry.level, traits: entry.traits, player: card(entry.sourceId) } }
          }
        })),
        { session }
      )
    }
    if (fresh.length) {
      const looks = generateAppearances(fresh, createRng(seed, `pool-${String(latest)}`), existing.map(hero => hero.name))
      await HeroModel.insertMany(
        looks.map(({ sourceKind, sourceId, ...hero }) => ({
          ...hero,
          leagueId: league._id,
          source: { kind: sourceKind, id: sourceId },
          player: card(sourceId)
        })),
        { session }
      )
    }
  })
}

export type SoloHeroView = HeroView & {
  /** The price to sign the hero now, by Level */
  cost: number
  /** What the run paid, for heroes in the party */
  price: number | null
  /** Projected class damage for the next game, as on the lineup */
  projected: number
  /** The hero's game in the run's next week (null on a bye or before the run starts), and whether it's kicked off */
  kickoff: Date | null
  locked: boolean
}

export interface SoloView {
  status: string
  /** The party is confirmed and the campaign under way (or over) */
  confirmed: boolean
  rosterSize: number
  partySize: number
  cap: number
  /** Gold by Level, Level 1 first */
  costs: number[]
  /** Most team defenses (Paladins) in the party */
  paladinLimit: number
  /** The prices paid for the party, added up */
  spent: number
  swapsPerWeek: number
  /** Swaps left this NFL week, while the run is being played */
  swapsLeft: number | null
  /** The latest final NFL week the Levels reflect */
  poolWeek: number | null
  /**
   * Before confirming: when the run would start if confirmed now and each monster's window in weeks, or why it can't
   * start now
   */
  start: { firstWeek: number; weeks: number; windows: number[] } | null
  startProblem: string | null
  /** The campaign's monsters in order, with their weaknesses (HP is set when the party is confirmed) */
  monsters: { name: string; weak: string[]; resists: string; boss: boolean }[]
  /** The whole pool, the party first, then by Level */
  pool: SoloHeroView[]
}

/** The run's market and budget: for building the party, and for swaps once it's confirmed. Only the run's owner. */
export async function getSolo(viewer: AccountDocument, leagueId: string): Promise<SoloView> {
  const { league, party } = await loadLeagueAsMember(viewer, leagueId)
  const { solo, lineup, quest } = await soloRulesFor(league)
  const seed = (await LeagueModel.findById(league._id).select('+seed'))?.seed
  if (!seed) throw new Error(`Run ${league.id} has no seed`)
  const heroes = await HeroModel.find({ leagueId: league._id }).select('+source')
  const confirmed = (league.campaign?.monsters.length ?? 0) > 0
  const next = nextWeek(league)
  const [form, games, swapsUsed] = await Promise.all([
    heroForm(league, heroes),
    next ? weekGames(league, heroes, next.week) : new Map<string, null>(),
    next ? RosterMoveModel.countDocuments({ leagueId: league._id, kind: 'swap', effectiveWeek: next.week }) : 0
  ])
  let start: SoloView['start'] = null
  let startProblem: string | null = null
  if (league.status === 'forming') {
    try {
      const when = await soloStart(new Date(), solo)
      start = { firstWeek: when.firstWeek, weeks: when.weeks, windows: soloWindows(when.weeks, solo.chapters) }
    } catch (error) {
      if (!(error instanceof Conflict)) throw error
      startProblem = error.message
    }
  }
  const now = Date.now()
  const mine = (hero: HeroDocument) => hero.partyId?.equals(party._id) ?? false
  const view = (hero: HeroDocument): SoloHeroView => {
    const game = games.get(hero.id) ?? null
    return {
      ...toHeroView(hero),
      cost: soloCost(hero.level ?? 1, solo.costs),
      price: mine(hero) ? (hero.price ?? null) : null,
      projected: form.get(hero.id)?.projected ?? 0,
      kickoff: game?.kickoff ?? null,
      locked: !!game && game.kickoff.getTime() <= now
    }
  }
  const monsters = confirmed
    ? (league.campaign?.monsters ?? []).map(monster => ({ name: monster.name, weak: [...monster.weak], resists: monster.resists, boss: monster.boss }))
    : soloEncounters(seed, solo.chapters).map(monster => ({ ...monster, weak: [...monster.weak] }))
  return {
    status: league.status,
    confirmed,
    rosterSize: lineup.rosterSize,
    partySize: quest?.partySize ?? 0,
    cap: solo.cap,
    costs: [...solo.costs],
    paladinLimit: lineup.classLimits.Paladin ?? lineup.rosterSize,
    spent: heroes.filter(mine).reduce((sum, hero) => sum + (hero.price ?? 0), 0),
    swapsPerWeek: solo.swapsPerWeek,
    swapsLeft: next && confirmed ? Math.max(0, solo.swapsPerWeek - swapsUsed) : null,
    // 0 until the pool is first filled
    poolWeek: league.solo?.poolWeek ? league.solo.poolWeek : null,
    start,
    startProblem,
    monsters,
    pool: heroes
      .map(view)
      .sort((a, b) => Number(b.partyId !== null) - Number(a.partyId !== null) || (b.level ?? 0) - (a.level ?? 0) || b.projected - a.projected || a.name.localeCompare(b.name))
  }
}

export interface ConfirmInput {
  heroIds: readonly string[]
  questParty: readonly string[]
  champion: string | null
}

/**
 * Confirms the party (docs/SOLO_SPEC.md, "Starting a run"): 8 heroes under the cap at today's prices, a Quest party of
 * 5 and a Champion from it. The campaign starts with the first NFL week kicking off afterwards; its monsters' HP comes
 * from the best party the cap could buy from this week's pool, so every run starting the same week faces the same
 * strength.
 */
export async function confirmRun(viewer: AccountDocument, leagueId: string, input: ConfirmInput): Promise<void> {
  const { league, party } = await loadLeagueAsMember(viewer, leagueId)
  const ruleset = await soloRulesFor(league)
  const { solo, lineup, quest } = ruleset
  if (league.status !== 'forming') throw new Conflict('This run’s party is already confirmed')
  const size = quest?.partySize ?? 0
  const heroIds = new Set(input.heroIds)
  const questParty = new Set(input.questParty)
  if (heroIds.size !== input.heroIds.length || heroIds.size !== lineup.rosterSize) {
    throw new BadRequest(`Pick ${String(lineup.rosterSize)} different heroes`)
  }
  if (questParty.size !== input.questParty.length || questParty.size !== size || [...questParty].some(id => !heroIds.has(id))) {
    throw new BadRequest(`Pick a Quest party of ${String(size)} from your heroes`)
  }
  if (input.champion !== null && !questParty.has(input.champion)) throw new BadRequest('Your Champion must be in your Quest party')

  // Today's prices and the strength the monsters are set against both come from the latest final week.
  await refreshSoloPool(league.id)
  const when = await soloStart(new Date(), solo)
  const stored = await LeagueModel.findById(league._id).select('+season +seed')
  if (!stored?.seed || stored.season === undefined || stored.season === null) throw new Error(`Run ${league.id} has no season`)
  if (stored.season !== when.season) throw new Conflict('This run was started last season; start a new one')
  const pool = await HeroModel.find({ leagueId: league._id }).select('+source')
  const picked = pool.filter(hero => heroIds.has(hero.id))
  if (picked.length !== heroIds.size) throw new BadRequest('Pick heroes from this run’s pool')
  const paladins = lineup.classLimits.Paladin
  if (paladins !== undefined && picked.filter(hero => hero.heroClass === 'Paladin').length > paladins) {
    throw new BadRequest(`A party can have at most ${String(paladins)} Paladins`)
  }
  const price = (hero: HeroDocument) => soloCost(hero.level ?? 1, solo.costs)
  const total = picked.reduce((sum, hero) => sum + price(hero), 0)
  if (total > solo.cap) throw new BadRequest(`Your party costs ${String(total)} gold; the cap is ${String(solo.cap)}`)

  const values = await poolValues(stored.season, ruleset, stored.solo?.poolWeek ?? when.poolWeek)
  const best = bestParty(
    pool.map(hero => ({ id: hero.id, heroClass: hero.heroClass, cost: price(hero), value: values.get(`${hero.source.kind}:${hero.source.id}`) ?? 0 })),
    solo.cap,
    { fighters: size, bench: lineup.rosterSize - size, paladins: paladins ?? lineup.rosterSize },
    solo.benchWeight
  )
  const nflWeeks = await crossoverWeeks(when.season, when.firstWeek)
  const monsters = soloMonsters(stored.seed, nflWeeks.length, best.projected, solo)

  await inTransaction(async session => {
    const claimed = await LeagueModel.updateOne(
      { _id: league._id, status: 'forming' },
      { $set: { status: 'active', nflWeeks, weekOneAt: nflWeeks[0]?.finalAt, campaign: { monsters } } },
      { session }
    )
    if (claimed.modifiedCount === 0) throw new Conflict('This run’s party is already confirmed')
    await HeroModel.bulkWrite(
      picked.map(hero => ({ updateOne: { filter: { _id: hero._id, partyId: null }, update: { $set: { partyId: party._id, price: price(hero) } } } })),
      { session }
    )
    await PartyModel.updateOne({ _id: party._id }, { $set: { questParty: [...questParty], champion: input.champion } }, { session })
  })
}

/** Each pool player's projected class damage per game, by source, from Crossover's ranking blend. */
async function poolValues(season: number, ruleset: Ruleset, throughWeek: number): Promise<Map<string, number>> {
  const { candidates } = await loadCrossoverCandidates(season, ruleset, throughWeek)
  return new Map(
    candidates.map(candidate => [`${candidate.sourceKind}:${candidate.sourceId}`, (candidate.ppg ?? 0) * ruleset.lineup.classMultipliers[candidate.heroClass]])
  )
}

/**
 * A swap (docs/SOLO_SPEC.md, "Lineup, swaps and locks"): releases one of the party's heroes and signs one from the
 * pool at today's price, if the party stays under the cap at the prices paid. Up to swapsPerWeek per NFL week; a hero
 * whose game has kicked off can't be released or signed. The signed hero takes the released hero's place in the
 * Quest party; releasing the Champion leaves the party without one until another is named.
 */
export async function swapHero(viewer: AccountDocument, leagueId: string, releaseId: string, signId: string): Promise<void> {
  const { league, party } = await loadLeagueAsMember(viewer, leagueId)
  const { solo, lineup } = rulesOf(league)
  const next = nextWeek(league)
  if (league.status !== 'active' || !next) throw new Conflict('Swaps can be made once your party is confirmed and until the run ends')
  if (releaseId === signId) throw new BadRequest('Choose a different hero to sign')
  const ready = await readyWeekCount(league)
  const pair = await HeroModel.find({ leagueId: league._id, _id: trusted({ $in: [releaseId, signId] }) }).select('+source')
  const locked = await lockedThisWeek(league, pair)
  const lockedHero = pair.find(hero => locked.has(hero.id))
  if (lockedHero) throw new Conflict(`${lockedHero.name} is locked: their game has kicked off`)

  await inTransaction(async session => {
    // Every due week must already be resolved, so a swap never changes a week that is due. Writing the run also makes
    // two swaps at once conflict, so the count below can't be passed twice.
    const upToDate = await LeagueModel.updateOne(
      { _id: league._id, status: 'active', resolvedWeeks: ready },
      { $set: { updatedAt: new Date() } },
      { session }
    )
    if (upToDate.modifiedCount === 0) throw new Conflict('A week is being resolved. Try again in a moment.')
    const used = await RosterMoveModel.countDocuments({ leagueId: league._id, kind: 'swap', effectiveWeek: next.week }).session(session)
    if (used >= solo.swapsPerWeek) throw new Conflict(`You’ve used this week’s ${String(solo.swapsPerWeek)} swaps; more open when the week goes final`)

    const released = await HeroModel.findOneAndUpdate(
      { _id: releaseId, leagueId: league._id, partyId: party._id },
      { $set: { partyId: null, price: null } },
      { session }
    )
    if (!released) throw new BadRequest('You can only release a hero from your party')
    const signing = await HeroModel.findOne({ _id: signId, leagueId: league._id, partyId: null }).session(session)
    if (!signing) throw new BadRequest('Sign a hero from the pool who isn’t in your party')
    const cost = soloCost(signing.level ?? 1, solo.costs)
    await HeroModel.updateOne({ _id: signing._id }, { $set: { partyId: party._id, price: cost } }, { session })

    const roster = await HeroModel.find({ leagueId: league._id, partyId: party._id }).session(session)
    const spent = roster.reduce((sum, hero) => sum + (hero.price ?? 0), 0)
    if (spent > solo.cap) throw new BadRequest(`That swap would cost ${String(spent)} gold of your ${String(solo.cap)}`)
    const limit = lineup.classLimits[signing.heroClass]
    if (limit !== undefined && roster.filter(hero => hero.heroClass === signing.heroClass).length > limit) {
      throw new BadRequest(`A party can have at most ${String(limit)} ${signing.heroClass}s`)
    }

    const current = await PartyModel.findById(party._id).session(session)
    const questParty = (current?.questParty ?? []).map(id => (id.equals(released._id) ? signing._id : id))
    const championReleased = current?.champion?.equals(released._id) ?? false
    await PartyModel.updateOne({ _id: party._id }, { $set: { questParty, ...(championReleased ? { champion: null } : {}) } }, { session })
    await RosterMoveModel.create(
      [{ leagueId: league._id, partyId: party._id, kind: 'swap', added: signing._id, dropped: released._id, effectiveWeek: next.week }],
      { session }
    )
  })
}
