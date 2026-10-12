import { describe, expect, it } from 'vitest'
import { importSeasons } from '../src/modules/stats/importer.js'
import { DefenseWeekStatModel, NflPlayerModel, PlayerWeekStatModel } from '../src/modules/stats/stats.models.js'
import { fixtureLoader } from './fixtures.js'

describe('importSeasons', () => {
  it('stores players, weekly lines, and defenses', async () => {
    const [result] = await importSeasons([2023], fixtureLoader)
    expect(result).toEqual({ season: 2023, players: 7, playerWeeks: 7, defenseWeeks: 18 })

    expect(await NflPlayerModel.countDocuments()).toBe(7)
    expect(await PlayerWeekStatModel.countDocuments()).toBe(7)
    expect(await DefenseWeekStatModel.countDocuments()).toBe(18)

    const mccaffrey = await PlayerWeekStatModel.findOne({ week: 1, team: 'SF' }).lean()
    expect(mccaffrey).toMatchObject({ season: 2023, seasonType: 'REG', position: 'RB', opponent: 'PIT' })
    expect(mccaffrey?.stats).toMatchObject({ rushingYards: 152, rushingTds: 1, receptions: 3, receivingYards: 17 })

    const player = await NflPlayerModel.findById(mccaffrey?.playerId).lean()
    expect(player).toMatchObject({ name: 'Christian McCaffrey', position: 'RB', draft: { season: 2017, round: 1, pick: 8 } })

    // Gipson was undrafted, so has no draft slot.
    const gipson = await NflPlayerModel.findOne({ name: 'Xavier Gipson' }).lean()
    expect(gipson?.draft).toBeUndefined()
  })

  it('is idempotent: re-importing updates rows instead of duplicating them', async () => {
    await importSeasons([2023], fixtureLoader)
    await importSeasons([2023], fixtureLoader)
    expect(await NflPlayerModel.countDocuments()).toBe(7)
    expect(await PlayerWeekStatModel.countDocuments()).toBe(7)
    expect(await DefenseWeekStatModel.countDocuments()).toBe(18)
  })

  it('surfaces download failures', async () => {
    const failing = () => Promise.reject(new Error('Download failed (404)'))
    await expect(importSeasons([2023], failing)).rejects.toThrow(/404/)
  })
})
