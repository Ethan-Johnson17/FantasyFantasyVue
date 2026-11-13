import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { alice, draftedCrossover, fixedRoster, kickOff } from './crossoverLeague.js'
import { seedCrossover } from './crossoverSeed.js'
import { host } from './leagueHelpers.js'

/* Trades in Crossover (docs/TRADES_SPEC.md): kickoff locks and the Quest party. */

beforeEach(async () => {
  await seedCrossover()
})

async function league() {
  const id = await draftedCrossover()
  const roster = await fixedRoster(id)
  const hostParty = (await PartyModel.findOne({ leagueId: id, name: 'Host Party' }))!
  // A host hero yet to play: KC is the only game that kicks off in these tests.
  const hostHeroes = await HeroModel.find({ leagueId: id, partyId: hostParty._id })
  const yetToPlay = (heroClass: string) => hostHeroes.find(hero => hero.player?.team !== 'KC' && hero.heroClass === heroClass)!.id
  return { id, ...roster, hostParty, yetToPlay }
}

describe('trades in Crossover', () => {
  it('won’t trade a player whose game this week has kicked off, from either side', async () => {
    const { id, ids, party, yetToPlay, hostParty } = await league()
    await kickOff('KC')
    const asked = await host.post(`/api/leagues/${id}/trades`, { toPartyId: party.id, offered: [yetToPlay('Mage')], requested: [ids.qb] })
    expect(asked.status).toBe(409)
    expect(asked.body.error.message).toMatch(/game this week has kicked off: trade them after the week$/)

    // A host KC player, for alice's DET player of the same class (on bye)
    const kc = (await HeroModel.findOne({ leagueId: id, partyId: hostParty._id, 'player.team': 'KC' }))!
    const same = { Mage: ids['bench-qb'], Warrior: ids.rb1, Rogue: ids['bench-te'] } as Record<string, string>
    const offered = await host.post(`/api/leagues/${id}/trades`, { toPartyId: party.id, offered: [kc.id], requested: [same[kc.heroClass] ?? ids.rb1] })
    expect(offered.status).toBe(409)
    expect(offered.body.error.message).toBe(`${kc.name}’s game this week has kicked off: trade them after the week`)
  })

  it('puts an arriving hero in a departing Quest party member’s place, and in their starting slot', async () => {
    const { id, ids, party, hostParty, ...rest } = await league()
    const yetToPlay = rest.yetToPlay('Warrior')
    const { body: sent } = await host.post(`/api/leagues/${id}/trades`, { toPartyId: party.id, offered: [yetToPlay], requested: [ids.rb2] })
    const res = await alice.post(`/api/leagues/${id}/trades/${String(sent.id)}/accept`)
    expect(res.status).toBe(200)

    const after = (await PartyModel.findById(party._id))!
    const questParty = after.questParty!.map(String)
    expect(questParty).toHaveLength(5)
    expect(questParty).toContain(yetToPlay)
    expect(questParty).not.toContain(ids.rb2)
    expect(after.lineup?.find(entry => entry.slot === 'rb2')?.heroId.toString()).toBe(yetToPlay)
    expect((await HeroModel.findById(ids.rb2))!.partyId?.toString()).toBe(hostParty.id)
  })
})
