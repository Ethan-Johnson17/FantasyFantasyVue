import { BadRequest, Conflict, NotFound } from '../../lib/errors.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { HeroModel } from '../heroes/hero.model.js'
import { autoLineup, maxFillableSlots } from '../heroes/lineup.js'
import { expectedLevel } from '../heroes/pool.js'
import { inTransaction, loadLeagueAsMember, loadVisibleLeague } from '../leagues/league.access.js'
import { LeagueModel } from '../leagues/league.model.js'
import { PartyModel, readLineup, storedLineup } from '../leagues/party.model.js'
import { getRuleset } from '../scoring/rulesets.js'
import { dueWeekCount, getLineup, type LineupView } from '../season/season.service.js'
import { RosterMoveModel } from './rosterMove.model.js'

/*
 * Roster changes after the draft. Free agency: any undrafted (or dropped) hero can be claimed by
 * dropping one of your own, first come, first served. Rules: docs/CLASSIC_SCORING.md, "Free agency".
 */

/** Claims a free agent for the viewer's party, dropping one of its heroes to make room. */
export async function claimFreeAgent(
  member: AccountDocument,
  leagueId: string,
  heroId: string,
  dropHeroId: string
): Promise<LineupView> {
  const { league, party } = await loadLeagueAsMember(member, leagueId)
  if (league.status !== 'active') throw new Conflict('Free agents can be claimed after the draft and until the season ends')
  if (heroId === dropHeroId) throw new BadRequest('Choose a different hero to drop')
  const { slots, classLimits } = getRuleset(league.rulesetVersion).lineup

  await inTransaction(async session => {
    // Every due battle must already be resolved, so a claim never changes a week that is due. Writing
    // the league also makes this transaction conflict with a battle being resolved at the same moment.
    const upToDate = await LeagueModel.updateOne(
      { _id: league._id, status: 'active', resolvedWeeks: dueWeekCount(league) },
      { $set: { updatedAt: new Date() } },
      { session }
    )
    if (upToDate.modifiedCount === 0) throw new Conflict('A battle is being resolved. Try again in a moment.')

    const dropped = await HeroModel.findOneAndUpdate(
      { _id: dropHeroId, leagueId: league._id, partyId: party._id },
      { $set: { partyId: null } },
      { session }
    )
    if (!dropped) throw new BadRequest('You can only drop a hero from your own party')
    // First come, first served: only succeeds while the hero is still unclaimed.
    const claimed = await HeroModel.findOneAndUpdate(
      { _id: heroId, leagueId: league._id, partyId: null },
      { $set: { partyId: party._id } },
      { session, new: true }
    )
    if (!claimed) {
      if (await HeroModel.exists({ _id: heroId, leagueId: league._id }).session(session)) {
        throw new Conflict('That hero is no longer a free agent')
      }
      throw new NotFound('That hero is not in this league')
    }

    const roster = await HeroModel.find({ leagueId: league._id, partyId: party._id }).session(session)
    // A claim can't take a party past a class limit (swapping one Paladin for another is fine).
    const limit = classLimits[claimed.heroClass]
    const sameClass = roster.filter(hero => hero.heroClass === claimed.heroClass).length
    if (limit !== undefined && sameClass > limit && dropped.heroClass !== claimed.heroClass) {
      throw new BadRequest(`A party can have at most ${String(limit)} ${claimed.heroClass}s`)
    }
    if (maxFillableSlots(roster.map(hero => hero.heroClass), slots) < slots.length) {
      throw new BadRequest("That change would leave your party unable to fill its lineup")
    }

    // The new hero takes the dropped hero's place in the lineup when the slot allows it.
    const current = await PartyModel.findById(party._id).session(session)
    const lineup = readLineup(current?.lineup) ?? {}
    const slot = Object.keys(lineup).find(key => lineup[key] === dropped.id)
    let next = lineup
    if (slot) {
      const fits = slots.find(rule => rule.key === slot)?.classes.includes(claimed.heroClass)
      next = fits
        ? { ...lineup, [slot]: claimed.id }
        : autoLineup(roster.map(hero => ({ id: hero.id, heroClass: hero.heroClass, value: expectedLevel(hero) })), slots)
    }
    const championDropped = current?.champion?.equals(dropped._id) ?? false
    await PartyModel.updateOne(
      { _id: party._id },
      { $set: { lineup: storedLineup(next), ...(championDropped ? { champion: null } : {}) } },
      { session }
    )
    await RosterMoveModel.create(
      [{ leagueId: league._id, partyId: party._id, kind: 'claim', added: claimed._id, dropped: dropped._id, effectiveWeek: league.resolvedWeeks + 1 }],
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

export interface RosterMoveView {
  kind: 'claim'
  party: { partyId: string; name: string }
  added: MoveHero
  dropped: MoveHero
  effectiveWeek: number
  at: Date
}

/** The league's most recent roster moves, newest first. */
export async function listMoves(viewer: AccountDocument, leagueId: string): Promise<RosterMoveView[]> {
  const league = await loadVisibleLeague(viewer, leagueId)
  const [moves, parties, heroes] = await Promise.all([
    RosterMoveModel.find({ leagueId: league._id }).sort({ createdAt: -1, _id: -1 }).limit(50),
    PartyModel.find({ leagueId: league._id }, 'name'),
    HeroModel.find({ leagueId: league._id }, 'name heroClass')
  ])
  const partyName = new Map(parties.map(party => [party.id, party.name]))
  const heroById = new Map(heroes.map(hero => [hero.id, hero]))
  const hero = (id: { toString(): string }): MoveHero => {
    const found = heroById.get(id.toString())
    return { heroId: id.toString(), name: found?.name ?? 'Unknown hero', heroClass: found?.heroClass ?? '' }
  }
  return moves.map(move => ({
    kind: move.kind,
    party: { partyId: move.partyId.toString(), name: partyName.get(move.partyId.toString()) ?? 'Unknown' },
    added: hero(move.added),
    dropped: hero(move.dropped),
    effectiveWeek: move.effectiveWeek,
    at: move.createdAt
  }))
}
