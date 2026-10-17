import { beforeEach, describe, expect, it } from 'vitest'
import { HeroModel } from '../src/modules/heroes/hero.model.js'
import { PartyModel } from '../src/modules/leagues/party.model.js'
import { WeekResultModel } from '../src/modules/season/weekResult.model.js'
import { DefenseWeekStatModel, PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'
import { as, draftedLeague, host, makeWeeksDue, type Player } from './leagueHelpers.js'
import { SEEDED_SEASON, seedStats } from './statsSeed.js'

const alice = as('auth0|alice')
const bob = as('auth0|bob')

interface Outlook {
  ranking: { ranked: number; pool: number } | null
  nextBattle: {
    week: number
    opponent: { name: string } | null
    monster: string | null
    noChampion: boolean
    restingStarters: number
  } | null
  lastBattle: { week: number; outcome: string; myTotal: number; theirTotal: number; opponentName: string } | null
}

async function outlookOf(player: Player, id: string): Promise<Outlook> {
  const mine = (await player.get('/api/leagues/mine')).body as { id: string; outlook: Outlook }[]
  return mine.find(league => league.id === id)!.outlook
}

beforeEach(async () => {
  await seedStats()
})

describe('My leagues outlook', () => {
  it('shows ranking progress while the draft is scheduled', async () => {
    const created = await host.post('/api/leagues', {
      name: 'Drafting League',
      visibility: 'private',
      cadence: 'daily',
      maxParties: 4,
      party: { name: 'Host Party', crest: { emblem: 'crown', banner: 'crimson' } }
    })
    const { id, pin } = created.body as { id: string; pin: string }
    await alice.post('/api/leagues/join', { pin, party: { name: 'Elves', crest: { emblem: 'moon', banner: 'sapphire' } } })
    expect(await outlookOf(alice, id)).toEqual({ ranking: null, nextBattle: null, lastBattle: null })

    await host.post(`/api/leagues/${id}/draft`, { draftAt: new Date(Date.now() + 3_600_000).toISOString() })
    const heroes = (await alice.get(`/api/leagues/${id}/heroes`)).body as { id: string }[]
    await alice.put(`/api/leagues/${id}/rankings`, { heroIds: heroes.slice(0, 3).map(hero => hero.id) })
    expect((await outlookOf(alice, id)).ranking).toEqual({ ranked: 3, pool: heroes.length })
  })

  it('flags a missing Champion and resting starters before the next battle', async () => {
    const id = await draftedLeague([alice])
    let outlook = await outlookOf(alice, id)
    expect(outlook.ranking).toBeNull()
    expect(outlook.nextBattle).toMatchObject({ week: 1, opponent: { name: 'Host Party' }, monster: null, noChampion: true, restingStarters: 0 })

    const starter = Object.values(((await alice.get(`/api/leagues/${id}/lineup`)).body as { lineup: Record<string, string> }).lineup)[0]!
    await alice.put(`/api/leagues/${id}/champion`, { heroId: starter })
    const hero = (await HeroModel.findById(starter).select('+source').lean())!
    if (hero.source.kind === 'player') await PlayerWeekStatModel.deleteMany({ playerId: hero.source.id, season: SEEDED_SEASON, week: 1 })
    else await DefenseWeekStatModel.deleteMany({ team: hero.source.id, season: SEEDED_SEASON, week: 1 })

    outlook = await outlookOf(alice, id)
    expect(outlook.nextBattle).toMatchObject({ noChampion: false, restingStarters: 1 })
    expect(JSON.stringify(outlook)).not.toMatch(new RegExp(`source|season|${String(SEEDED_SEASON)}`))
  })

  it('shows the last result from my side, then the next battle', async () => {
    const id = await draftedLeague([alice])
    await makeWeeksDue(id, 1)
    const outlook = await outlookOf(alice, id)
    expect(outlook.nextBattle?.week).toBe(2)

    const stored = (await WeekResultModel.findOne({ leagueId: id, week: 1 }).lean())!.matchups[0]!
    const mine = (await PartyModel.findOne({ leagueId: id, name: 'Member 0' }).lean())!
    const amHome = stored.home.partyId.equals(mine._id)
    const expected = stored.outcome === 'draw' ? 'draw' : (stored.outcome === 'home') === amHome ? 'win' : 'loss'
    expect(outlook.lastBattle).toEqual({
      week: 1,
      outcome: expected,
      myTotal: amHome ? stored.home.total : stored.away!.total,
      theirTotal: amHome ? stored.away!.total : stored.home.total,
      opponentName: 'Host Party'
    })
  })

  it('names the monster for the party without an opponent', async () => {
    const id = await draftedLeague([alice, bob])
    const outlooks = await Promise.all([host, alice, bob].map(player => outlookOf(player, id)))
    const facing = outlooks.filter(outlook => outlook.nextBattle?.opponent === null)
    expect(facing).toHaveLength(1)
    expect(facing[0]!.nextBattle?.monster).toBeTruthy()
  })
})
