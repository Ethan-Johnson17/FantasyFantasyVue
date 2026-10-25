import mongoose from 'mongoose'
import type { HeroClass } from '../src/modules/heroes/classes.js'
import { HeroModel, type HeroDocument } from '../src/modules/heroes/hero.model.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { NflGameModel } from '../src/modules/stats/stats.models.js'
import { SEASON } from './crossoverSeed.js'
import { as, host } from './leagueHelpers.js'

/* Shared setup for Crossover league tests (seed data: crossoverSeed.ts). */

export const alice = as('auth0|alice')
const crest = { emblem: 'crown', banner: 'crimson' }

export /** A drafted Crossover league (host + alice). In the seed, week 8 is next: KC-BUF and PHI-SF play; DET, BAL, GB, DAL are on bye. */
async function draftedCrossover() {
  const created = await host.post('/api/leagues', {
    name: 'Sunday Crossover',
    visibility: 'private',
    cadence: 'weekly',
    maxParties: 4,
    mode: 'crossover',
    party: { name: 'Host Party', crest }
  })
  const { id, pin } = created.body as { id: string; pin: string }
  await alice.post('/api/leagues/join', { pin, party: { name: 'Alice Party', crest } })
  await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })
  await LeagueModel.updateOne({ _id: id }, { $set: { draftAt: new Date(Date.now() - 1000) } })
  await host.get(`/api/leagues/${id}`)
  return id
}

export /** Starts the week 8 game a team plays in. */
async function kickOff(team: string) {
  await NflGameModel.updateOne(
    { season: SEASON, week: 8, $or: [{ homeTeam: team }, { awayTeam: team }] },
    { $set: { kickoff: new Date(Date.now() - 60_000) } }
  )
}

/*
 * A fixed roster for Alice, so lock and claim cases don't depend on the draft. Week 8: KC-BUF and PHI-SF
 * play; DET, BAL, GB and DAL are on bye.
 */
export const ALICE_ROSTER = [
  { key: 'qb', heroClass: 'Mage', team: 'KC' },
  { key: 'rb1', heroClass: 'Warrior', team: 'DET' },
  { key: 'rb2', heroClass: 'Warrior', team: 'PHI' },
  { key: 'wr1', heroClass: 'Ranger', team: 'BUF' },
  { key: 'wr2', heroClass: 'Ranger', team: 'GB' },
  { key: 'te', heroClass: 'Rogue', team: 'SF' },
  { key: 'flex', heroClass: 'Warrior', team: 'BAL' },
  { key: 'def', heroClass: 'Paladin', team: 'BAL' },
  { key: 'bench-qb', heroClass: 'Mage', team: 'DET' },
  { key: 'bench-rb', heroClass: 'Warrior', team: 'KC' },
  { key: 'bench-wr', heroClass: 'Ranger', team: 'SF' },
  { key: 'bench-te', heroClass: 'Rogue', team: 'DET' }
] as const
export type RosterKey = (typeof ALICE_ROSTER)[number]['key']
/** Alice's Quest party: KC quarterback, PHI and KC running backs, BUF receiver, SF tight end */
export const QUEST_PARTY: readonly RosterKey[] = ['qb', 'rb2', 'bench-rb', 'wr1', 'te']

export async function fixedRoster(leagueId: string) {
  const party = (await PartyModel.findOne({ leagueId, name: 'Alice Party' }))!
  await HeroModel.updateMany({ leagueId, partyId: party._id }, { $set: { partyId: null } })
  const picked = new Map<RosterKey, HeroDocument>()
  for (const want of ALICE_ROSTER) {
    const taken = new Set([...picked.values()].map(hero => hero.id))
    const hero = (await HeroModel.find({ leagueId, heroClass: want.heroClass, 'player.team': want.team })).find(candidate => !taken.has(candidate.id))
    if (!hero) throw new Error(`The seed has no ${want.heroClass} on ${want.team}`)
    await HeroModel.updateOne({ _id: hero._id }, { $set: { partyId: party._id } })
    await PartyModel.updateMany({ leagueId, _id: mongoose.trusted({ $ne: party._id }) }, { $pull: { lineup: { heroId: hero._id } } })
    picked.set(want.key, hero)
  }
  const starters = ALICE_ROSTER.filter(want => !want.key.startsWith('bench'))
  await PartyModel.updateOne(
    { _id: party._id },
    {
      $set: {
        lineup: starters.map(want => ({ slot: want.key, heroId: picked.get(want.key)!._id })),
        questParty: QUEST_PARTY.map(key => picked.get(key)!._id),
        champion: null
      }
    }
  )
  const ids = Object.fromEntries([...picked].map(([key, hero]) => [key, hero.id])) as Record<RosterKey, string>
  const lineup = Object.fromEntries(starters.map(want => [want.key, ids[want.key]]))
  return { party, ids, lineup }
}

/** A free agent of a class on a team, taken from whoever holds one. */
export async function freeAgent(leagueId: string, heroClass: HeroClass, team: string, except: readonly string[]) {
  const hero = (await HeroModel.find({ leagueId, heroClass, 'player.team': team })).find(candidate => !except.includes(candidate.id))
  if (!hero) throw new Error(`The seed has no spare ${heroClass} on ${team}`)
  await HeroModel.updateOne({ _id: hero._id }, { $set: { partyId: null } })
  await PartyModel.updateMany({ leagueId }, { $pull: { lineup: { heroId: hero._id } } })
  return hero.id
}
