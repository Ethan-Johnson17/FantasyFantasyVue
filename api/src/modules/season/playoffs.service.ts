import mongoose from 'mongoose'
import { NotFound } from '../../lib/errors.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { loadVisibleLeague } from '../leagues/league.access.js'
import { byeSeeds, gameWinner, roundGames, roundName } from './bracket.js'
import { leaguePlayoffs, type LeaguePlayoffs } from './calendar.js'
import { computeStandings, type StandingView } from './season.service.js'
import { WeekResultModel } from './weekResult.model.js'

/*
 * The playoff bracket as the league sees it (docs/CLASSIC_SCORING.md, "Playoffs"): seeds from the regular-season
 * standings, each round's games with their totals and winners, and the champion once the final is played.
 * Until week 14 resolves the seeds are provisional, taken from the standings so far.
 */

const { trusted } = mongoose

type PartyRef = Pick<StandingView, 'partyId' | 'name' | 'crest'>

export interface SeedView extends PartyRef {
  seed: number
}

export interface BracketSideView extends SeedView {
  /** The party's total that week; null until the round is played */
  total: number | null
  /** Crossover: the Gridiron board's total (`total` is the Quest board); null in Classic and until played */
  gridiron: number | null
}

export interface BracketGameView {
  /** The higher seed, who advances on a draw */
  high: BracketSideView
  low: BracketSideView
  /** The party that advanced; null until the round is played */
  winner: string | null
}

export interface PlayoffRoundView {
  round: number
  week: number
  name: string
  /** Empty while the earlier rounds are still to be played */
  games: BracketGameView[]
  /** Top-6 brackets, round 1: the top two seeds rest */
  byes: SeedView[]
}

export interface PlayoffsView {
  format: LeaguePlayoffs
  /** The regular season isn't over, so the seeds can still change */
  provisional: boolean
  seeds: SeedView[]
  rounds: PlayoffRoundView[]
  champion: PartyRef | null
}

export async function getPlayoffs(viewer: AccountDocument, leagueId: string): Promise<PlayoffsView> {
  const league = await loadVisibleLeague(viewer, leagueId)
  const format = leaguePlayoffs(league)
  if (!format) throw new NotFound('This league has no playoffs: the best record wins')
  const [standings, results] = await Promise.all([
    computeStandings(league),
    WeekResultModel.find({ leagueId: league._id, week: trusted({ $gt: format.regularWeeks }) })
  ])
  const order = standings.map(row => row.partyId)
  const seedOf = (partyId: string): SeedView => {
    const index = order.indexOf(partyId)
    const row = standings[index]
    if (!row) throw new Error(`Party ${partyId} is not in the standings`)
    return { seed: index + 1, partyId: row.partyId, name: row.name, crest: row.crest }
  }
  const seeds = order.slice(0, format.spots).map(seedOf)
  const complete = seeds.length === format.spots

  const rounds: PlayoffRoundView[] = []
  const winners: string[][] = []
  for (let round = 1; round <= format.rounds; round++) {
    const week = format.regularWeeks + round
    const byes = complete ? byeSeeds(format, order, round).map(seedOf) : []
    // A round's games are known once every earlier round is played (and the bracket has its parties).
    const known = complete && winners.length === round - 1
    const result = results.find(entry => entry.week === week)
    const games = known
      ? roundGames(format, order, round, winners).map((game): BracketGameView => {
          const played = result?.matchups.find(matchup => matchup.kind === 'playoff' && matchup.home.partyId.toString() === game.high)
          return {
            high: { ...seedOf(game.high), total: played ? played.home.total : null, gridiron: played?.home.gridiron?.total ?? null },
            low: { ...seedOf(game.low), total: played?.away ? played.away.total : null, gridiron: played?.away?.gridiron?.total ?? null },
            winner: played ? gameWinner(game, played.outcome, played.gridironOutcome ?? null) : null
          }
        })
      : []
    if (games.length && games.every(game => game.winner)) winners.push(games.map(game => game.winner ?? ''))
    rounds.push({ round, week, name: roundName(format, round), games, byes })
  }

  const [championId] = winners.length === format.rounds ? (winners.at(-1) ?? []) : []
  const champion = championId ? seedOf(championId) : null
  return {
    format,
    provisional: league.resolvedWeeks < format.regularWeeks,
    seeds,
    rounds,
    champion: champion && { partyId: champion.partyId, name: champion.name, crest: champion.crest }
  }
}
