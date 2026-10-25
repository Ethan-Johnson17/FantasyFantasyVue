import mongoose from 'mongoose'
import { BadRequest, NotFound } from '../../lib/errors.js'
import { createRng } from '../../lib/random.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { toHeroView, type HeroView } from '../draft/draft.service.js'
import { HeroModel, type HeroDocument } from '../heroes/hero.model.js'
import { loadLeagueAsMember } from '../leagues/league.access.js'
import type { Crest } from '../leagues/crests.js'
import { LeagueModel } from '../leagues/league.model.js'
import { PartyModel, readLineup, type PartyDocument } from '../leagues/party.model.js'
import { getRuleset, type Ruleset } from '../scoring/rulesets.js'
import { monsterName } from './monsters.js'
import { NflGameModel } from '../stats/stats.models.js'
import { nflWeekOf, resolvesAt, seasonLength } from './calendar.js'
import { critOf } from './crits.js'
import { encounterFor, encounterMultiplier, type Encounter } from './encounters.js'
import type { HeroGame } from './nflWeeks.js'
import { computeStandings, heroPoints, nextWeek, restingHeroes, weekGames, type StandingView } from './season.service.js'
import { heroForm, type HeroForm } from './form.service.js'
import { applyStrategy, type Synergy } from './strategy.js'
import { WeekResultModel } from './weekResult.model.js'

const { trusted } = mongoose

/*
 * The head-to-head preview for one of a member's upcoming battles: both starting lineups as they
 * stand now, each Champion, the synergies each lineup would trigger, and earlier meetings. Who is
 * resting is shown for the next battle only: revealing rest weeks further ahead would help identify
 * the players behind heroes. Played weeks are results (GET /results/:week), not previews.
 */

/** Crossover, next battle only: a starter's real game this week. */
export interface LiveGameView {
  kickoff: Date
  /** The game has kicked off, so the player can't move */
  locked: boolean
  /** The game is over and imported: `points` won't change */
  final: boolean
  /** Fantasy points once final; null until then (the projection stands in) */
  points: number | null
}

export type MatchupHeroView = HeroView & { restingNextWeek: boolean; projected: number; game?: LiveGameView | null }

export interface MatchupSideView {
  partyId: string
  name: string
  crest: Crest
  record: { wins: number; losses: number; draws: number }
  starters: { slot: string; label: string; hero: MatchupHeroView | null }[]
  /** Crossover only: the heroes fighting the encounter (the Quest board); null in Classic */
  questParty: MatchupHeroView[] | null
  champion: string | null
  /**
   * Projected party total for this battle: starters who'll fight, with Champion and synergy bonuses. In Crossover
   * this is the Quest board, including the encounter's weaknesses and resistance.
   */
  projectedTotal: number
  /** Crossover only: projected Gridiron points (plain fantasy points); null in Classic */
  projectedGridiron: number | null
  /**
   * Crossover, next battle only: the game-day Quest total so far. Final games count their real damage (natural
   * 20s and 1s included), the rest their projection, with the same Champion and synergy math. Null otherwise.
   */
  liveTotal: number | null
  /** Crossover, next battle only: the game-day Gridiron total so far, on the same basis */
  liveGridiron: number | null
  /** Synergies this lineup would trigger if the battle resolved now */
  synergies: Synergy[]
}

export interface MatchupView {
  week: number
  resolvesAt: Date
  /** Whether restingNextWeek is known: only for the next battle */
  restingKnown: boolean
  me: MatchupSideView
  /** null when the viewer's party faces the dungeon monster this week */
  opponent: MatchupSideView | null
  monster: { name: string } | null
  /** Earlier battles between the two parties, oldest first */
  meetings: { week: number; myTotal: number; theirTotal: number; outcome: 'win' | 'loss' | 'draw' }[]
  /** Crossover, next battle only: how many of the NFL week's games are final ("4 of 7 games final") */
  games: { final: number; total: number } | null
  /** Crossover only: the week's encounter, known ahead so parties can plan for it */
  encounter: { name: string; weak: string[]; resists: string } | null
}

interface LiveWeek {
  games: ReadonlyMap<string, HeroGame | null>
  /** Real points for heroes whose game is final */
  points: ReadonlyMap<string, number>
}

/** A preview of an upcoming battle: the next one by default, or a later week. */
export async function getMatchup(member: AccountDocument, leagueId: string, requestedWeek?: number): Promise<MatchupView> {
  const { league, party } = await loadLeagueAsMember(member, leagueId)
  const upcoming = nextWeek(league)
  if (!upcoming) throw new NotFound('There is no upcoming battle')
  const week = requestedWeek ?? upcoming.week
  if (week < upcoming.week) throw new BadRequest('That battle has been played; see its result')
  if (week > seasonLength(league)) throw new BadRequest('That week is after the end of the season')
  const isNext = week === upcoming.week
  const at = resolvesAt(league, week)
  if (!at) throw new NotFound('There is no battle that week')
  const next = { week, at }
  const scheduled = league.schedule?.find(entry => entry.week === week)
  const matchup = scheduled?.matchups.find(m => m.home.equals(party._id) || m.away?.equals(party._id))
  if (!matchup) throw new NotFound('There is no battle that week')

  const opponentId = matchup.home.equals(party._id) ? matchup.away : matchup.home
  const [hidden, opponent, standings, results] = await Promise.all([
    LeagueModel.findById(league._id).select('+season +seed'),
    opponentId ? PartyModel.findById(opponentId) : null,
    computeStandings(league),
    WeekResultModel.find({ leagueId: league._id }).sort({ week: 1 })
  ])
  const season = hidden?.season
  if (season === undefined || season === null || !hidden?.seed) throw new Error(`League ${league.id} is missing season data`)

  const sides = opponent ? [party, opponent] : [party]
  const heroes = await HeroModel.find({ leagueId: league._id, partyId: trusted({ $in: sides.map(side => side._id) }) }).select('+source')
  const ruleset = getRuleset(league.rulesetVersion)
  const resting = isNext ? await restingHeroes(league, heroes, next.week) : new Set<string>()
  const form = await heroForm(league, heroes)
  // Crossover's game days: final games count for real; the rest show their kickoff and projection.
  let live: LiveWeek | null = null
  let games: MatchupView['games'] = null
  if (league.mode === 'crossover' && isNext) {
    const nflWeek = nflWeekOf(league, next.week)
    const heroGamesThisWeek = await weekGames(league, heroes, next.week)
    const finished = heroes.filter(hero => heroGamesThisWeek.get(hero.id)?.final)
    const scored = await heroPoints(finished, season, nflWeek, ruleset)
    live = { games: heroGamesThisWeek, points: new Map([...scored].map(([id, value]) => [id, value.points])) }
    const [final, total] = await Promise.all([
      NflGameModel.countDocuments({ season, seasonType: 'REG', week: nflWeek, homeScore: trusted({ $ne: null }) }),
      NflGameModel.countDocuments({ season, seasonType: 'REG', week: nflWeek })
    ])
    games = { final, total }
  }
  const encounter = ruleset.quest ? encounterFor(hidden.seed, next.week) : null
  const side = (subject: PartyDocument) => sideView(subject, heroes, resting, standings, ruleset, form, live, encounter)

  const meetings = opponent
    ? results.flatMap(result =>
        result.matchups.flatMap(played => {
          const pair = played.away ? [played.home, played.away] : []
          const mine = pair.find(entry => entry.partyId.equals(party._id))
          const theirs = pair.find(entry => entry.partyId.equals(opponent._id))
          if (!mine || !theirs) return []
          const won = (played.outcome === 'home') === played.home.partyId.equals(party._id)
          return [{ week: result.week, myTotal: mine.total, theirTotal: theirs.total, outcome: played.outcome === 'draw' ? ('draw' as const) : won ? ('win' as const) : ('loss' as const) }]
        })
      )
    : []

  return {
    week: next.week,
    resolvesAt: next.at,
    restingKnown: isNext,
    me: side(party),
    opponent: opponent ? side(opponent) : null,
    // The same name the battle will use: derived from the league seed and the week.
    monster: opponent ? null : { name: encounter?.name ?? monsterName(createRng(hidden.seed, `monster-${String(next.week)}`)) },
    meetings,
    games,
    encounter: encounter ? { name: encounter.name, weak: [...encounter.weak], resists: encounter.resists } : null
  }
}

function sideView(
  party: PartyDocument,
  heroes: readonly HeroDocument[],
  resting: ReadonlySet<string>,
  standings: readonly StandingView[],
  ruleset: Ruleset,
  form: ReadonlyMap<string, HeroForm>,
  live: LiveWeek | null = null,
  encounter: Encounter | null = null
): MatchupSideView {
  const lineup = readLineup(party.lineup) ?? {}
  const heroById = new Map(heroes.filter(hero => hero.partyId?.equals(party._id)).map(hero => [hero.id, hero]))
  const champion = party.champion?.toString() ?? null
  const viewOf = (hero: HeroDocument): MatchupHeroView => {
    const view = { ...toHeroView(hero), restingNextWeek: resting.has(hero.id), projected: form.get(hero.id)?.projected ?? 0 }
    if (!live) return view
    const game = live.games.get(hero.id) ?? null
    const liveGame = game && {
      kickoff: game.kickoff,
      locked: game.kickoff.getTime() <= Date.now(),
      final: game.final,
      // A final game with no stat line: the player sat out, so 0.
      points: game.final ? Math.round((live.points.get(hero.id) ?? 0) * 100) / 100 : null
    }
    return { ...view, game: liveGame }
  }
  const starters: MatchupSideView['starters'] = ruleset.lineup.slots.map(slot => {
    const hero = heroById.get(lineup[slot.key] ?? '')
    return { slot: slot.key, label: slot.label, hero: hero ? viewOf(hero) : null }
  })
  const questParty = ruleset.quest
    ? (party.questParty ?? []).flatMap(id => {
        const hero = heroById.get(id.toString())
        return hero ? [viewOf(hero)] : []
      })
    : null
  const quest = ruleset.quest && encounter ? { rules: ruleset.quest, encounter } : null
  const multiplierOf = (id: string) => {
    const heroClass = heroById.get(id)?.heroClass
    return heroClass ? ruleset.lineup.classMultipliers[heroClass] : 1
  }
  // One starter's damage on the Quest (or Classic's battle): class damage, plus Crossover's encounter modifier,
  // and once the game is final its natural 20 or 1.
  const battleDamage = (id: string, classDamage: number, finalPoints: number | null) => {
    const heroClass = heroById.get(id)?.heroClass
    if (!quest || !heroClass) return classDamage
    let damage = classDamage
    if (finalPoints !== null) {
      const crit = critOf({ slot: 'starter', points: finalPoints, resting: false }, heroClass, ruleset)
      if (crit === 'success') damage *= quest.rules.natural20Multiplier
      if (crit === 'fail') damage *= quest.rules.natural1Multiplier
    }
    return damage * encounterMultiplier(quest.encounter, heroClass, quest.rules)
  }
  const fightingStarters = starters.flatMap(({ hero }) => (hero && !hero.restingNextWeek ? [hero] : []))
  // Classic's battle is fought by the starters; Crossover's Quest by the Quest party.
  const fightingBattle = questParty ? questParty.filter(hero => !hero.restingNextWeek) : fightingStarters
  // The same strategy math as the battle: synergies and the projected total.
  const total = (finalPointsOf: (hero: MatchupHeroView) => number | null) =>
    applyStrategy(
      fightingBattle.map(hero => {
        const points = finalPointsOf(hero)
        const classDamage = points === null ? hero.projected : points * multiplierOf(hero.id)
        return { heroId: hero.id, traits: hero.traits, damage: battleDamage(hero.id, classDamage, points), isChampion: hero.id === champion }
      }),
      ruleset.strategy
    )
  const outcome = total(() => null)
  const liveTotal = live ? total(hero => hero.game?.points ?? null).total : null
  // Gridiron: plain points. A projection in points is the class-damage projection without the class multiplier.
  const gridiron = (finalPointsOf: (hero: MatchupHeroView) => number | null) =>
    fightingStarters.reduce((sum, hero) => sum + (finalPointsOf(hero) ?? hero.projected / multiplierOf(hero.id)), 0)
  const projectedGridiron = quest ? Math.round(gridiron(() => null)) : null
  const liveGridiron = quest && live ? Math.round(gridiron(hero => hero.game?.points ?? null)) : null
  const row = standings.find(standing => standing.partyId === party.id)
  return {
    partyId: party.id,
    name: party.name,
    crest: { emblem: party.crest.emblem, banner: party.crest.banner },
    record: { wins: row?.wins ?? 0, losses: row?.losses ?? 0, draws: row?.draws ?? 0 },
    starters,
    questParty,
    champion,
    projectedTotal: Math.round(outcome.total),
    projectedGridiron,
    liveTotal: liveTotal === null ? null : Math.round(liveTotal),
    liveGridiron,
    synergies: outcome.synergies
  }
}
