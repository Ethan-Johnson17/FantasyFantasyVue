import mongoose from 'mongoose'
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { HeroModel } from '../heroes/hero.model.js'
import { autoLineup, bestForSlot, maxFillableSlots } from '../heroes/lineup.js'
import { expectedLevel } from '../heroes/pool.js'
import { inTransaction, loadLeagueAsMember, loadVisibleLeague } from '../leagues/league.access.js'
import { LeagueModel } from '../leagues/league.model.js'
import { PartyModel, readLineup, storedLineup } from '../leagues/party.model.js'
import { getRuleset } from '../scoring/rulesets.js'
import { getLineup, lockedThisWeek, readyWeekCount, type LineupView } from '../season/season.service.js'
import { RosterMoveModel } from './rosterMove.model.js'

const { trusted } = mongoose

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
  const ready = await readyWeekCount(league)
  // Crossover: players whose game this week has kicked off (computed before the transaction; kickoffs don't move).
  const locked = await lockedThisWeek(league, await HeroModel.find({ leagueId: league._id, _id: trusted({ $in: [heroId, dropHeroId] }) }).select('+source'))
  const lineupBefore = readLineup(party.lineup) ?? {}
  const inQuestParty = (party.questParty ?? []).some(id => id.toString() === dropHeroId)
  if (locked.has(dropHeroId) && (Object.values(lineupBefore).includes(dropHeroId) || inQuestParty)) {
    throw new Conflict('That hero is in this week’s lineup and their game has kicked off; drop them after the week')
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

    // Dynasty XP stays with the party that earned it: a hero who changes hands starts again (modules/dynasty/xp.ts).
    const dropped = await HeroModel.findOneAndUpdate(
      { _id: dropHeroId, leagueId: league._id, partyId: party._id },
      { $set: { partyId: null, xp: 0, earnedTrait: null } },
      { session }
    )
    if (!dropped) throw new BadRequest('You can only drop a hero from your own party')
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
    const rule = slots.find(entry => entry.key === slot)
    if (slot && rule) {
      const fits = rule.classes.includes(claimed.heroClass) && !locked.has(claimed.id)
      if (fits) next = { ...lineup, [slot]: claimed.id }
      else if (league.mode === 'crossover') {
        // Kickoff locks: refill only the open slot, from bench heroes who haven't played yet this week.
        const starters = new Set(Object.values(lineup))
        const benchLocked = await lockedThisWeek(league, await HeroModel.find({ leagueId: league._id, partyId: party._id }).select('+source').session(session))
        const bench = roster
          .filter(hero => !starters.has(hero.id) && !benchLocked.has(hero.id))
          .map(hero => ({ id: hero.id, heroClass: hero.heroClass, value: expectedLevel(hero) }))
        const fill = bestForSlot(bench, rule)
        if (!fill) throw new BadRequest(`Nobody on your bench who hasn’t played yet can fill your ${rule.label} slot this week`)
        next = { ...lineup, [slot]: fill.id }
      } else next = autoLineup(roster.map(hero => ({ id: hero.id, heroClass: hero.heroClass, value: expectedLevel(hero) })), slots)
    }
    const championDropped = current?.champion?.equals(dropped._id) ?? false
    // Crossover: a dropped Quest party member is replaced by the claimed hero, or if they've already played this
    // week, the best hero yet to play who isn't in the party.
    let questParty = current?.questParty?.map(String)
    if (questParty?.includes(dropped.id)) {
      const remaining = questParty.filter(id => id !== dropped.id)
      let replacement: string | undefined = locked.has(claimed.id) ? undefined : claimed.id
      if (!replacement) {
        const rosterLocked = await lockedThisWeek(league, await HeroModel.find({ leagueId: league._id, partyId: party._id }).select('+source').session(session))
        replacement = roster
          .filter(hero => !remaining.includes(hero.id) && !rosterLocked.has(hero.id))
          .sort((a, b) => expectedLevel(b) - expectedLevel(a) || a.id.localeCompare(b.id))[0]?.id
      }
      if (!replacement) throw new BadRequest('Nobody yet to play can take that hero’s place in your Quest party this week')
      questParty = [...remaining, replacement]
    }
    await PartyModel.updateOne(
      { _id: party._id },
      { $set: { lineup: storedLineup(next), ...(questParty ? { questParty } : {}), ...(championDropped ? { champion: null } : {}) } },
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
