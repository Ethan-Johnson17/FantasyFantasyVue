import { parse } from 'csv-parse/sync'
import type { AnyBulkWriteOperation, mongo } from 'mongoose'
import {
  nflverseUrls,
  toDefenseWeekDocs,
  toGameScores,
  toPlayerWeekDocs,
  type CsvRow,
  type DefenseWeekDoc,
  type PlayerWeekDoc
} from './nflverse.js'
import {
  DefenseWeekStatModel,
  NflPlayerModel,
  PlayerWeekStatModel,
  type DefenseWeekStat,
  type NflPlayer,
  type PlayerWeekStat
} from './stats.models.js'

/** Where CSV rows come from. Injected so tests can use fixtures instead of the network. */
export type CsvLoader = (url: string) => Promise<CsvRow[]>

const BATCH_SIZE = 1000

export const fetchCsv: CsvLoader = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`Download failed (${String(response.status)}): ${url}`)
  return parse<CsvRow>(await response.text(), { columns: true, skip_empty_lines: true })
}

export interface SeasonImportResult {
  season: number
  players: number
  playerWeeks: number
  defenseWeeks: number
}

/**
 * Imports regular-season stats for the given seasons. Safe to re-run: every write is an upsert
 * keyed on natural identifiers, so repeated imports update rows instead of duplicating them.
 * Seasons should be imported in ascending order so player names and positions end up current.
 */
export async function importSeasons(seasons: readonly number[], loadCsv: CsvLoader = fetchCsv) {
  const games = toGameScores(await loadCsv(nflverseUrls.games()))
  const results: SeasonImportResult[] = []
  for (const season of [...seasons].sort((a, b) => a - b)) {
    const [playerRows, teamRows] = await Promise.all([
      loadCsv(nflverseUrls.playerWeeks(season)),
      loadCsv(nflverseUrls.teamWeeks(season))
    ])
    const playerWeeks = toPlayerWeekDocs(playerRows)
    const defenseWeeks = toDefenseWeekDocs(teamRows, playerRows, games)
    const players = await savePlayers(playerWeeks)
    await bulkWriteInBatches(PlayerWeekStatModel, playerWeeks.map(upsertPlayerWeek))
    await bulkWriteInBatches(DefenseWeekStatModel, defenseWeeks.map(upsertDefenseWeek))
    results.push({ season, players, playerWeeks: playerWeeks.length, defenseWeeks: defenseWeeks.length })
  }
  return results
}

async function savePlayers(playerWeeks: readonly PlayerWeekDoc[]): Promise<number> {
  // Latest week wins, so a mid-season position change is reflected.
  const latest = new Map<string, PlayerWeekDoc>()
  for (const line of [...playerWeeks].sort((a, b) => a.week - b.week)) latest.set(line.playerId, line)

  const operations: AnyBulkWriteOperation<NflPlayer>[] = [...latest.values()].map(line => ({
    updateOne: {
      filter: { _id: line.playerId },
      update: { $set: { name: line.playerName, position: line.position } },
      upsert: true
    }
  }))
  await bulkWriteInBatches(NflPlayerModel, operations)
  return operations.length
}

function upsertPlayerWeek({ playerName: _name, ...line }: PlayerWeekDoc): AnyBulkWriteOperation<PlayerWeekStat> {
  const { playerId, season, seasonType, week } = line
  return { replaceOne: { filter: { playerId, season, seasonType, week }, replacement: line, upsert: true } }
}

function upsertDefenseWeek(line: DefenseWeekDoc): AnyBulkWriteOperation<DefenseWeekStat> {
  const { team, season, seasonType, week } = line
  return { replaceOne: { filter: { team, season, seasonType, week }, replacement: line, upsert: true } }
}

async function bulkWriteInBatches<T extends mongo.Document>(
  model: { bulkWrite(operations: AnyBulkWriteOperation<T>[], options: { ordered: boolean }): Promise<unknown> },
  operations: AnyBulkWriteOperation<T>[]
): Promise<void> {
  for (let start = 0; start < operations.length; start += BATCH_SIZE) {
    await model.bulkWrite(operations.slice(start, start + BATCH_SIZE), { ordered: false })
  }
}
