import type { ClientSession } from 'mongoose'
import { BadRequest } from '../../lib/errors.js'
import type { HeroClass } from '../heroes/classes.js'
import { HeroModel, type HeroDocument } from '../heroes/hero.model.js'
import { autoLineup, bestForSlot, maxFillableSlots, type LineupHero } from '../heroes/lineup.js'
import { expectedLevel } from '../heroes/pool.js'
import type { LeagueDocument } from '../leagues/league.model.js'
import { PartyModel, readLineup, storedLineup } from '../leagues/party.model.js'
import type { LineupRules } from '../scoring/rulesets.js'
import { lockedThisWeek } from '../season/season.service.js'

/*
 * Roster rules shared by free-agent claims and trades (docs/CLASSIC_SCORING.md, "Free agency"; docs/TRADES_SPEC.md),
 * and putting a party's lineup, Quest party and Champion right after heroes leave or arrive.
 */

/** Whose roster a message is about: the acting party's ("your") or another party's (by name). */
export type Whose = { mine: true } | { mine: false; name: string }

const possessive = (whose: Whose) => (whose.mine ? 'your' : `${whose.name}’s`)
const subject = (whose: Whose) => (whose.mine ? 'your party' : whose.name)

/**
 * What's wrong with a roster after a change, or null: over the roster size, past a class limit it wasn't already past,
 * or unable to fill the lineup. A class already at its limit can trade one for another of the same class.
 */
export function rosterProblem(before: readonly HeroClass[], after: readonly HeroClass[], rules: LineupRules, whose: Whose): string | null {
  if (after.length > rules.rosterSize) return `That would leave ${subject(whose)} with more than ${String(rules.rosterSize)} heroes`
  for (const [heroClass, limit] of Object.entries(rules.classLimits)) {
    const count = (roster: readonly HeroClass[]) => roster.filter(entry => entry === heroClass).length
    if (count(after) > limit && count(after) > count(before)) {
      return whose.mine ? `A party can have at most ${String(limit)} ${heroClass}s` : `${whose.name} can have at most ${String(limit)} ${heroClass}s`
    }
  }
  if (maxFillableSlots(after, rules.slots) < rules.slots.length) {
    return whose.mine ? 'That change would leave your party unable to fill its lineup' : `That change would leave ${whose.name} unable to fill its lineup`
  }
  return null
}

const lineupHero = (hero: HeroDocument): LineupHero => ({ id: hero.id, heroClass: hero.heroClass, value: expectedLevel(hero) })

/**
 * Puts a party's lineup, Quest party and Champion right after `departed` heroes left it and `arrived` heroes joined
 * (both already saved). An arriving hero takes a departing starter's slot when the slot allows it; otherwise Crossover
 * refills the slot from the bench (players yet to play only) and Classic rebuilds the lineup. A departing Quest party
 * member is replaced by an arriving hero yet to play, or the best one on the roster. A departing Champion is withdrawn.
 */
export async function repairParty(
  league: LeagueDocument,
  rules: LineupRules,
  partyId: LeagueDocument['_id'],
  departed: ReadonlySet<string>,
  arrived: readonly string[],
  whose: Whose,
  session: ClientSession
): Promise<void> {
  const current = await PartyModel.findById(partyId).session(session)
  if (!current) return
  const roster = await HeroModel.find({ leagueId: league._id, partyId }).select('+source').session(session)
  // Crossover: players whose game this week has kicked off can't step in.
  const locked = await lockedThisWeek(league, roster)
  const byId = new Map(roster.map(hero => [hero.id, hero]))
  const incoming = arrived.map(id => byId.get(id)).filter((hero): hero is HeroDocument => !!hero && !locked.has(hero.id))

  const lineup = readLineup(current.lineup) ?? {}
  let next = { ...lineup }
  const open = Object.keys(lineup).filter(key => departed.has(lineup[key] ?? ''))
  if (open.length > 0) {
    const starters = new Set(Object.values(lineup).filter(id => !departed.has(id)))
    let rebuild = false
    for (const key of open) {
      const rule = rules.slots.find(entry => entry.key === key)
      if (!rule) continue
      const fit = incoming.find(hero => rule.classes.includes(hero.heroClass) && !starters.has(hero.id))
      if (fit) {
        next[key] = fit.id
        starters.add(fit.id)
      } else if (league.mode === 'crossover') {
        const bench = roster.filter(hero => !starters.has(hero.id) && !locked.has(hero.id)).map(lineupHero)
        const fill = bestForSlot(bench, rule)
        if (!fill) {
          throw new BadRequest(`Nobody on ${possessive(whose)} bench who hasn’t played yet can fill ${possessive(whose)} ${rule.label} slot this week`)
        }
        next[key] = fill.id
        starters.add(fill.id)
      } else rebuild = true
    }
    if (rebuild) next = autoLineup(roster.map(lineupHero), rules.slots)
  }

  let questParty = current.questParty?.map(String)
  if (questParty?.some(id => departed.has(id))) {
    const remaining = questParty.filter(id => !departed.has(id))
    for (let missing = questParty.length - remaining.length; missing > 0; missing--) {
      const replacement =
        incoming.find(hero => !remaining.includes(hero.id))?.id ??
        roster
          .filter(hero => !remaining.includes(hero.id) && !locked.has(hero.id))
          .sort((a, b) => expectedLevel(b) - expectedLevel(a) || a.id.localeCompare(b.id))[0]?.id
      if (!replacement) {
        throw new BadRequest(
          whose.mine
            ? 'Nobody yet to play can take that hero’s place in your Quest party this week'
            : `Nobody yet to play can take that hero’s place in ${whose.name}’s Quest party this week`
        )
      }
      remaining.push(replacement)
    }
    questParty = remaining
  }

  const championLeft = current.champion ? departed.has(current.champion.toString()) : false
  await PartyModel.updateOne(
    { _id: partyId },
    { $set: { lineup: storedLineup(next), ...(questParty ? { questParty } : {}), ...(championLeft ? { champion: null } : {}) } },
    { session }
  )
}
