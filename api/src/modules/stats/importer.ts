import { parse } from 'csv-parse/sync'
import type { AnyBulkWriteOperation, mongo } from 'mongoose'
import {
  nflverseUrls,
  toDefenseWeekDocs,
  toDraftSlots,
  toGameScores,
  toPlayerWeekDocs,
  toScheduleDocs,
  type CsvRow,
  type DefenseWeekDoc,
  type DraftSlot,
  type NflGameDoc,
  type PlayerWeekDoc
} from './nflverse.js'
import { currentNflSeason } from './seasons.js'
import {
  DefenseWeekStatModel,
  NflGameModel,
  NflPlayerModel,
  PlayerWeekStatModel,
  StatsImportModel,
  type DefenseWeekStat,
  type NflPlayer,
  type PlayerWeekStat
} from './stats.models.js'

/** Where CSV rows come from. Injected so tests can use fixtures instead of the network. */
export type CsvLoader = (url: string) => Promise<CsvRow[]>

const BATCH_SIZE = 1000

/** nflverse hasn't published this file (yet): a season's stats appear once its first games are played. */
export class CsvNotFound extends Error {}

export const fetchCsv: CsvLoader = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (response.status === 404) throw new CsvNotFound(`Not published yet: ${url}`)
  if (!response.ok) throw new Error(`Download failed (${String(response.status)}): ${url}`)
  return parse<CsvRow>(await response.text(), { columns: true, skip_empty_lines: true })
}

export interface SeasonImportResult {
  season: number
  players: number
  playerWeeks: number
  defenseWeeks: number
  /** Regular-season games on the schedule, and how many are final */
  games: number
  finalGames: number
}

export interface ImportOptions {
  /** The current time, which decides whether a season is still in progress. Injected for tests. */
  now?: Date
}

/**
 * Imports regular-season stats for the given seasons. Safe to re-run: every write is an upsert
 * keyed on natural identifiers, so repeated imports update rows instead of duplicating them.
 * Seasons should be imported in ascending order so player names and positions end up current.
 *
 * The season in progress (see currentNflSeason) is imported as far as it has been played: stats files
 * nflverse hasn't published yet count as empty, and a defense line whose game has no final score yet is
 * left for the next import. Re-importing it during game days brings in each game as it finishes.
 */
export async function importSeasons(seasons: readonly number[], loadCsv: CsvLoader = fetchCsv, { now = new Date() }: ImportOptions = {}) {
  const sorted = [...seasons].sort((a, b) => a - b)
  const [gameRows, draftSlots] = await Promise.all([loadCsv(nflverseUrls.games()), loadCsv(nflverseUrls.draftPicks()).then(toDraftSlots)])
  const games = toGameScores(gameRows)
  const schedule = toScheduleDocs(gameRows, new Set(sorted))
  const results: SeasonImportResult[] = []
  for (const season of sorted) {
    const inProgress = season >= currentNflSeason(now)
    const load = (url: string) => (inProgress ? loadCsv(url).catch(emptyIfUnpublished) : loadCsv(url))
    const [playerRows, teamRows] = await Promise.all([load(nflverseUrls.playerWeeks(season)), load(nflverseUrls.teamWeeks(season))])
    const playerWeeks = toPlayerWeekDocs(playerRows)
    const defenseWeeks = toDefenseWeekDocs(teamRows, playerRows, games, inProgress)
    const seasonGames = schedule.filter(game => game.season === season)
    const players = await savePlayers(playerWeeks, draftSlots)
    await bulkWriteInBatches(PlayerWeekStatModel, playerWeeks.map(upsertPlayerWeek))
    await bulkWriteInBatches(DefenseWeekStatModel, defenseWeeks.map(upsertDefenseWeek))
    await bulkWriteInBatches(NflGameModel, seasonGames.map(upsertGame))
    const result = {
      season,
      players,
      playerWeeks: playerWeeks.length,
      defenseWeeks: defenseWeeks.length,
      games: seasonGames.length,
      finalGames: seasonGames.filter(game => game.homeScore !== null).length
    }
    const { season: _id, players: _players, ...counts } = result
    await StatsImportModel.updateOne({ _id }, { $set: { importedAt: new Date(), ...counts } }, { upsert: true })
    results.push(result)
  }
  return results
}

function emptyIfUnpublished(error: unknown): CsvRow[] {
  if (error instanceof CsvNotFound) return []
  throw error
}

async function savePlayers(
  playerWeeks: readonly PlayerWeekDoc[],
  draftSlots: ReadonlyMap<string, DraftSlot>
): Promise<number> {
  // Latest week wins, so a mid-season position change is reflected.
  const latest = new Map<string, PlayerWeekDoc>()
  for (const line of [...playerWeeks].sort((a, b) => a.week - b.week)) latest.set(line.playerId, line)

  const operations: AnyBulkWriteOperation<NflPlayer>[] = [...latest.values()].map(line => ({
    updateOne: {
      filter: { _id: line.playerId },
      update: {
        $set: {
          name: line.playerName,
          position: line.position,
          ...(draftSlots.has(line.playerId) ? { draft: draftSlots.get(line.playerId) } : {})
        }
      },
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

function upsertGame(game: NflGameDoc): AnyBulkWriteOperation<NflGameDoc> {
  return { replaceOne: { filter: { _id: game._id }, replacement: game, upsert: true } }
}

async function bulkWriteInBatches<T extends mongo.Document>(
  model: { bulkWrite(operations: AnyBulkWriteOperation<T>[], options: { ordered: boolean }): Promise<unknown> },
  operations: AnyBulkWriteOperation<T>[]
): Promise<void> {
  for (let start = 0; start < operations.length; start += BATCH_SIZE) {
    await model.bulkWrite(operations.slice(start, start + BATCH_SIZE), { ordered: false })
  }
}
