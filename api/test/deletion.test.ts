import { describe, expect, it } from 'vitest'
import { AccountModel } from '../src/modules/accounts/account.model.js'
import { FORMER_PARTY_NAME } from '../src/modules/accounts/deletion.service.js'
import { ChatMessageModel } from '../src/modules/chat/chatMessage.model.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { as, draftedLeague, host } from './leagueHelpers.js'
import { seedStats } from './statsSeed.js'

const alice = as('auth0|alice')
const bob = as('auth0|bob')

const crest = { emblem: 'crown', banner: 'crimson' }

async function formingLeague(name = 'Forming League') {
  const created = await host.post('/api/leagues', { name, visibility: 'private', cadence: 'daily', maxParties: 6, party: { name: 'Host Party', crest } })
  return created.body as { id: string; pin: string }
}

const accountOf = (sub: string) => AccountModel.findOne({ authSub: sub })

describe('DELETE /api/account', () => {
  it('removes the account, its chat, and its parties in leagues still forming', async () => {
    const forming = await formingLeague()
    await alice.post('/api/leagues/join', { pin: forming.pin, party: { name: 'Alice Party', crest } })
    await alice.patch('/api/account', { displayName: 'Alice Smith' })
    await alice.post(`/api/leagues/${forming.id}/chat`, { body: 'Hello' })
    const hostMessage = (await host.post(`/api/leagues/${forming.id}/chat`, { body: 'Welcome' })).body as { id: string }
    await alice.post(`/api/leagues/${forming.id}/chat/${hostMessage.id}/report`)
    const aliceId = (await accountOf(alice.sub))!._id

    expect((await alice.delete('/api/account')).status).toBe(204)
    expect(await AccountModel.exists({ _id: aliceId })).toBeNull()
    expect(await PartyModel.exists({ accountId: aliceId })).toBeNull()
    expect((await LeagueModel.findById(forming.id))?.partyCount).toBe(1)
    expect(await ChatMessageModel.exists({ accountId: aliceId })).toBeNull()
    // Their report is withdrawn; the host's message stays.
    expect((await ChatMessageModel.findById(hostMessage.id))?.reportedBy).toEqual([])
  })

  it('keeps parties in drafted leagues playing, renamed and unlinked from any name', async () => {
    await seedStats()
    const id = await draftedLeague([alice, bob])
    expect((await LeagueModel.findById(id))?.status).toBe('active')
    await alice.patch('/api/account', { displayName: 'Alice Smith' })
    expect((await alice.delete('/api/account')).status).toBe(204)
    expect((await bob.delete('/api/account')).status).toBe(204)

    const names = (await PartyModel.find({ leagueId: id }).sort({ name: 1 })).map(party => party.name)
    expect(names).toEqual([FORMER_PARTY_NAME, `${FORMER_PARTY_NAME} 2`, 'Host Party'])
    const league = (await host.get(`/api/leagues/${id}`)).body as { parties: { name: string; owner: { displayName: string } }[] }
    expect(league.parties.map(party => party.owner.displayName).sort()).toEqual(['Adventurer', 'Former adventurer', 'Former adventurer'])
    expect(JSON.stringify(league)).not.toMatch(/Alice Smith|Member 0|Member 1/)
  })

  it('asks hosts to cancel the leagues they run first', async () => {
    await formingLeague('Saturday Crew')
    const res = await host.delete('/api/account')
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('Cancel the leagues you host first: Saturday Crew')
    expect(await accountOf(host.sub)).not.toBeNull()
  })

  it('lets hosts go once their leagues are canceled', async () => {
    const { id } = await formingLeague()
    await host.post(`/api/leagues/${id}/cancel`)
    expect((await host.delete('/api/account')).status).toBe(204)
    // Signing in again starts a fresh account.
    const fresh = (await host.get('/api/account')).body as { displayName: string }
    expect(fresh.displayName).toBe('Adventurer')
  })
})
