import { z } from 'zod'
import type { DefenseStatLine, OffenseStatLine } from '../scoring/scoring.js'
import { FANTASY_POSITIONS, type FantasyPosition } from './stats.models.js'

/*
 * Parsing and transformation of nflverse CSV data (https://github.com/nflverse/nflverse-data, CC-BY-4.0).
 * Everything here is pure: rows in, documents out. CSV content is untrusted and validated row by row.
 */

const RELEASES = 'https://github.com/nflverse/nflverse-data/releases/download'

export const nflverseUrls = {
  playerWeeks: (season: number) => `${RELEASES}/stats_player/stats_player_week_${String(season)}.csv`,
  teamWeeks: (season: number) => `${RELEASES}/stats_team/stats_team_week_${String(season)}.csv`,
  games: () => `${RELEASES}/schedules/games.csv`
}

export const FIRST_AVAILABLE_SEASON = 1999

/**
 * Relocated franchises. nflverse stats files always use the current code, while the schedule
 * keeps the code used that season. We store current codes so a franchise's history is one team.
 */
const RELOCATED_FRANCHISES: Readonly<Record<string, string>> = { STL: 'LA', SD: 'LAC', OAK: 'LV' }

export const toFranchiseCode = (team: string) => RELOCATED_FRANCHISES[team] ?? team

/** Position groups whose fumble-return TDs belong to the defense rather than the offense. */
const DEFENSIVE_POSITION_GROUPS = new Set(['DL', 'LB', 'DB'])

export type CsvRow = Record<string, string | undefined>

// nflverse writes missing values as "" or "NA"; for stat columns those mean zero.
const stat = z.preprocess(
  value => (value === undefined || value === '' || value === 'NA' ? 0 : Number(value)),
  z.number()
)
const requiredText = z.string().trim().min(1)
const integer = z.coerce.number().int()

const PlayerWeekRow = z.object({
  player_id: requiredText,
  player_display_name: requiredText,
  position: z.string().optional(),
  position_group: z.string().optional(),
  season: integer,
  week: integer,
  season_type: z.string(),
  game_id: requiredText,
  team: requiredText,
  opponent_team: requiredText,
  passing_yards: stat,
  passing_tds: stat,
  passing_interceptions: stat,
  passing_2pt_conversions: stat,
  rushing_yards: stat,
  rushing_tds: stat,
  rushing_2pt_conversions: stat,
  receptions: stat,
  receiving_yards: stat,
  receiving_tds: stat,
  receiving_2pt_conversions: stat,
  sack_fumbles_lost: stat,
  rushing_fumbles_lost: stat,
  receiving_fumbles_lost: stat,
  special_teams_tds: stat,
  fumble_recovery_tds: stat
})
type PlayerWeekRow = z.infer<typeof PlayerWeekRow>

const TeamWeekRow = z.object({
  team: requiredText,
  season: integer,
  week: integer,
  season_type: z.string(),
  game_id: requiredText,
  opponent_team: requiredText,
  def_sacks: stat,
  def_interceptions: stat,
  fumble_recovery_opp: stat,
  def_tds: stat,
  fumble_recovery_tds: stat,
  special_teams_tds: stat,
  def_safeties: stat,
  def_punt_blocks: stat,
  def_fg_blocks: stat,
  def_pat_blocks: stat
})

const GameRow = z.object({
  game_id: requiredText,
  home_team: requiredText,
  away_team: requiredText,
  // Blank for games not yet played
  home_score: z.string().optional(),
  away_score: z.string().optional()
})

export interface PlayerWeekDoc {
  playerId: string
  playerName: string
  season: number
  seasonType: 'REG'
  week: number
  gameId: string
  team: string
  opponent: string
  position: FantasyPosition
  stats: OffenseStatLine
}

export interface DefenseWeekDoc {
  team: string
  season: number
  seasonType: 'REG'
  week: number
  gameId: string
  opponent: string
  stats: DefenseStatLine
}

export interface GameScore {
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
}

/**
 * Validates every row (except those `skip` excludes), reporting the first bad row
 * by its 1-based data line number.
 */
function parseRows<T extends z.ZodType>(
  schema: T,
  rows: readonly CsvRow[],
  label: string,
  skip: (row: CsvRow) => boolean = () => false
): z.infer<T>[] {
  return rows.flatMap((row, index) => {
    if (skip(row)) return []
    const result = schema.safeParse(row)
    if (!result.success) {
      const issue = result.error.issues[0]
      throw new Error(`${label} row ${String(index + 1)}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? 'invalid'}`)
    }
    return [result.data]
  })
}

/**
 * The player file includes team-level rows with no player_id that carry only penalties and
 * uncredited safeties. Team safeties come from the team file, so these rows are not needed.
 */
const isTeamLevelRow = (row: CsvRow) => !row.player_id?.trim() || row.player_id === 'NA'

const parsePlayerRows = (rows: readonly CsvRow[]) => parseRows(PlayerWeekRow, rows, 'player stats', isTeamLevelRow)

const isFantasyPosition = (position: string | undefined): position is FantasyPosition =>
  (FANTASY_POSITIONS as readonly (string | undefined)[]).includes(position)

/** Regular-season weekly stat lines for fantasy-relevant positions. */
export function toPlayerWeekDocs(rows: readonly CsvRow[]): PlayerWeekDoc[] {
  return parsePlayerRows(rows)
    .filter(row => row.season_type === 'REG')
    .flatMap(row => {
      const position = row.position
      if (!isFantasyPosition(position)) return []
      return [
        {
          playerId: row.player_id,
          playerName: row.player_display_name,
          season: row.season,
          seasonType: 'REG' as const,
          week: row.week,
          gameId: row.game_id,
          team: row.team,
          opponent: row.opponent_team,
          position,
          stats: toOffenseStats(row)
        }
      ]
    })
}

function toOffenseStats(row: PlayerWeekRow): OffenseStatLine {
  return {
    passingYards: row.passing_yards,
    passingTds: row.passing_tds,
    interceptions: row.passing_interceptions,
    rushingYards: row.rushing_yards,
    rushingTds: row.rushing_tds,
    receptions: row.receptions,
    receivingYards: row.receiving_yards,
    receivingTds: row.receiving_tds,
    twoPointConversions: row.passing_2pt_conversions + row.rushing_2pt_conversions + row.receiving_2pt_conversions,
    fumblesLost: row.sack_fumbles_lost + row.rushing_fumbles_lost + row.receiving_fumbles_lost,
    specialTeamsTds: row.special_teams_tds,
    fumbleRecoveryTds: row.fumble_recovery_tds
  }
}

export function toGameScores(rows: readonly CsvRow[]): Map<string, GameScore> {
  const scores = new Map<string, GameScore>()
  for (const game of parseRows(GameRow, rows, 'games')) {
    const homeScore = Number(game.home_score)
    const awayScore = Number(game.away_score)
    // Skip unplayed games instead of treating a blank score as 0.
    if (!game.home_score || !game.away_score || !Number.isInteger(homeScore) || !Number.isInteger(awayScore)) continue
    scores.set(game.game_id, {
      homeTeam: toFranchiseCode(game.home_team),
      awayTeam: toFranchiseCode(game.away_team),
      homeScore,
      awayScore
    })
  }
  return scores
}

/**
 * Regular-season team defense stat lines.
 *
 * nflverse's team `def_tds` counts interception-return TDs only, and team `fumble_recovery_tds`
 * also includes offensive players recovering their own fumble in the end zone. Defensive TDs are
 * therefore: def_tds + fumble_recovery_tds - fumble-recovery TDs by non-defensive players.
 */
export function toDefenseWeekDocs(
  teamRows: readonly CsvRow[],
  playerRows: readonly CsvRow[],
  games: ReadonlyMap<string, GameScore>
): DefenseWeekDoc[] {
  const offensiveRecoveryTds = new Map<string, number>()
  for (const row of parsePlayerRows(playerRows)) {
    if (row.fumble_recovery_tds === 0 || DEFENSIVE_POSITION_GROUPS.has(row.position_group ?? '')) continue
    const key = `${row.game_id}|${row.team}`
    offensiveRecoveryTds.set(key, (offensiveRecoveryTds.get(key) ?? 0) + row.fumble_recovery_tds)
  }

  return parseRows(TeamWeekRow, teamRows, 'team stats')
    .filter(row => row.season_type === 'REG')
    .map(row => {
      const game = games.get(row.game_id)
      if (!game) throw new Error(`team stats: no final score for game ${row.game_id}`)
      const pointsAllowed = pointsAllowedBy(row.team, game, row.game_id)
      const ownRecoveries = offensiveRecoveryTds.get(`${row.game_id}|${row.team}`) ?? 0
      return {
        team: row.team,
        season: row.season,
        seasonType: 'REG' as const,
        week: row.week,
        gameId: row.game_id,
        opponent: row.opponent_team,
        stats: {
          sacks: row.def_sacks,
          interceptions: row.def_interceptions,
          fumbleRecoveries: row.fumble_recovery_opp,
          touchdowns: row.def_tds + row.fumble_recovery_tds - ownRecoveries + row.special_teams_tds,
          safeties: row.def_safeties,
          blockedKicks: row.def_punt_blocks + row.def_fg_blocks + row.def_pat_blocks,
          pointsAllowed
        }
      }
    })
}

function pointsAllowedBy(team: string, game: GameScore, gameId: string): number {
  if (team === game.homeTeam) return game.awayScore
  if (team === game.awayTeam) return game.homeScore
  throw new Error(`team stats: ${team} did not play in game ${gameId}`)
}
