import mongoose from 'mongoose'
import { createRng } from '../../lib/random.js'
import { DraftRankingModel } from '../draft/ranking.model.js'
import { HeroModel } from '../heroes/hero.model.js'
import { toCrest, type Crest } from '../leagues/crests.js'
import { LeagueModel, type LeagueDocument } from '../leagues/league.model.js'
import { PartyModel, readLineup, type PartyDocument } from '../leagues/party.model.js'

import type { Outcome } from './battle.js'
import { monsterName } from './monsters.js'
import { nextWeek, restingHeroes } from './season.service.js'
import { WeekResultModel } from './weekResult.model.js'
import { getRuleset } from '../scoring/rulesets.js'
import { readMonsters, startCampaign, type CampaignOutcome } from './campaign.js'

/*
 * What a party needs to know at a glance on My leagues: the next battle, the last result, and
 * anything worth fixing before the lineup locks. Only facts the party could already see in the league.
 */

const { trusted } = mongoose

export interface PartyOutlook {
  /** While drafting: how much of the pool this party has ranked */
  ranking: { ranked: number; pool: number } | null
  /** While the season runs */
  nextBattle: {
    week: number
    at: Date
    /** null against the dungeon monster */
    opponent: { name: string; crest: Crest } | null
    monster: string | null
    /** No Champion named */
    noChampion: boolean
    /** Starters resting that week */
    restingStarters: number
  } | null
  lastBattle: { week: number; outcome: 'win' | 'loss' | 'draw'; myTotal: number; theirTotal: number; opponentName: string } | null
  /** Co-op only, once drafted: where the campaign stands, and this party's damage last week */
  campaign: {
    chapter: number
    monster: string
    hp: number
    hpLeft: number
    deadline: number
    livesLeft: number
    outcome: CampaignOutcome
    myLastWeek: number | null
  } | null
}

export async function partyOutlook(league: LeagueDocument, party: PartyDocument): Promise<PartyOutlook> {
  const coop = league.mode === 'coop'
  const [ranking, nextBattle, lastBattle, campaign] = await Promise.all([
    league.status === 'drafting' ? rankingProgress(league, party) : null,
    league.status === 'active' ? upcoming(league, party) : null,
    league.resolvedWeeks > 0 && !coop ? latestResult(league, party) : null,
    coop ? campaignOutlook(league, party) : null
  ])
  return { ranking, nextBattle, lastBattle, campaign }
}

async function campaignOutlook(league: LeagueDocument, party: PartyDocument): Promise<PartyOutlook['campaign']> {
  const ruleset = getRuleset(league.rulesetVersion)
  const monsters = readMonsters(league.campaign)
  if (!ruleset.coop || monsters.length === 0) return null
  const last = league.resolvedWeeks > 0 ? await WeekResultModel.findOne({ leagueId: league._id, week: league.resolvedWeeks }) : null
  const state = last?.campaign?.state ?? startCampaign(monsters, ruleset.coop)
  const monster = monsters[state.chapter - 1]
  if (!monster) return null
  const mine = last?.sides?.find(side => side.partyId.equals(party._id))
  return {
    chapter: state.chapter,
    monster: monster.name,
    hp: monster.hp,
    hpLeft: state.hpLeft,
    deadline: monster.deadline,
    livesLeft: state.livesLeft,
    outcome: state.outcome,
    myLastWeek: mine ? mine.total : null
  }
}

async function rankingProgress(league: LeagueDocument, party: PartyDocument) {
  const [ranking, pool] = await Promise.all([
    DraftRankingModel.findOne({ partyId: party._id }, 'heroIds'),
    HeroModel.countDocuments({ leagueId: league._id })
  ])
  return { ranked: ranking?.heroIds.length ?? 0, pool }
}

async function upcoming(league: LeagueDocument, party: PartyDocument): Promise<PartyOutlook['nextBattle']> {
  if (league.mode === 'coop') return upcomingCoop(league, party)
  const next = nextWeek(league)
  const matchup = next && league.schedule?.find(entry => entry.week === next.week)?.matchups.find(m => m.home.equals(party._id) || m.away?.equals(party._id))
  if (!next || !matchup) return null
  const opponentId = matchup.home.equals(party._id) ? matchup.away : matchup.home

  const lineup = Object.values(readLineup(party.lineup) ?? {})
  const [hidden, opponent, starters] = await Promise.all([
    LeagueModel.findById(league._id).select('+season +seed'),
    opponentId ? PartyModel.findById(opponentId, 'name crest') : null,
    HeroModel.find({ _id: trusted({ $in: lineup }), partyId: party._id }).select('+source')
  ])
  const resting = await restingHeroes(league, starters, next.week)
  return {
    week: next.week,
    at: next.at,
    opponent: opponent ? { name: opponent.name, crest: toCrest(opponent.crest) } : null,
    // The same name the battle will use.
    monster: !opponent && hidden?.seed ? monsterName(createRng(hidden.seed, `monster-${String(next.week)}`)) : null,
    noChampion: !party.champion,
    restingStarters: resting.size
  }
}

/** Co-op: every party's next battle is against the campaign's current monster. */
async function upcomingCoop(league: LeagueDocument, party: PartyDocument): Promise<PartyOutlook['nextBattle']> {
  const next = nextWeek(league)
  const outlook = await campaignOutlook(league, party)
  if (!next || outlook?.outcome !== 'ongoing') return null
  const lineup = Object.values(readLineup(party.lineup) ?? {})
  const starters = await HeroModel.find({ _id: trusted({ $in: lineup }), partyId: party._id }).select('+source')
  const resting = await restingHeroes(league, starters, next.week)
  return { week: next.week, at: next.at, opponent: null, monster: outlook.monster, noChampion: !party.champion, restingStarters: resting.size }
}

async function latestResult(league: LeagueDocument, party: PartyDocument): Promise<PartyOutlook['lastBattle']> {
  const result = await WeekResultModel.findOne({ leagueId: league._id }).sort({ week: -1 })
  const played = result?.matchups.find(m => m.home.partyId.equals(party._id) || m.away?.partyId.equals(party._id))
  if (!result || !played) return null
  const amHome = played.home.partyId.equals(party._id)
  const mine = amHome ? played.home : played.away
  if (!mine) return null
  const theirs = amHome ? played.away : played.home
  const opponent = theirs ? await PartyModel.findById(theirs.partyId, 'name') : null
  const outcome = (o: Outcome) => (o === 'draw' ? 'draw' : (o === 'home') === amHome ? 'win' : 'loss')
  return {
    week: result.week,
    outcome: outcome(played.outcome),
    myTotal: mine.total,
    theirTotal: theirs?.total ?? played.monster?.total ?? 0,
    opponentName: opponent?.name ?? played.monster?.name ?? 'Dungeon monster'
  }
}
