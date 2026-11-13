import { BadRequest, Conflict, NotFound } from '../../lib/errors.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { HeroModel } from '../heroes/hero.model.js'
import { inTransaction, loadLeagueAsMember, loadVisibleLeague } from '../leagues/league.access.js'
import { LeagueModel } from '../leagues/league.model.js'
import { PartyModel, readLineup } from '../leagues/party.model.js'
import { getRuleset } from '../scoring/rulesets.js'
import { getLineup, lockedThisWeek, readyWeekCount, type LineupView } from '../season/season.service.js'
import { repairParty, rosterProblem } from './repair.js'
import { RosterMoveModel, type ROSTER_MOVE_KINDS } from './rosterMove.model.js'
import { TradeModel } from '../trades/trade.model.js'

/*
 * Roster changes after the draft. Free agency: any undrafted (or dropped) hero can be claimed by
 * dropping one of your own, first come, first served. Rules: docs/CLASSIC_SCORING.md, "Free agency".
 */

/**
 * Claims a free agent for the viewer's party, dropping one of its heroes to make room, or into an open roster spot
 * (`dropHeroId` null) when the party is under its roster size after an uneven trade.
 */
export async function claimFreeAgent(
  member: AccountDocument,
  leagueId: string,
  heroId: string,
  dropHeroId: string | null
): Promise<LineupView> {
  const { league, party } = await loadLeagueAsMember(member, leagueId)
  if (league.mode === 'solo') throw new BadRequest('Solo runs have no free agency: swap heroes instead')
  if (league.status !== 'active') throw new Conflict('Free agents can be claimed after the draft and until the season ends')
  if (heroId === dropHeroId) throw new BadRequest('Choose a different hero to drop')
  const rules = getRuleset(league.rulesetVersion).lineup
  const ready = await readyWeekCount(league)
  if (dropHeroId === null && (await HeroModel.countDocuments({ leagueId: league._id, partyId: party._id })) >= rules.rosterSize) {
    throw new BadRequest('Your roster is full: choose a hero to drop')
  }
  if (dropHeroId !== null) {
    // Crossover: players whose game this week has kicked off (computed before the transaction; kickoffs don't move).
    const locked = await lockedThisWeek(league, await HeroModel.find({ leagueId: league._id, _id: dropHeroId }).select('+source'))
    const lineupBefore = readLineup(party.lineup) ?? {}
    const inQuestParty = (party.questParty ?? []).some(id => id.toString() === dropHeroId)
    if (locked.has(dropHeroId) && (Object.values(lineupBefore).includes(dropHeroId) || inQuestParty)) {
      throw new Conflict('That hero is in this week’s lineup and their game has kicked off; drop them after the week')
    }
  }

  await inTransaction(async session => {
    // Every due battle must already be resolved, so a claim never changes a week that is due. Writing
    // the league also makes this transaction conflict with a battle being resolved at the same moment.
    const upToDate = await LeagueModel.updateOne(
      { _id: league._id, status: 'active', resolvedWeeks: ready },
      { $set: { updatedAt: new Date() } },
      { session }
    )
    if (upToDate.modifiedCount === 0) throw new Conflict('A battle is being resolved. Try again in a moment.')

    const before = await HeroModel.find({ leagueId: league._id, partyId: party._id }).session(session)
    // Dynasty XP stays with the party that earned it: a hero who changes hands starts again (modules/dynasty/xp.ts).
    const dropped =
      dropHeroId === null
        ? null
        : await HeroModel.findOneAndUpdate(
            { _id: dropHeroId, leagueId: league._id, partyId: party._id },
            { $set: { partyId: null, xp: 0, earnedTrait: null } },
            { session }
          )
    if (dropHeroId !== null && !dropped) throw new BadRequest('You can only drop a hero from your own party')
    // First come, first served: only succeeds while the hero is still unclaimed.
    const claimed = await HeroModel.findOneAndUpdate(
      { _id: heroId, leagueId: league._id, partyId: null },
      { $set: { partyId: party._id, xp: 0, earnedTrait: null } },
      { session, new: true }
    )
    if (!claimed) {
      if (await HeroModel.exists({ _id: heroId, leagueId: league._id }).session(session)) {
        throw new Conflict('That hero is no longer a free agent')
      }
      throw new NotFound('That hero is not in this league')
    }

    const roster = await HeroModel.find({ leagueId: league._id, partyId: party._id }).session(session)
    const problem = rosterProblem(before.map(hero => hero.heroClass), roster.map(hero => hero.heroClass), rules, { mine: true })
    if (problem) throw new BadRequest(problem)
    await repairParty(league, rules, party._id, new Set(dropped ? [dropped.id] : []), [claimed.id], { mine: true }, session)
    await RosterMoveModel.create(
      [{ leagueId: league._id, partyId: party._id, kind: 'claim', added: claimed._id, dropped: dropped?._id ?? null, effectiveWeek: league.resolvedWeeks + 1 }],
      { session }
    )
  })
  return getLineup(member, leagueId)
}

interface MoveHero {
  heroId: string
  name: string
  heroClass: string
}

export interface ClaimMoveView {
  /** A free-agent claim, or a Solo swap */
  kind: (typeof ROSTER_MOVE_KINDS)[number]
  party: { partyId: string; name: string }
  added: MoveHero
  /** null: a claim into an open roster spot */
  dropped: MoveHero | null
  effectiveWeek: number
  at: Date
}

export interface TradeMoveView {
  kind: 'trade'
  /** Each side: the heroes it received, and any it released to free agency to make room */
  sides: { party: { partyId: string; name: string }; received: MoveHero[]; released: MoveHero[] }[]
  effectiveWeek: number
  at: Date
}

export type RosterMoveView = ClaimMoveView | TradeMoveView

/** Moves listed: the newest claims, swaps and accepted trades */
const MOVES_SHOWN = 50

/** The league's most recent roster moves, newest first: claims, Solo swaps and accepted trades. */
export async function listMoves(viewer: AccountDocument, leagueId: string): Promise<RosterMoveView[]> {
  const league = await loadVisibleLeague(viewer, leagueId)
  const [moves, trades, parties, heroes] = await Promise.all([
    RosterMoveModel.find({ leagueId: league._id }).sort({ createdAt: -1, _id: -1 }).limit(MOVES_SHOWN),
    TradeModel.find({ leagueId: league._id, status: 'accepted' }).sort({ answeredAt: -1, _id: -1 }).limit(MOVES_SHOWN),
    PartyModel.find({ leagueId: league._id }, 'name'),
    HeroModel.find({ leagueId: league._id }, 'name heroClass')
  ])
  const partyName = new Map(parties.map(party => [party.id, party.name]))
  const heroById = new Map(heroes.map(hero => [hero.id, hero]))
  const hero = (id: { toString(): string }): MoveHero => {
    const found = heroById.get(id.toString())
    return { heroId: id.toString(), name: found?.name ?? 'Unknown hero', heroClass: found?.heroClass ?? '' }
  }
  const party = (id: { toString(): string }) => ({ partyId: id.toString(), name: partyName.get(id.toString()) ?? 'Unknown' })
  const claims: RosterMoveView[] = moves.map(move => ({
    kind: move.kind,
    party: party(move.partyId),
    added: hero(move.added),
    dropped: move.dropped ? hero(move.dropped) : null,
    effectiveWeek: move.effectiveWeek,
    at: move.createdAt
  }))
  const traded: RosterMoveView[] = trades.map(trade => ({
    kind: 'trade',
    sides: [
      { party: party(trade.fromPartyId), received: trade.requested.map(hero), released: trade.fromReleases.map(hero) },
      { party: party(trade.toPartyId), received: trade.offered.map(hero), released: trade.toReleases.map(hero) }
    ],
    effectiveWeek: trade.effectiveWeek ?? 0,
    at: trade.answeredAt ?? trade.createdAt
  }))
  return [...claims, ...traded].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, MOVES_SHOWN)
}
