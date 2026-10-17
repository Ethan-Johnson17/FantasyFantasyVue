import { Conflict } from '../../lib/errors.js'
import type { AccountDocument } from '../accounts/account.model.js'
import { HeroModel } from '../heroes/hero.model.js'
import { getRuleset } from '../scoring/rulesets.js'
import { critOf } from './crits.js'
import { loadVisibleLeague } from '../leagues/league.access.js'
import { PartyModel } from '../leagues/party.model.js'
import { computeStandings, type StandingView } from './season.service.js'
import { WeekResultModel } from './weekResult.model.js'

/*
 * The end-of-season finale: the champion, final standings, and awards from the stored results.
 * The hidden season and every hero's player stay secret (no reveal); hero damage is rounded, as
 * everywhere else.
 */

type PartyRef = Pick<StandingView, 'partyId' | 'name' | 'crest'>
interface HeroRef {
  heroId: string
  name: string
  heroClass: string
}

export type Award =
  /** The highest party total in a single battle */
  | { kind: 'mightiestBlow'; party: PartyRef; week: number; total: number }
  /** The hero who dealt the most damage over the season */
  | { kind: 'heroOfTheSeason'; hero: HeroRef; party: PartyRef; damage: number }
  /** The biggest single hero-battle */
  | { kind: 'greatestStrike'; hero: HeroRef; party: PartyRef; week: number; damage: number }
  /** The narrowest party-against-party result */
  | { kind: 'closestBattle'; winner: PartyRef; loser: PartyRef; week: number; margin: number }
  /** The least damage faced over the season */
  | { kind: 'unbreakable'; party: PartyRef; damageFaced: number }
  /** The most natural 20s (critical successes) */
  | { kind: 'natural20'; party: PartyRef; count: number }
  /** The most natural 1s (critical fails) */
  | { kind: 'cursedDice'; party: PartyRef; count: number }

export interface FinaleView {
  champion: StandingView
  standings: StandingView[]
  /** The viewer's place, if they played */
  myFinish: { partyId: string; rank: number } | null
  awards: Award[]
}

export async function getFinale(viewer: AccountDocument, leagueId: string): Promise<FinaleView> {
  const league = await loadVisibleLeague(viewer, leagueId)
  if (league.status !== 'complete') throw new Conflict("The season isn't over yet")

  const [standings, results, heroes, mine] = await Promise.all([
    computeStandings(league),
    WeekResultModel.find({ leagueId: league._id }).sort({ week: 1 }),
    HeroModel.find({ leagueId: league._id }, 'name heroClass'),
    PartyModel.findOne({ leagueId: league._id, accountId: viewer._id }, '_id')
  ])
  const champion = standings[0]
  if (!champion) throw new Conflict('This league has no standings')
  const partyRef = new Map(standings.map(row => [row.partyId, { partyId: row.partyId, name: row.name, crest: row.crest }]))
  const ref = (id: { toString(): string }): PartyRef =>
    partyRef.get(id.toString()) ?? { partyId: id.toString(), name: 'Unknown', crest: champion.crest }
  const heroById = new Map(heroes.map(hero => [hero.id, hero]))
  const heroRef = (id: string): HeroRef => ({ heroId: id, name: heroById.get(id)?.name ?? 'Unknown hero', heroClass: heroById.get(id)?.heroClass ?? '' })

  let blow: Extract<Award, { kind: 'mightiestBlow' }> | null = null
  let strike: Extract<Award, { kind: 'greatestStrike' }> | null = null
  let closest: Extract<Award, { kind: 'closestBattle' }> | null = null
  // Hero -> party -> damage, so a hero who changed parties is credited to the one they fought for most.
  const heroDamage = new Map<string, Map<string, number>>()
  const faced = new Map<string, number>()
  const ruleset = getRuleset(league.rulesetVersion)
  const crits = { success: new Map<string, number>(), fail: new Map<string, number>() }

  for (const result of results) {
    for (const matchup of result.matchups) {
      const sides = matchup.away ? [matchup.home, matchup.away] : [matchup.home]
      for (const [index, side] of sides.entries()) {
        if (!blow || side.total > blow.total) blow = { kind: 'mightiestBlow', party: ref(side.partyId), week: result.week, total: side.total }
        const against = index === 0 ? (matchup.away?.total ?? matchup.monster?.total ?? 0) : matchup.home.total
        faced.set(side.partyId.toString(), (faced.get(side.partyId.toString()) ?? 0) + against)
        for (const line of side.heroes) {
          const id = line.heroId.toString()
          const crit = critOf(line, heroById.get(id)?.heroClass ?? 'Mage', ruleset)
          if (crit) crits[crit].set(side.partyId.toString(), (crits[crit].get(side.partyId.toString()) ?? 0) + 1)
          if (line.counted <= 0) continue
          const byParty = heroDamage.get(id) ?? new Map<string, number>()
          byParty.set(side.partyId.toString(), (byParty.get(side.partyId.toString()) ?? 0) + line.counted)
          heroDamage.set(id, byParty)
          if (!strike || line.counted > strike.damage) {
            strike = { kind: 'greatestStrike', hero: heroRef(id), party: ref(side.partyId), week: result.week, damage: line.counted }
          }
        }
      }
      if (matchup.away && matchup.outcome !== 'draw') {
        const margin = Math.abs(matchup.home.total - matchup.away.total)
        if (!closest || margin < closest.margin) {
          const [winner, loser] = matchup.outcome === 'home' ? [matchup.home, matchup.away] : [matchup.away, matchup.home]
          closest = { kind: 'closestBattle', winner: ref(winner.partyId), loser: ref(loser.partyId), week: result.week, margin }
        }
      }
    }
  }

  let hero: Extract<Award, { kind: 'heroOfTheSeason' }> | null = null
  for (const [id, byParty] of heroDamage) {
    const total = [...byParty.values()].reduce((sum, value) => sum + value, 0)
    if (hero && total <= hero.damage) continue
    const [mainParty] = [...byParty].sort((a, b) => b[1] - a[1])[0] ?? []
    if (mainParty) hero = { kind: 'heroOfTheSeason', hero: heroRef(id), party: ref(mainParty), damage: total }
  }
  const [wall] = [...faced].sort((a, b) => a[1] - b[1])
  /** The party with the most of one crit; ties go to the higher-placed party. */
  const mostCrits = (counts: ReadonlyMap<string, number>) =>
    standings.reduce<{ partyId: string; count: number } | null>((best, row) => {
      const count = counts.get(row.partyId) ?? 0
      return count > (best?.count ?? 0) ? { partyId: row.partyId, count } : best
    }, null)
  const luckiest = mostCrits(crits.success)
  const cursed = mostCrits(crits.fail)

  // Hidden-player rule: hero damage is shown rounded; party totals are exact, as in results.
  const awards: Award[] = [
    ...(blow ? [blow] : []),
    ...(hero ? [{ ...hero, damage: Math.round(hero.damage) }] : []),
    ...(strike ? [{ ...strike, damage: Math.round(strike.damage) }] : []),
    ...(closest ? [{ ...closest, margin: Math.round(closest.margin * 100) / 100 }] : []),
    ...(wall ? [{ kind: 'unbreakable' as const, party: ref(wall[0]), damageFaced: Math.round(wall[1] * 100) / 100 }] : []),
    ...(luckiest ? [{ kind: 'natural20' as const, party: ref(luckiest.partyId), count: luckiest.count }] : []),
    ...(cursed ? [{ kind: 'cursedDice' as const, party: ref(cursed.partyId), count: cursed.count }] : [])
  ]
  const myIndex = mine ? standings.findIndex(row => row.partyId === mine.id) : -1
  return {
    champion,
    standings,
    myFinish: mine && myIndex >= 0 ? { partyId: mine.id, rank: myIndex + 1 } : null,
    awards
  }
}
