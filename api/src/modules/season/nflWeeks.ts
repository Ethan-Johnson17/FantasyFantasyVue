import mongoose from 'mongoose'
import { Conflict } from '../../lib/errors.js'
import type { HeroDocument } from '../heroes/hero.model.js'
import { easternTimeToUtc } from '../stats/nflverse.js'
import { currentNflSeason } from '../stats/seasons.js'
import { NflGameModel, PlayerWeekStatModel, StatsImportModel } from '../stats/stats.models.js'

const { trusted } = mongoose

/*
 * The real NFL calendar that Crossover leagues follow (docs/CROSSOVER_SPEC.md, "Calendar").
 */

/** Crossover plays through NFL week 17, so week 18's rested starters don't decide titles. */
export const LAST_CROSSOVER_WEEK = 17
/** A league needs at least this many weeks left when its draft runs. */
export const MIN_CROSSOVER_WEEKS = 4

/** The first regular-season week whose first kickoff is after `at`, or null if none is left. */
export async function firstWeekAfter(season: number, at: Date): Promise<number | null> {
  const weeks = await NflGameModel.aggregate<{ _id: number; firstKickoff: Date }>([
    { $match: { season, seasonType: 'REG' } },
    { $group: { _id: '$week', firstKickoff: { $min: '$kickoff' } } },
    { $sort: { _id: 1 } }
  ])
  return weeks.find(week => week.firstKickoff > at)?._id ?? null
}

export interface CrossoverWindow {
  season: number
  /** The league's first week: the first NFL week starting after the draft */
  firstWeek: number
}

/** The season and first week for a Crossover league drafting at `at`; refused when too little season is left. */
export async function crossoverWindow(at: Date): Promise<CrossoverWindow> {
  const season = currentNflSeason(at)
  if (!(await NflGameModel.exists({ season, seasonType: 'REG' }))) {
    throw new Conflict(`The ${String(season)} NFL schedule isn’t available yet, so Crossover leagues can’t start`)
  }
  const firstWeek = await firstWeekAfter(season, at)
  if (firstWeek === null || LAST_CROSSOVER_WEEK - firstWeek + 1 < MIN_CROSSOVER_WEEKS) {
    throw new Conflict(`Too little of the NFL season is left for a Crossover league; Classic plays any time`)
  }
  return { season, firstWeek }
}

const EASTERN_DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Weeks go final at this Eastern time on the Tuesday after their last game, once the data is in. */
export const FINAL_TIME_EASTERN = '06:00'

/** 6 AM Eastern on the first Tuesday after the day of a week's last kickoff (Monday night games included). */
export function weekFinalAt(lastKickoff: Date): Date {
  const parts = Object.fromEntries(EASTERN_DATE.formatToParts(lastKickoff).map(part => [part.type, part.value]))
  const weekday = WEEKDAYS.indexOf(parts.weekday ?? '')
  const daysToTuesday = (2 - weekday + 7) % 7 || 7
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + daysToTuesday))
  return easternTimeToUtc(date.toISOString().slice(0, 10), FINAL_TIME_EASTERN)
}

export interface CrossoverWeek {
  nflWeek: number
  finalAt: Date
}

/** The league's NFL weeks, from its first through week 17, each with when it goes final. */
export async function crossoverWeeks(season: number, firstWeek: number): Promise<CrossoverWeek[]> {
  const weeks = await NflGameModel.aggregate<{ _id: number; lastKickoff: Date }>([
    { $match: { season, seasonType: 'REG', week: trusted({ $gte: firstWeek, $lte: LAST_CROSSOVER_WEEK }) } },
    { $group: { _id: '$week', lastKickoff: { $max: '$kickoff' } } },
    { $sort: { _id: 1 } }
  ])
  return weeks.map(week => ({ nflWeek: week._id, finalAt: weekFinalAt(week.lastKickoff) }))
}

/** Every game of the NFL week is final, and the season was imported after the week's final time. */
export async function nflWeekReady(season: number, nflWeek: number, finalAt: Date): Promise<boolean> {
  const [unfinished, games, imported] = await Promise.all([
    NflGameModel.exists({ season, seasonType: 'REG', week: nflWeek, homeScore: null }),
    NflGameModel.exists({ season, seasonType: 'REG', week: nflWeek }),
    StatsImportModel.findById(season).lean()
  ])
  return !unfinished && !!games && !!imported && imported.importedAt >= finalAt
}

export interface HeroGame {
  gameId: string
  kickoff: Date
  /** The game is over, so the hero's points that week won't change */
  final: boolean
}

/**
 * Each hero's game in an NFL week, or null on a bye. A player's team is the one from their latest game this
 * season (so a trade counts once they've played for the new team), falling back to the team on their card.
 */
export async function heroGames(
  heroes: readonly HeroDocument[],
  season: number,
  nflWeek: number
): Promise<Map<string, HeroGame | null>> {
  const playerIds = heroes.filter(hero => hero.source.kind === 'player').map(hero => hero.source.id)
  const [games, latest] = await Promise.all([
    NflGameModel.find({ season, seasonType: 'REG', week: nflWeek }).lean(),
    PlayerWeekStatModel.aggregate<{ _id: string; team: string }>([
      { $match: { season, seasonType: 'REG', week: trusted({ $lte: nflWeek }), playerId: trusted({ $in: playerIds }) } },
      { $sort: { week: -1 } },
      { $group: { _id: '$playerId', team: { $first: '$team' } } }
    ])
  ])
  const teamOfPlayer = new Map(latest.map(entry => [entry._id, entry.team]))
  const gameOfTeam = new Map<string, HeroGame>()
  for (const game of games) {
    const entry = { gameId: game._id, kickoff: game.kickoff, final: game.homeScore !== null && game.awayScore !== null }
    gameOfTeam.set(game.homeTeam, entry)
    gameOfTeam.set(game.awayTeam, entry)
  }
  return new Map(
    heroes.map(hero => {
      const team = hero.source.kind === 'defense' ? hero.source.id : (teamOfPlayer.get(hero.source.id) ?? hero.player?.team)
      return [hero.id, (team && gameOfTeam.get(team)) || null]
    })
  )
}

/** Heroes whose game this NFL week has kicked off: they can't move in or out of the lineup until the week ends. */
export function lockedHeroes(games: ReadonlyMap<string, HeroGame | null>, now = Date.now()): Set<string> {
  return new Set([...games].filter(([, game]) => game && game.kickoff.getTime() <= now).map(([id]) => id))
}
