import { describe, expect, it } from 'vitest'
import { CHAT_PAGE_SIZE, cleanMessage } from '../src/modules/chat/chat.service.js'
import { CHAT_MESSAGES_PER_MINUTE } from '../src/modules/chat/chat.routes.js'
import { CHAT_MESSAGE_MAX, CHAT_RETENTION_MS, ChatMessageModel } from '../src/modules/chat/chatMessage.model.js'
import { filterProfanity } from '../src/modules/chat/profanity.js'
import { LeagueModel } from '../src/modules/leagues/league.model.js'
import { as, draftedLeague, host, makeWeeksDue } from './leagueHelpers.js'
import { seedStats } from './statsSeed.js'

const alice = as('auth0|alice')
const bob = as('auth0|bob')
const outsider = as('auth0|outsider')

interface Message {
  id: string
  body: string
  at: string
  author: { partyId: string; name: string; crest: { emblem: string; banner: string } } | null
  mine: boolean
  reportedByMe: boolean
  reports: number | null
}
interface Page {
  messages: Message[]
  hasMore: boolean
  canModerate: boolean
  readOnly: boolean
}

const chatUrl = (id: string) => `/api/leagues/${id}/chat`
const pageOf = async (player: typeof alice, id: string, query = '') => (await player.get(chatUrl(id) + query)).body as Page
const post = async (player: typeof alice, id: string, body: string) => {
  const res = await player.post(chatUrl(id), { body })
  expect(res.status).toBe(201)
  return res.body as Message
}

/** A league still gathering parties, so members can leave. */
async function formingLeague() {
  const created = await host.post('/api/leagues', {
    name: 'Forming League',
    visibility: 'private',
    cadence: 'daily',
    maxParties: 6,
    party: { name: 'Host Party', crest: { emblem: 'crown', banner: 'crimson' } }
  })
  const { id, pin } = created.body as { id: string; pin: string }
  await alice.post('/api/leagues/join', { pin, party: { name: 'Alice Party', crest: { emblem: 'crown', banner: 'crimson' } } })
  return id
}

describe('league chat', () => {
  it('lets members post and read, oldest first, signed with their party', async () => {
    const id = await draftedLeague([alice])
    await post(host, id, 'Welcome, adventurers')
    const mine = await post(alice, id, '  Glad to be here  ')
    expect(mine).toMatchObject({ body: 'Glad to be here', mine: true, reportedByMe: false, reports: null })
    expect(mine.author).toMatchObject({ name: 'Member 0', crest: { emblem: 'crown', banner: 'crimson' } })

    const page = await pageOf(alice, id)
    expect(page.messages.map(m => m.body)).toEqual(['Welcome, adventurers', 'Glad to be here'])
    expect(page.messages.map(m => m.mine)).toEqual([false, true])
    expect(page).toMatchObject({ hasMore: false, canModerate: false, readOnly: false })
    expect((await pageOf(host, id)).canModerate).toBe(true)
    // Never exposes accounts.
    expect(JSON.stringify(page)).not.toMatch(/accountId|auth0/)
  })

  it('is members only, even in public leagues', async () => {
    const id = await draftedLeague([alice])
    await LeagueModel.updateOne({ _id: id }, { $set: { visibility: 'public' } })
    expect((await outsider.get(chatUrl(id))).status).toBe(404)
    expect((await outsider.post(chatUrl(id), { body: 'hello' })).status).toBe(404)
  })

  it('masks profanity before saving, so the original is never kept', async () => {
    const id = await draftedLeague([alice])
    const message = await post(alice, id, 'What a fucking battle')
    expect(message.body).toBe('What a ****ing battle')
    expect((await ChatMessageModel.findById(message.id))?.body).toBe('What a ****ing battle')
  })

  it('catches look-alike spellings but leaves innocent words and mild ones alone', () => {
    expect(filterProfanity('sh1t happens')).toBe('**** happens')
    expect(filterProfanity('The assassin from Scunthorpe')).toBe('The assassin from Scunthorpe')
    expect(filterProfanity('damn, what the hell')).toBe('damn, what the hell')
  })

  it('cleans messages: no control characters, at most one blank line, nothing empty', async () => {
    expect(cleanMessage('a\u0007b\r\n\n\n\nc')).toBe('ab\n\nc')
    const id = await draftedLeague([alice])
    expect((await alice.post(chatUrl(id), { body: '   ' })).status).toBe(400)
    expect((await alice.post(chatUrl(id), { body: '\u0000\u0001' })).status).toBe(400)
    expect((await alice.post(chatUrl(id), { body: 'x'.repeat(CHAT_MESSAGE_MAX + 1) })).status).toBe(400)
    expect((await alice.post(chatUrl(id), { body: 'hi', extra: true })).status).toBe(400)
    await post(alice, id, 'x'.repeat(CHAT_MESSAGE_MAX))
  })

  it('pages back through older messages', async () => {
    const id = await draftedLeague([alice])
    // Past the posting limit, so the rest go straight in, after the first in id order.
    const first = await ChatMessageModel.findById((await post(alice, id, 'Message 1')).id).lean()
    const { _id, ...author } = first!
    for (let n = 2; n <= CHAT_PAGE_SIZE + 5; n++) await ChatMessageModel.create({ ...author, body: `Message ${String(n)}` })
    const latest = await pageOf(alice, id)
    expect(latest.messages).toHaveLength(CHAT_PAGE_SIZE)
    expect(latest.messages.at(-1)!.body).toBe(`Message ${String(CHAT_PAGE_SIZE + 5)}`)
    expect(latest.hasMore).toBe(true)

    const older = await pageOf(alice, id, `?before=${latest.messages[0]!.id}`)
    expect(older.messages.map(m => m.body)).toEqual(['Message 1', 'Message 2', 'Message 3', 'Message 4', 'Message 5'])
    expect(older.hasMore).toBe(false)
    expect((await alice.get(`${chatUrl(id)}?before=nope`)).status).toBe(400)
  })

  it('lets authors remove their own messages and the host remove anyone’s', async () => {
    const id = await draftedLeague([alice, bob])
    const first = await post(alice, id, 'Oops, wrong league')
    const second = await post(alice, id, 'Something rude')
    expect((await bob.delete(`${chatUrl(id)}/${first.id}`)).status).toBe(403)
    expect((await alice.delete(`${chatUrl(id)}/${first.id}`)).status).toBe(204)
    expect((await host.delete(`${chatUrl(id)}/${second.id}`)).status).toBe(204)
    expect((await pageOf(bob, id)).messages).toEqual([])
    expect((await host.delete(`${chatUrl(id)}/${second.id}`)).status).toBe(404)
  })

  it('doesn’t reach messages in other leagues', async () => {
    const mine = await draftedLeague([alice])
    const other = await draftedLeague([bob])
    const message = await post(bob, other, 'Our league only')
    // The host is in both leagues; each chat shows only its own messages.
    expect((await pageOf(host, mine)).messages).toEqual([])
    expect((await pageOf(host, other)).messages).toHaveLength(1)
    expect((await host.delete(`${chatUrl(mine)}/${message.id}`)).status).toBe(404)
    expect((await alice.post(`${chatUrl(mine)}/${message.id}/report`)).status).toBe(404)
  })

  it('lets members report a message for the host, once each, and never their own', async () => {
    const id = await draftedLeague([alice, bob])
    const message = await post(alice, id, 'Bob plays like a goblin')
    expect((await alice.post(`${chatUrl(id)}/${message.id}/report`)).status).toBe(400)

    const reported = (await bob.post(`${chatUrl(id)}/${message.id}/report`)).body as Message
    expect(reported).toMatchObject({ reportedByMe: true, reports: null })
    await bob.post(`${chatUrl(id)}/${message.id}/report`)

    // Only the host sees how many reports there are.
    expect((await pageOf(host, id)).messages[0]).toMatchObject({ reports: 1, reportedByMe: false })
    expect((await pageOf(alice, id)).messages[0]).toMatchObject({ reports: null, reportedByMe: false })
    expect((await pageOf(bob, id)).messages[0]).toMatchObject({ reports: null, reportedByMe: true })
  })

  it('shows former members’ messages without a name', async () => {
    const id = await formingLeague()
    await post(alice, id, 'See you all at the draft')
    expect((await alice.post(`/api/leagues/${id}/leave`)).status).toBe(204)
    const [message] = (await pageOf(host, id)).messages
    expect(message).toMatchObject({ body: 'See you all at the draft', author: null })
  })

  it('limits how fast one member can post', async () => {
    const id = await draftedLeague([alice])
    for (let n = 0; n < CHAT_MESSAGES_PER_MINUTE; n++) await post(alice, id, `Spam ${String(n)}`)
    expect((await alice.post(chatUrl(id), { body: 'One more' })).status).toBe(429)
    await post(host, id, 'Others can still talk')
  })

  it('doesn’t run the league’s draft or battles while polling', async () => {
    const created = await host.post('/api/leagues', {
      name: 'Draft Soon',
      visibility: 'private',
      cadence: 'daily',
      maxParties: 6,
      party: { name: 'Host Party', crest: { emblem: 'crown', banner: 'crimson' } }
    })
    const { id, pin } = created.body as { id: string; pin: string }
    await alice.post('/api/leagues/join', { pin, party: { name: 'Alice Party', crest: { emblem: 'crown', banner: 'crimson' } } })
    await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })
    await LeagueModel.updateOne({ _id: id }, { $set: { draftAt: new Date(Date.now() - 1000) } })
    await pageOf(host, id)
    expect((await LeagueModel.findById(id))?.draftPicks).toBeUndefined()
  })
})

describe('chat retention', () => {
  const expiries = async (id: string) => (await ChatMessageModel.find({ leagueId: id })).map(m => m.expiresAt?.getTime() ?? null)

  it('keeps messages while the league runs, then deletes them a set time after it’s canceled', async () => {
    const id = await draftedLeague([alice])
    await post(alice, id, 'Before the end')
    expect(await expiries(id)).toEqual([null])

    expect((await host.post(`/api/leagues/${id}/cancel`)).status).toBe(200)
    const endedAt = (await LeagueModel.findById(id))!.endedAt!.getTime()
    expect(await expiries(id)).toEqual([endedAt + CHAT_RETENTION_MS])
    // Canceled leagues' chat is read-only.
    expect((await alice.post(chatUrl(id), { body: 'Anyone here?' })).status).toBe(409)
    expect((await pageOf(alice, id)).readOnly).toBe(true)
  })

  it('starts the clock when the season ends, including for messages after it', async () => {
    await seedStats()
    const id = await draftedLeague([alice])
    await post(alice, id, 'Good luck all')
    await makeWeeksDue(id, 14)
    await host.get(`/api/leagues/${id}`)
    const league = (await LeagueModel.findById(id))!
    expect(league.status).toBe('complete')
    const expiresAt = league.endedAt!.getTime() + CHAT_RETENTION_MS

    await post(alice, id, 'GG')
    expect(await expiries(id)).toEqual([expiresAt, expiresAt])
  })

  it('has MongoDB delete expired messages', async () => {
    const indexes = await ChatMessageModel.collection.indexes()
    expect(indexes.find(index => index.key.expiresAt === 1)).toMatchObject({ expireAfterSeconds: 0 })
  })
})
