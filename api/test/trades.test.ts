import mongoose from 'mongoose'
import { beforeEach, describe, expect, it } from 'vitest'
import type { HeroClass } from '../src/modules/heroes/classes.js'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { LeagueModel, type LeagueDocument } from '../src/modules/leagues/league.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { getRuleset, RULESET_FOR_MODE } from '../src/modules/scoring/rulesets.js'
import { TradeModel } from '../src/modules/trades/trade.model.js'
import { releasesNeeded, tradeWindow } from '../src/modules/trades/trade.service.js'
import { rosterProblem } from '../src/modules/roster/repair.js'
import { as, draftedLeague, host, makeWeeksDue, type Player } from './leagueHelpers.js'
import { seedStats } from './statsSeed.js'

/* Trades between parties (docs/TRADES_SPEC.md). */

const alice = as('auth0|alice')
const bob = as('auth0|bob')
const outsider = as('auth0|outsider')

interface HeroView {
  id: string
  partyId: string | null
  heroClass: string
}
interface TradeView {
  id: string
  status: string
  from: { partyId: string; name: string }
  to: { partyId: string; name: string }
  offered: { heroId: string }[]
  requested: { heroId: string }[]
  fromReleases: { heroId: string }[]
  toReleases: { heroId: string }[]
  waitingOnMe: boolean
  releasesNeeded: number
  effectiveWeek: number | null
}
interface TradesView {
  window: { open: boolean; lastWeek: number | null }
  rosterSize: number
  open: TradeView[]
  answered: TradeView[]
}
interface Lineup {
  lineup: Record<string, string>
  champion: string | null
  roster: { id: string }[]
}

const CLASSIC = getRuleset(RULESET_FOR_MODE.classic).lineup

/** A drafted Classic league of host and alice (and any others): each party's id and heroes. */
async function league(others: readonly Player[] = []) {
  const id = await draftedLeague([alice, ...others])
  const parties = await PartyModel.find({ leagueId: id }).sort({ createdAt: 1 })
  const [hostParty, aliceParty] = parties.map(party => party.id)
  return { id, hostParty: hostParty!, aliceParty: aliceParty!, parties: parties.map(party => party.id) }
}
async function heroesOf(id: string, partyId: string | null) {
  return ((await host.get(`/api/leagues/${id}/heroes`)).body as HeroView[]).filter(hero => hero.partyId === partyId)
}
const idsOf = (heroes: readonly HeroView[]) => heroes.map(hero => hero.id)
async function tradesOf(player: Player, id: string) {
  return (await player.get(`/api/leagues/${id}/trades`)).body as TradesView
}
function offer(player: Player, id: string, body: { toPartyId: string; offered: string[]; requested: string[]; releases?: string[] }) {
  return player.post(`/api/leagues/${id}/trades`, body)
}

beforeEach(async () => {
  await seedStats()
})

describe('the trade window and releases', () => {
  it('opens after the draft and closes when 4 regular-season weeks are left; Solo never has trades', async () => {
    const id = await draftedLeague([alice])
    const doc = (await LeagueModel.findById(id))!
    expect(tradeWindow(doc)).toEqual({ open: true, lastWeek: 10 })
    expect(tradeWindow(doc, 9)).toEqual({ open: true, lastWeek: 10 })
    expect(tradeWindow(doc, 10)).toEqual({ open: false, lastWeek: 10 })
    const as = (changes: object) => ({ ...doc.toObject(), ...changes }) as unknown as LeagueDocument
    expect(tradeWindow(as({ status: 'forming' })).open).toBe(false)
    // A Solo run's season would be long enough, but it has one party
    expect(tradeWindow(as({ mode: 'solo', nflWeeks: new Array(14).fill({}) }))).toEqual({ open: false, lastWeek: null })
    // A Crossover league's regular season is its NFL weeks before the playoffs
    expect(tradeWindow(as({ mode: 'crossover', playoffs: false, nflWeeks: new Array(7).fill({}) }))).toEqual({ open: true, lastWeek: 3 })
    expect(tradeWindow(as({ mode: 'crossover', playoffs: false, nflWeeks: new Array(4).fill({}) }))).toEqual({ open: false, lastWeek: null })
  })

  it('releases only what it takes to get back to the roster size', () => {
    expect(releasesNeeded(10, 1, 1, 10)).toBe(0)
    expect(releasesNeeded(10, 1, 2, 10)).toBe(1)
    expect(releasesNeeded(10, 1, 3, 10)).toBe(2)
    expect(releasesNeeded(9, 1, 2, 10)).toBe(0)
    expect(releasesNeeded(10, 3, 1, 10)).toBe(0)
  })

  it('checks a roster afterwards: its size, class limits it wasn’t already past, and the lineup', () => {
    const ten: HeroClass[] = ['Mage', 'Mage', 'Warrior', 'Warrior', 'Warrior', 'Ranger', 'Ranger', 'Ranger', 'Rogue', 'Paladin']
    expect(rosterProblem(ten, [...ten, 'Rogue'], CLASSIC, { mine: true })).toBe('That would leave your party with more than 10 heroes')
    // Two Mages out, two Paladins in: three Paladins
    const threePaladins: HeroClass[] = [...ten.slice(2), 'Paladin', 'Paladin']
    expect(rosterProblem(ten, threePaladins, CLASSIC, { mine: false, name: 'Bob' })).toBe('Bob can have at most 2 Paladins')
    // Already past the limit (drafted before it): one Paladin for another is fine, a fourth isn't
    expect(rosterProblem(threePaladins, threePaladins, CLASSIC, { mine: true })).toBeNull()
    expect(rosterProblem(threePaladins, [...threePaladins.slice(1), 'Paladin'], CLASSIC, { mine: true })).toBe('A party can have at most 2 Paladins')
    expect(rosterProblem(ten, ten, CLASSIC, { mine: true })).toBeNull()
  })
})

describe('offering a trade', () => {
  it('sends an offer that only the two parties can see, waiting on the other party', async () => {
    const { id, hostParty, aliceParty } = await league([bob])
    const [give] = await heroesOf(id, hostParty)
    const [want] = await heroesOf(id, aliceParty)
    const res = await offer(host, id, { toPartyId: aliceParty, offered: [give!.id], requested: [want!.id] })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ status: 'open', from: { partyId: hostParty }, to: { partyId: aliceParty }, waitingOnMe: false })

    const mine = await tradesOf(alice, id)
    expect(mine.window).toEqual({ open: true, lastWeek: 10 })
    expect(mine.rosterSize).toBe(10)
    expect(mine.open).toHaveLength(1)
    expect(mine.open[0]).toMatchObject({ waitingOnMe: true, releasesNeeded: 0, offered: [{ heroId: give!.id }], requested: [{ heroId: want!.id }] })
    expect((await tradesOf(host, id)).open[0]!.waitingOnMe).toBe(false)
    // Nobody else sees it, and outsiders can't see the league's trades at all.
    expect((await tradesOf(bob, id)).open).toHaveLength(0)
    expect((await outsider.get(`/api/leagues/${id}/trades`)).status).toBe(404)
    expect(JSON.stringify(mine)).not.toMatch(/source|season/)
  })

  it('counts offers waiting on me on My leagues and the league', async () => {
    const { id, hostParty, aliceParty } = await league()
    const [give] = await heroesOf(id, hostParty)
    const [want] = await heroesOf(id, aliceParty)
    await offer(host, id, { toPartyId: aliceParty, offered: [give!.id], requested: [want!.id] })
    const mine = (await alice.get('/api/leagues/mine')).body as { id: string; tradeOffers: number }[]
    expect(mine.find(entry => entry.id === id)?.tradeOffers).toBe(1)
    expect(((await host.get('/api/leagues/mine')).body as { tradeOffers: number }[])[0]?.tradeOffers).toBe(0)
    expect((await alice.get(`/api/leagues/${id}`)).body.tradeOffers).toBe(1)
    expect((await host.get(`/api/leagues/${id}`)).body.tradeOffers).toBe(0)
  })

  it('needs releases from a sender who’d end up over the roster size, and no more', async () => {
    const { id, hostParty, aliceParty } = await league()
    const mine = await heroesOf(id, hostParty)
    const theirs = await heroesOf(id, aliceParty)
    const body = { toPartyId: aliceParty, offered: [mine[0]!.id], requested: idsOf(theirs.slice(0, 2)) }
    const none = await offer(host, id, body)
    expect(none.status).toBe(400)
    expect(none.body.error.message).toBe('This trade leaves your roster 1 over: release 1 of your heroes')
    const extra = await offer(host, id, { ...body, requested: [theirs[0]!.id], releases: [mine[1]!.id] })
    expect(extra.status).toBe(400)
    expect(extra.body.error.message).toBe('This trade leaves room on your roster: release nobody')
    const traded = await offer(host, id, { ...body, releases: [mine[0]!.id] })
    expect(traded.status).toBe(400)
    expect(traded.body.error.message).toBe('A hero you’re trading can’t also be released')

    const ok = await offer(host, id, { ...body, releases: [mine[1]!.id] })
    expect(ok.status).toBe(201)
    expect(ok.body.fromReleases).toEqual([expect.objectContaining({ heroId: mine[1]!.id })])
  })

  it('refuses offers that break the rules', async () => {
    const { id, hostParty, aliceParty } = await league()
    const mine = await heroesOf(id, hostParty)
    const theirs = await heroesOf(id, aliceParty)
    const free = await heroesOf(id, null)
    const cases: [object, number, string?][] = [
      [{ toPartyId: hostParty, offered: [mine[0]!.id], requested: [mine[1]!.id] }, 400, 'Choose another party to trade with'],
      [{ toPartyId: '0123456789abcdef01234567', offered: [mine[0]!.id], requested: [theirs[0]!.id] }, 404, 'That party is not in this league'],
      [{ toPartyId: aliceParty, offered: [theirs[1]!.id], requested: [theirs[0]!.id] }, 400, 'You can only offer or release heroes from your own party'],
      [{ toPartyId: aliceParty, offered: [mine[0]!.id], requested: [free[0]!.id] }, 400, 'You can only ask for heroes from Member 0'],
      [{ toPartyId: aliceParty, offered: [mine[0]!.id, mine[0]!.id], requested: [theirs[0]!.id] }, 400],
      [{ toPartyId: aliceParty, offered: idsOf(mine.slice(0, 4)), requested: [theirs[0]!.id] }, 400],
      [{ toPartyId: aliceParty, offered: [], requested: [theirs[0]!.id] }, 400],
      [{ toPartyId: aliceParty, offered: [mine[0]!.id], requested: [theirs[0]!.id], extra: true }, 400]
    ]
    for (const [body, status, message] of cases) {
      const res = await host.post(`/api/leagues/${id}/trades`, body)
      expect(res.status, JSON.stringify(body)).toBe(status)
      if (message) expect(res.body.error.message).toBe(message)
    }
    expect((await outsider.post(`/api/leagues/${id}/trades`, { toPartyId: aliceParty, offered: [mine[0]!.id], requested: [theirs[0]!.id] })).status).toBe(404)
    expect(await TradeModel.countDocuments({ leagueId: id })).toBe(0)
  })

  it('won’t take a sender past a class limit', async () => {
    const { id, hostParty, aliceParty } = await league()
    // Two Paladins for host, and one for alice to ask for
    const paladins = await HeroModel.find({ leagueId: id, heroClass: 'Paladin' })
    const mine = (await heroesOf(id, hostParty)).filter(hero => hero.heroClass === 'Mage')
    const keep = paladins.filter(hero => hero.partyId?.toString() === hostParty)
    for (const hero of paladins.filter(entry => entry.partyId?.toString() !== hostParty).slice(0, 2 - keep.length)) {
      await HeroModel.updateOne({ _id: hero._id }, { $set: { partyId: hostParty } })
      await HeroModel.updateOne({ _id: mine.pop()!.id }, { $set: { partyId: null } })
    }
    const theirPaladin = (await HeroModel.findOne({ leagueId: id, heroClass: 'Paladin', partyId: mongoose.trusted({ $ne: hostParty }) }))!
    await HeroModel.updateOne({ _id: theirPaladin._id }, { $set: { partyId: aliceParty } })
    const aliceRoster = await heroesOf(id, aliceParty)
    const extra = aliceRoster.find(hero => hero.id !== theirPaladin.id && hero.heroClass !== 'Paladin')!
    await HeroModel.updateOne({ _id: extra.id }, { $set: { partyId: null } })

    const give = (await heroesOf(id, hostParty)).find(hero => hero.heroClass !== 'Paladin')!
    const res = await offer(host, id, { toPartyId: aliceParty, offered: [give.id], requested: [theirPaladin.id] })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('A party can have at most 2 Paladins')
  })

  it('limits open offers to 10, and never the same offer twice', async () => {
    const { id, hostParty, aliceParty } = await league()
    const mine = await heroesOf(id, hostParty)
    const [want] = await heroesOf(id, aliceParty)
    expect((await offer(host, id, { toPartyId: aliceParty, offered: [mine[0]!.id], requested: [want!.id] })).status).toBe(201)
    const again = await offer(host, id, { toPartyId: aliceParty, offered: [mine[0]!.id], requested: [want!.id] })
    expect(again.status).toBe(409)
    expect(again.body.error.message).toBe('You’ve already offered this trade')
    for (const hero of mine.slice(1, 10)) {
      expect((await offer(host, id, { toPartyId: aliceParty, offered: [hero.id], requested: [want!.id] })).status).toBe(201)
    }
    const eleventh = await offer(host, id, { toPartyId: aliceParty, offered: idsOf(mine.slice(0, 2)), requested: [want!.id] })
    expect(eleventh.status).toBe(409)
    expect(eleventh.body.error.message).toBe('You have 10 open offers: withdraw one first')
  })

  it('is closed before the draft and after the deadline, when open offers expire', async () => {
    const created = await host.post('/api/leagues', {
      name: 'Forming',
      visibility: 'private',
      cadence: 'daily',
      maxParties: 4,
      mode: 'classic',
      party: { name: 'Host Party', crest: { emblem: 'crown', banner: 'crimson' } }
    })
    const forming = await host.post(`/api/leagues/${String(created.body.id)}/trades`, {
      toPartyId: '0123456789abcdef01234567',
      offered: ['0123456789abcdef01234568'],
      requested: ['0123456789abcdef01234569']
    })
    expect(forming.status).toBe(409)
    expect(forming.body.error.message).toBe('Trades can be made after the draft and until the trade deadline')

    const { id, hostParty, aliceParty } = await league()
    const [give] = await heroesOf(id, hostParty)
    const [want] = await heroesOf(id, aliceParty)
    await offer(host, id, { toPartyId: aliceParty, offered: [give!.id], requested: [want!.id] })
    await makeWeeksDue(id, 10)
    const late = await offer(host, id, { toPartyId: aliceParty, offered: [give!.id], requested: [want!.id] })
    expect(late.status).toBe(409)
    expect(late.body.error.message).toBe('The trade deadline has passed: trades closed after week 10')
    const trades = await tradesOf(alice, id)
    expect(trades.window).toEqual({ open: false, lastWeek: 10 })
    expect(trades.open).toHaveLength(0)
    expect(trades.answered[0]?.status).toBe('expired')
    expect((await alice.get(`/api/leagues/${id}`)).body.tradeOffers).toBe(0)
  })
})

describe('answering an offer', () => {
  it('accepting swaps the heroes at once: slots, the Champion, XP, and the league’s moves', async () => {
    const { id, hostParty, aliceParty } = await league()
    const hostLineup = (await host.get(`/api/leagues/${id}/lineup`)).body as Lineup
    const [slot, give] = Object.entries(hostLineup.lineup)[0]!
    await host.put(`/api/leagues/${id}/champion`, { heroId: give })
    const aliceLineup = (await alice.get(`/api/leagues/${id}/lineup`)).body as Lineup
    const [aliceSlot, want] = Object.entries(aliceLineup.lineup)[0]!
    await HeroModel.updateMany({ _id: mongoose.trusted({ $in: [give, want] }) }, { $set: { xp: 120 } })

    const { body: sent } = await offer(host, id, { toPartyId: aliceParty, offered: [give], requested: [want] })
    const res = await alice.post(`/api/leagues/${id}/trades/${String(sent.id)}/accept`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'accepted', effectiveWeek: 1, waitingOnMe: false })

    expect((await HeroModel.findById(give))!.partyId?.toString()).toBe(aliceParty)
    expect((await HeroModel.findById(want))!.partyId?.toString()).toBe(hostParty)
    // Dynasty XP stays with the party that earned it
    expect((await HeroModel.findById(give))!.xp).toBe(0)
    const hostAfter = (await host.get(`/api/leagues/${id}/lineup`)).body as Lineup
    const aliceAfter = (await alice.get(`/api/leagues/${id}/lineup`)).body as Lineup
    expect(hostAfter.lineup[slot]).toBe(want)
    expect(hostAfter.champion).toBeNull()
    expect(aliceAfter.lineup[aliceSlot]).toBe(give)
    expect(hostAfter.roster).toHaveLength(10)

    const moves = (await host.get(`/api/leagues/${id}/moves`)).body as { kind: string; sides: { party: { partyId: string }; received: { heroId: string }[] }[] }[]
    expect(moves[0]).toMatchObject({
      kind: 'trade',
      effectiveWeek: 1,
      sides: [
        { party: { partyId: hostParty }, received: [{ heroId: want }], released: [] },
        { party: { partyId: aliceParty }, received: [{ heroId: give }], released: [] }
      ]
    })
    expect((await tradesOf(alice, id)).answered[0]?.status).toBe('accepted')
  })

  it('takes releases from a receiver who’d end up over, then the sender left short claims into the open spot', async () => {
    const { id, hostParty, aliceParty } = await league()
    const mine = await heroesOf(id, hostParty)
    const theirs = await heroesOf(id, aliceParty)
    const { body: sent } = await offer(host, id, { toPartyId: aliceParty, offered: idsOf(mine.slice(0, 2)), requested: [theirs[0]!.id] })
    expect((await tradesOf(alice, id)).open[0]?.releasesNeeded).toBe(1)

    const url = `/api/leagues/${id}/trades/${String(sent.id)}/accept`
    const none = await alice.post(url)
    expect(none.status).toBe(400)
    expect(none.body.error.message).toBe('This trade leaves your roster 1 over: release 1 of your heroes')
    expect((await alice.post(url, { releases: [theirs[0]!.id] })).status).toBe(400)
    expect((await alice.post(url, { releases: [mine[3]!.id] })).body.error.message).toBe('You can only release heroes from your own party')
    // Nothing changed while refused
    expect(await heroesOf(id, aliceParty)).toHaveLength(10)

    const ok = await alice.post(url, { releases: [theirs[5]!.id] })
    expect(ok.status).toBe(200)
    expect(ok.body.toReleases).toEqual([expect.objectContaining({ heroId: theirs[5]!.id })])
    expect(await heroesOf(id, aliceParty)).toHaveLength(10)
    expect(idsOf(await heroesOf(id, null))).toContain(theirs[5]!.id)

    // Host has 9: a claim fills the open spot without a drop, and a full roster still has to drop one.
    expect(await heroesOf(id, hostParty)).toHaveLength(9)
    const free = await heroesOf(id, null)
    const claim = await host.post(`/api/leagues/${id}/claims`, { heroId: free[0]!.id, dropHeroId: null })
    expect(claim.status).toBe(200)
    expect((claim.body as Lineup).roster).toHaveLength(10)
    const full = await host.post(`/api/leagues/${id}/claims`, { heroId: free[1]!.id, dropHeroId: null })
    expect(full.status).toBe(400)
    expect(full.body.error.message).toBe('Your roster is full: choose a hero to drop')
    const moves = (await host.get(`/api/leagues/${id}/moves`)).body as { kind: string; dropped: unknown }[]
    expect(moves[0]).toMatchObject({ kind: 'claim', dropped: null })
  })

  it('lets only the receiver accept or decline, and only the sender withdraw; answered offers stay answered', async () => {
    const { id, hostParty, aliceParty } = await league([bob])
    const mine = await heroesOf(id, hostParty)
    const [want] = await heroesOf(id, aliceParty)
    const send = async (hero: HeroView) => (await offer(host, id, { toPartyId: aliceParty, offered: [hero.id], requested: [want!.id] })).body as TradeView
    const first = await send(mine[0]!)
    const second = await send(mine[1]!)
    const url = (trade: TradeView, action: string) => `/api/leagues/${id}/trades/${trade.id}/${action}`

    expect((await host.post(url(first, 'accept'))).status).toBe(400)
    expect((await host.post(url(first, 'decline'))).body.error.message).toBe('Only the party the offer was sent to can decline it')
    expect((await alice.post(url(first, 'withdraw'))).body.error.message).toBe('Only the sender can withdraw an offer')
    expect((await bob.post(url(first, 'decline'))).status).toBe(404)

    expect((await alice.post(url(first, 'decline'))).body.status).toBe('declined')
    expect((await host.post(url(second, 'withdraw'))).body.status).toBe('withdrawn')
    for (const trade of [first, second]) {
      const res = await alice.post(url(trade, 'accept'))
      expect(res.status).toBe(409)
      expect(res.body.error.message).toBe('That offer is no longer open')
    }
    // An answered offer can't be answered again
    expect((await alice.post(url(first, 'decline'))).status).toBe(409)
    expect((await host.post(url(second, 'withdraw'))).status).toBe(409)
    expect((await TradeModel.findById(first.id))!.status).toBe('declined')
    expect((await TradeModel.findById(second.id))!.status).toBe('withdrawn')
    expect((await HeroModel.findById(want!.id))!.partyId?.toString()).toBe(aliceParty)
    const answered = (await tradesOf(host, id)).answered.map(trade => trade.status)
    expect(answered.sort()).toEqual(['declined', 'withdrawn'])
    expect((await host.post(`/api/leagues/${id}/trades/0123456789abcdef01234567/accept`)).status).toBe(404)
  })

  it('expires offers that share a hero once one goes through, or once a hero is dropped', async () => {
    const { id, hostParty, aliceParty, parties } = await league([bob])
    const bobParty = parties[2]!
    const mine = await heroesOf(id, hostParty)
    const [want] = await heroesOf(id, aliceParty)
    const [bobs] = await heroesOf(id, bobParty)
    const { body: first } = await offer(host, id, { toPartyId: aliceParty, offered: [mine[0]!.id], requested: [want!.id] })
    const { body: second } = await offer(host, id, { toPartyId: bobParty, offered: [mine[0]!.id], requested: [bobs!.id] })
    const { body: third } = await offer(bob, id, { toPartyId: hostParty, offered: [bobs!.id], requested: [mine[1]!.id] })

    expect((await alice.post(`/api/leagues/${id}/trades/${String(first.id)}/accept`)).status).toBe(200)
    expect((await TradeModel.findById(second.id))!.status).toBe('expired')
    expect((await TradeModel.findById(third.id))!.status).toBe('open')

    // Host drops the hero bob asked for: bob's offer can't happen now.
    const free = await heroesOf(id, null)
    await host.post(`/api/leagues/${id}/claims`, { heroId: free[0]!.id, dropHeroId: mine[1]!.id })
    const trades = await tradesOf(host, id)
    expect(trades.open).toHaveLength(0)
    expect((await TradeModel.findById(third.id))!.status).toBe('expired')
    expect((await bob.post(`/api/leagues/${id}/trades/${String(third.id)}/accept`)).status).toBe(400)
  })

  it('checks the sender again on accepting: a claim since the offer can make it break a class limit', async () => {
    const { id, hostParty, aliceParty } = await league()
    // Host holds one Paladin and asks alice for hers
    const paladins = await HeroModel.find({ leagueId: id, heroClass: 'Paladin' })
    const hostPaladins = paladins.filter(hero => hero.partyId?.toString() === hostParty)
    for (const extra of hostPaladins.slice(1)) await HeroModel.updateOne({ _id: extra._id }, { $set: { partyId: null } })
    if (hostPaladins.length === 0) {
      const hostMage = (await heroesOf(id, hostParty)).find(hero => hero.heroClass === 'Mage')!
      await HeroModel.updateOne({ _id: hostMage.id }, { $set: { partyId: null } })
      await HeroModel.updateOne({ _id: paladins.find(hero => hero.partyId === null)!._id }, { $set: { partyId: hostParty } })
    }
    const free = () => HeroModel.find({ leagueId: id, partyId: null, heroClass: 'Paladin' })
    const theirs = (await heroesOf(id, aliceParty)).find(hero => hero.heroClass === 'Paladin') ?? null
    const asked = theirs?.id ?? (await free())[0]!.id
    if (!theirs) {
      const aliceMage = (await heroesOf(id, aliceParty)).find(hero => hero.heroClass === 'Mage')!
      await HeroModel.updateOne({ _id: aliceMage.id }, { $set: { partyId: null } })
      await HeroModel.updateOne({ _id: asked }, { $set: { partyId: aliceParty } })
    }
    const give = (await heroesOf(id, hostParty)).filter(hero => hero.heroClass !== 'Paladin')
    const { body: sent, status } = await offer(host, id, { toPartyId: aliceParty, offered: [give[0]!.id], requested: [asked] })
    expect(status).toBe(201)

    // Host claims a second Paladin: taking alice's now would make three.
    const claimed = await host.post(`/api/leagues/${id}/claims`, { heroId: (await free())[0]!.id, dropHeroId: give[1]!.id })
    expect(claimed.status).toBe(200)
    const res = await alice.post(`/api/leagues/${id}/trades/${String(sent.id)}/accept`)
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('Host Party can have at most 2 Paladins')
    expect((await HeroModel.findById(asked))!.partyId?.toString()).toBe(aliceParty)
    expect((await TradeModel.findById(sent.id))!.status).toBe('open')
  })

  it('lets only one of two offers sharing a hero through when both are accepted at once', async () => {
    const { id, hostParty, aliceParty, parties } = await league([bob])
    const bobParty = parties[2]!
    const [give] = await heroesOf(id, hostParty)
    const [aliceHero] = await heroesOf(id, aliceParty)
    const [bobHero] = await heroesOf(id, bobParty)
    const { body: toAlice } = await offer(host, id, { toPartyId: aliceParty, offered: [give!.id], requested: [aliceHero!.id] })
    const { body: toBob } = await offer(host, id, { toPartyId: bobParty, offered: [give!.id], requested: [bobHero!.id] })
    const results = await Promise.all([
      alice.post(`/api/leagues/${id}/trades/${String(toAlice.id)}/accept`),
      bob.post(`/api/leagues/${id}/trades/${String(toBob.id)}/accept`)
    ])
    expect(results.map(res => res.status).sort()).toEqual([200, 409])
    expect(await heroesOf(id, hostParty)).toHaveLength(10)
    expect(await TradeModel.countDocuments({ leagueId: id, status: 'accepted' })).toBe(1)
  })

  it('refuses while a due battle is unresolved, changing nothing', async () => {
    const { id, hostParty, aliceParty } = await league()
    const [give] = await heroesOf(id, hostParty)
    const [want] = await heroesOf(id, aliceParty)
    const { body: sent } = await offer(host, id, { toPartyId: aliceParty, offered: [give!.id], requested: [want!.id] })
    // A week becomes due, but nothing has resolved it yet: accept goes straight to the service.
    const { acceptTrade } = await import('../src/modules/trades/trade.service.js')
    const { AccountModel } = await import('../src/modules/accounts/account.model.js')
    await makeWeeksDue(id, 1)
    const account = (await AccountModel.findOne({ authSub: alice.sub }))!
    await expect(acceptTrade(account, id, String(sent.id), [])).rejects.toThrow('A battle is being resolved. Try again in a moment.')
    expect((await HeroModel.findById(give!.id))!.partyId?.toString()).toBe(hostParty)
    expect((await TradeModel.findById(sent.id))!.status).toBe('open')
  })
})
