import mongoose from 'mongoose'
import { isDuplicateKeyError } from '../../db/mongoose.js'
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js'
import type { Rng } from '../../lib/random.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { loadPoolCandidates } from '../draft/candidates.js'
import type { DraftHero, DraftOptions } from '../draft/snakeDraft.js'
import { generateAppearances } from '../heroes/generator.js'
import { HeroModel, type HeroDocument } from '../heroes/hero.model.js'
import { expectedLevel, selectHeroPool, type HeroTrait, type PoolCandidate, type PoolEntry } from '../heroes/pool.js'
import { inTransaction, loadLeagueAsHost, loadLeagueAsMember } from '../leagues/league.access.js'
import { LeagueModel, type LeagueDocument } from '../leagues/league.model.js'
import { PartyModel, type PartyDocument } from '../leagues/party.model.js'
import { generatePin } from '../leagues/pin.js'
import { getRuleset, type Ruleset } from '../scoring/rulesets.js'
import { computeStandings } from '../season/season.service.js'
import { LAST_MATCHUP_WEEK } from '../draft/candidates.js'
import { DefenseWeekStatModel, PlayerWeekStatModel } from '../stats/stats.models.js'
import { WeekResultModel } from '../season/weekResult.model.js'
import { chooseEarnedTrait, TOP_XP_TIER, withEarnedTrait, xpTier, xpView, type XpView } from './xp.js'

/*
 * Dynasty: a Classic league that plays a chain of hidden seasons (docs/DYNASTY_SPEC.md). Each season is its own
 * league, linked to the one before; parties carry over, keep up to DYNASTY_KEEPERS heroes, and everyone else is
 * redrafted. Heroes follow their real players into the next real season, re-leveled from the season just played.
 */

const { trusted } = mongoose

export const DYNASTY_SEASONS = [3, 5] as const
export type DynastySeasons = (typeof DYNASTY_SEASONS)[number]
/** Heroes a party can keep from one season to the next; they use its first picks. */
export const DYNASTY_KEEPERS = 3
const PIN_ATTEMPTS = 5

/** A dynasty season after the first: its pool carries keepers, and its draft order follows last season. */
export function isLaterDynastySeason(league: Pick<LeagueDocument, 'dynasty'>): boolean {
  return !!league.dynasty && league.dynasty.number > 1
}

// ---------------------------------------------------------------------------
// The next season

/**
 * Opens the next season of a finished dynasty season: a new league in the same chain, with every party carried over
 * and the hidden season moved on a year. It starts forming, so parties can choose keepers before the host schedules
 * the draft. Only the host, and only once.
 */
export async function startNextSeason(host: AccountDocument, leagueId: string): Promise<string> {
  const previous = await loadLeagueAsHost(host, leagueId)
  const dynasty = previous.dynasty
  if (!dynasty) throw new BadRequest('Only dynasty leagues have a next season')
  if (previous.status !== 'complete') throw new Conflict('The next season starts once this one is over')
  if (dynasty.number >= dynasty.seasons) throw new Conflict('This was the dynasty’s last season')
  if (dynasty.nextId) throw new Conflict('The next season has already started')
  const season = (await LeagueModel.findById(previous._id).select('+season'))?.season
  if (season === undefined || season === null) throw new Error(`League ${previous.id} is missing its season`)

  for (let attempt = 1; ; attempt++) {
    try {
      return await inTransaction(async session => {
        const nextId = new mongoose.Types.ObjectId()
        // Claim the chain's next link first, so two requests can't both open a season.
        const claimed = await LeagueModel.updateOne(
          { _id: previous._id, status: 'complete', 'dynasty.nextId': null },
          { $set: { 'dynasty.nextId': nextId } },
          { session }
        )
        if (claimed.modifiedCount === 0) throw new Conflict('The next season has already started')
        const parties = await PartyModel.find({ leagueId: previous._id }).session(session)
        await LeagueModel.create(
          [
            {
              _id: nextId,
              name: previous.name,
              hostId: previous.hostId,
              visibility: previous.visibility,
              cadence: previous.cadence,
              maxParties: Math.max(previous.maxParties, parties.length),
              mode: 'classic',
              rulesetVersion: previous.rulesetVersion,
              partyCount: parties.length,
              pin: generatePin(),
              season: season + 1,
              dynasty: { seasons: dynasty.seasons, number: dynasty.number + 1, rootId: dynasty.rootId, previousId: previous._id, nextId: null }
            }
          ],
          { session }
        )
        await PartyModel.insertMany(
          parties.map(party => ({
            leagueId: nextId,
            accountId: party.accountId,
            name: party.name,
            crest: { emblem: party.crest.emblem, banner: party.crest.banner },
            autoSwap: party.autoSwap,
            previousPartyId: party._id,
            keepers: []
          })),
          { session }
        )
        return nextId.toString()
      })
    } catch (error) {
      // A random PIN can collide with an existing one; try another.
      if (isDuplicateKeyError(error, 'pin') && attempt < PIN_ATTEMPTS) continue
      throw error
    }
  }
}

// ---------------------------------------------------------------------------
// Keepers

export interface KeeperOption {
  /** Last season's hero */
  heroId: string
  name: string
  heroClass: string
  previousLevel: number | null
  /** The Level they'll have this season (re-leveled from the season just played); null if retired */
  level: number | null
  traits: HeroTrait[]
  /** No games this season: can't be kept */
  retired: boolean
  kept: boolean
  /** XP they'd carry into this season if kept: what they had plus the damage they dealt for you last season */
  xp: XpView
  /** Kept, they'd reach the top tier and earn this trait (or keep the one they earned before) */
  earnedTrait: HeroTrait | null
}

export interface KeepersView {
  limit: number
  /** Last season's roster, best new Level first */
  options: KeeperOption[]
}

/** The party's roster from last season, with each hero's new Level, so the member can choose keepers. */
export async function getKeepers(member: AccountDocument, leagueId: string): Promise<KeepersView> {
  const { league, party } = await loadLaterSeason(member, leagueId)
  const previousRoster = await previousHeroes(party)
  const relevel = await releveler(league, getRuleset(league.rulesetVersion))
  const carried = await carriedXp(previousRoster)
  const kept = new Set((party.keepers ?? []).map(String))
  const options = previousRoster.map(hero => {
    const next = relevel(hero)
    const xp = carried.get(hero.id) ?? 0
    const earnedTrait = next ? (hero.earnedTrait ?? (xpTier(xp) >= TOP_XP_TIER ? next.earnable : null)) : null
    return {
      heroId: hero.id,
      name: hero.name,
      heroClass: hero.heroClass,
      previousLevel: hero.level ?? null,
      level: next?.level ?? null,
      traits: next ? withEarnedTrait(next.traits, earnedTrait) : [],
      retired: !next,
      kept: kept.has(hero.id),
      xp: xpView(xp),
      earnedTrait
    }
  })
  options.sort((a, b) => (b.level ?? -1) - (a.level ?? -1) || a.name.localeCompare(b.name))
  return { limit: DYNASTY_KEEPERS, options }
}

/** Chooses up to DYNASTY_KEEPERS heroes from last season's roster to keep; allowed until the draft is scheduled. */
export async function setKeepers(member: AccountDocument, leagueId: string, heroIds: readonly string[]): Promise<KeepersView> {
  const { league, party } = await loadLaterSeason(member, leagueId)
  if (league.status !== 'forming') throw new Conflict('Keepers are locked once the draft is scheduled')
  const chosen = new Set(heroIds)
  if (chosen.size !== heroIds.length) throw new BadRequest('Each hero can be kept once')
  if (chosen.size > DYNASTY_KEEPERS) throw new BadRequest(`A party can keep at most ${String(DYNASTY_KEEPERS)} heroes`)
  const previousRoster = await previousHeroes(party)
  const heroes = [...chosen].map(id => previousRoster.find(hero => hero.id === id))
  if (heroes.some(hero => !hero)) throw new BadRequest('You can only keep heroes from your party’s roster last season')
  const ruleset = getRuleset(league.rulesetVersion)
  const relevel = await releveler(league, ruleset)
  const retired = heroes.find(hero => hero && !relevel(hero))
  if (retired) throw new BadRequest(`${retired.name} has retired and can’t be kept`)
  for (const [heroClass, limit] of Object.entries(ruleset.lineup.classLimits)) {
    if (heroes.filter(hero => hero?.heroClass === heroClass).length > limit) {
      throw new BadRequest(`A party can have at most ${String(limit)} ${heroClass}s`)
    }
  }
  await PartyModel.updateOne({ _id: party._id }, { $set: { keepers: [...chosen] } })
  return getKeepers(member, leagueId)
}

async function loadLaterSeason(member: AccountDocument, leagueId: string): Promise<{ league: LeagueDocument; party: PartyDocument }> {
  const loaded = await loadLeagueAsMember(member, leagueId)
  if (!isLaterDynastySeason(loaded.league)) throw new NotFound('Keepers are chosen between dynasty seasons')
  return loaded
}

/** The party's roster at the end of last season (empty for a party new to the dynasty). */
async function previousHeroes(party: PartyDocument): Promise<HeroDocument[]> {
  if (!party.previousPartyId) return []
  return HeroModel.find({ partyId: party.previousPartyId }).select('+source')
}

const sourceKey = (source: { kind: string; id: string }) => `${source.kind}|${source.id}`

/**
 * Re-levels heroes for this season, exactly as a Classic pool sets Levels: from the season just played, against the
 * rest of this season's pool. A hero who played this season but missed the pool (too few games last season) is
 * Level 1; one with no games this season has retired (null).
 */
async function releveler(
  league: LeagueDocument,
  ruleset: Ruleset
): Promise<(hero: HeroDocument) => (Pick<PoolEntry, 'level' | 'traits'> & { earnable: HeroTrait | null }) | null> {
  const season = (await LeagueModel.findById(league._id).select('+season'))?.season
  if (season === undefined || season === null) throw new Error(`League ${league.id} is missing its season`)
  const candidates = await loadPoolCandidates(season, ruleset)
  const candidateBySource = new Map(candidates.map(candidate => [sourceKey({ kind: candidate.sourceKind, id: candidate.sourceId }), candidate]))
  const pool = selectHeroPool(candidates, Math.max(2, league.partyCount), ruleset.pool)
  const bySource = new Map(pool.map(entry => [sourceKey({ kind: entry.sourceKind, id: entry.sourceId }), entry]))
  const [players, teams] = await Promise.all([
    PlayerWeekStatModel.distinct('playerId', { season, seasonType: 'REG', week: trusted({ $lte: LAST_MATCHUP_WEEK }) }),
    DefenseWeekStatModel.distinct('team', { season, seasonType: 'REG' })
  ])
  const playing = new Set([...players.map(id => `player|${id}`), ...teams.map(id => `defense|${id}`)])
  return hero => {
    const key = sourceKey(hero.source)
    const entry = bySource.get(key)
    const candidate = candidateBySource.get(key)
    const traits = entry?.traits ?? []
    // The trait they'd earn at the top XP tier, judged against their class this season.
    const earnable = chooseEarnedTrait({ heroClass: hero.heroClass, traits, ...pick(candidate) }, candidates)
    if (entry) return { level: entry.level ?? 1, traits, earnable }
    return playing.has(key) ? { level: 1, traits: [], earnable } : null
  }
}

const pick = (candidate: PoolCandidate | undefined) => ({
  ...(candidate?.volatility !== undefined ? { volatility: candidate.volatility } : {}),
  ...(candidate?.ceiling !== undefined ? { ceiling: candidate.ceiling } : {})
})

/**
 * XP each of last season's heroes would carry into this one: what they carried into last season plus the damage they
 * dealt for the party that ends the season with them (bench weeks count nothing).
 */
async function carriedXp(heroes: readonly HeroDocument[]): Promise<Map<string, number>> {
  const byLeague = new Map<string, HeroDocument[]>()
  for (const hero of heroes) byLeague.set(hero.leagueId.toString(), [...(byLeague.get(hero.leagueId.toString()) ?? []), hero])
  const result = new Map<string, number>()
  for (const [leagueId, members] of byLeague) {
    const partyOf = new Map(members.map(hero => [hero.id, hero.partyId?.toString() ?? null]))
    const earned = new Map<string, number>()
    for (const week of await WeekResultModel.find({ leagueId })) {
      for (const matchup of week.matchups) {
        for (const side of matchup.away ? [matchup.home, matchup.away] : [matchup.home]) {
          for (const line of side.heroes) {
            const id = line.heroId.toString()
            if (partyOf.get(id) === side.partyId.toString()) earned.set(id, (earned.get(id) ?? 0) + line.counted)
          }
        }
      }
    }
    for (const hero of members) result.set(hero.id, hero.xp + (earned.get(hero.id) ?? 0))
  }
  return result
}

// ---------------------------------------------------------------------------
// The pool and the draft

export interface DynastyPool {
  /** Heroes to draft, with new appearances */
  draftable: (PoolEntry & ReturnType<typeof generateAppearances>[number])[]
  /** Kept heroes as new hero documents for this season, already in their party */
  kept: Record<string, unknown>[]
}

/**
 * This season's pool for a later dynasty season: the usual Classic pool for the hidden season, minus every kept hero.
 * Kept heroes carry their name and look into the new season, re-leveled like everyone else.
 */
export async function buildDynastyPool(league: LeagueDocument, season: number, ruleset: Ruleset, rng: Rng): Promise<DynastyPool> {
  const parties = await PartyModel.find({ leagueId: league._id })
  const keptIds = parties.flatMap(party => (party.keepers ?? []).map(id => ({ heroId: id, partyId: party._id })))
  const keptHeroes = await HeroModel.find({ _id: trusted({ $in: keptIds.map(entry => entry.heroId) }) }).select('+source')
  const candidates = await loadPoolCandidates(season, ruleset)
  const candidateBySource = new Map(candidates.map(candidate => [sourceKey({ kind: candidate.sourceKind, id: candidate.sourceId }), candidate]))
  const pool = selectHeroPool(candidates, league.partyCount, ruleset.pool)
  const carried = await carriedXp(keptHeroes)
  const bySource = new Map(pool.map(entry => [sourceKey({ kind: entry.sourceKind, id: entry.sourceId }), entry]))
  const keptSources = new Set(keptHeroes.map(hero => sourceKey(hero.source)))

  const kept = keptIds.flatMap(({ heroId, partyId }) => {
    const hero = keptHeroes.find(entry => entry._id.equals(heroId))
    if (!hero) return []
    const entry = bySource.get(sourceKey(hero.source))
    const xp = carried.get(hero.id) ?? 0
    const traits = entry?.traits ?? []
    // Reaching the top XP tier earns one trait, kept for as long as the party keeps the hero.
    const earnedTrait =
      hero.earnedTrait ??
      (xpTier(xp) >= TOP_XP_TIER
        ? chooseEarnedTrait({ heroClass: hero.heroClass, traits, ...pick(candidateBySource.get(sourceKey(hero.source))) }, candidates)
        : null)
    return [
      {
        leagueId: league._id,
        partyId,
        heroClass: hero.heroClass,
        name: hero.name,
        race: hero.race,
        gender: hero.gender,
        weapon: hero.weapon,
        skill: hero.skill,
        attack: hero.attack,
        defense: hero.defense,
        magic: hero.magic,
        level: entry?.level ?? 1,
        levelRange: null,
        traits: withEarnedTrait(traits, earnedTrait),
        source: { kind: hero.source.kind, id: hero.source.id },
        previousHeroId: hero._id,
        xp,
        earnedTrait
      }
    ]
  })
  const draftable = generateAppearances(
    pool.filter(entry => !keptSources.has(sourceKey({ kind: entry.sourceKind, id: entry.sourceId }))),
    rng,
    keptHeroes.map(hero => hero.name)
  )
  return { draftable, kept }
}

/**
 * The draft for a later dynasty season: last season's reverse standings set the order (new parties first), and each
 * party's keepers fill its first picks.
 */
export async function dynastyDraftOptions(
  league: LeagueDocument,
  parties: readonly PartyDocument[],
  heroes: readonly HeroDocument[]
): Promise<DraftOptions> {
  const previous = league.dynasty?.previousId ? await LeagueModel.findById(league.dynasty.previousId) : null
  const standings = previous ? await computeStandings(previous) : []
  const rankOf = new Map(standings.map((row, index) => [row.partyId, index]))
  // Worst first; parties new to the dynasty count as last place.
  const rank = (party: PartyDocument) => (party.previousPartyId ? (rankOf.get(party.previousPartyId.toString()) ?? -1) : Infinity)
  const order = [...parties].sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id)).map(party => party.id)
  const keepers = new Map<string, DraftHero[]>()
  for (const hero of heroes) {
    if (!hero.partyId) continue
    const list = keepers.get(hero.partyId.toString()) ?? []
    list.push({ id: hero.id, heroClass: hero.heroClass, value: expectedLevel(hero) })
    keepers.set(hero.partyId.toString(), list)
  }
  for (const list of keepers.values()) list.sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
  return { order, keepers }
}
