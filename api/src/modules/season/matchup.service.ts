import mongoose from 'mongoose'
import { NotFound } from '../../lib/errors.js'
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
import { computeStandings, heroPoints, nextWeek, type StandingView } from './season.service.js'
import { applyStrategy, type Synergy } from './strategy.js'
import { WeekResultModel } from './weekResult.model.js'

const { trusted } = mongoose

/*
 * The head-to-head preview for a member's next battle: both starting lineups as they stand now,
 * who is resting, each Champion, the synergies each lineup would trigger, and earlier meetings.
 */

export interface MatchupSideView {
  partyId: string
  name: string
  crest: Crest
  record: { wins: number; losses: number; draws: number }
  starters: { slot: string; label: string; hero: (HeroView & { restingNextWeek: boolean }) | null }[]
  champion: string | null
  /** Synergies this lineup would trigger if the battle resolved now */
  synergies: Synergy[]
}

export interface MatchupView {
  week: number
  resolvesAt: Date
  me: MatchupSideView
  /** null when the viewer's party faces the dungeon monster this week */
  opponent: MatchupSideView | null
  monster: { name: string } | null
  /** Earlier battles between the two parties, oldest first */
  meetings: { week: number; myTotal: number; theirTotal: number; outcome: 'win' | 'loss' | 'draw' }[]
}

export async function getMatchup(member: AccountDocument, leagueId: string): Promise<MatchupView> {
  const { league, party } = await loadLeagueAsMember(member, leagueId)
  const next = nextWeek(league)
  const scheduled = next && league.schedule?.find(entry => entry.week === next.week)
  const matchup = scheduled?.matchups.find(m => m.home.equals(party._id) || m.away?.equals(party._id))
  if (!next || !matchup) throw new NotFound('There is no upcoming battle')

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
  const points = await heroPoints(heroes, season, next.week, ruleset)
  const resting = new Set([...points].filter(([, value]) => value.resting).map(([id]) => id))
  const side = (subject: PartyDocument) => sideView(subject, heroes, resting, standings, ruleset)

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
    me: side(party),
    opponent: opponent ? side(opponent) : null,
    // The same name the battle will use: derived from the league seed and the week.
    monster: opponent ? null : { name: monsterName(createRng(hidden.seed, `monster-${String(next.week)}`)) },
    meetings
  }
}

function sideView(
  party: PartyDocument,
  heroes: readonly HeroDocument[],
  resting: ReadonlySet<string>,
  standings: readonly StandingView[],
  ruleset: Ruleset
): MatchupSideView {
  const lineup = readLineup(party.lineup) ?? {}
  const heroById = new Map(heroes.filter(hero => hero.partyId?.equals(party._id)).map(hero => [hero.id, hero]))
  const champion = party.champion?.toString() ?? null
  const starters = ruleset.lineup.slots.map(slot => {
    const hero = heroById.get(lineup[slot.key] ?? '')
    return { slot: slot.key, label: slot.label, hero: hero ? { ...toHeroView(hero), restingNextWeek: resting.has(hero.id) } : null }
  })
  // Damage doesn't matter for which synergies trigger, only who fights and who is Champion.
  const fighters = starters.flatMap(({ hero }) =>
    hero && !hero.restingNextWeek ? [{ heroId: hero.id, traits: hero.traits, damage: 0, isChampion: hero.id === champion }] : []
  )
  const row = standings.find(standing => standing.partyId === party.id)
  return {
    partyId: party.id,
    name: party.name,
    crest: { emblem: party.crest.emblem, banner: party.crest.banner },
    record: { wins: row?.wins ?? 0, losses: row?.losses ?? 0, draws: row?.draws ?? 0 },
    starters,
    champion,
    synergies: applyStrategy(fighters, ruleset.strategy).synergies
  }
}
