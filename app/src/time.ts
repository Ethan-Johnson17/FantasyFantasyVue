import type { Cadence, LeagueMode } from './api/types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
export const CADENCE_MS: Record<Cadence, number> = { daily: DAY, weekly: 7 * DAY }
export const SEASON_WEEKS = 14

/** "in 6h 12m", "in 1 day 4 hours", "in 3 days", or "now" for times already passed. */
export function timeUntil(when: Date, now: Date = new Date()): string {
  const ms = when.getTime() - now.getTime()
  if (ms <= 0) return 'now'
  if (ms < HOUR) return `in ${String(Math.max(1, Math.floor(ms / MINUTE)))}m`
  if (ms < DAY) return `in ${String(Math.floor(ms / HOUR))}h ${String(Math.floor((ms % HOUR) / MINUTE))}m`
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  const dayText = `${String(days)} ${days === 1 ? 'day' : 'days'}`
  if (days >= 3 || hours === 0) return `in ${dayText}`
  return `in ${dayText} ${String(hours)} ${hours === 1 ? 'hour' : 'hours'}`
}

/** Crossover and Solo play along with the real NFL weeks, which go final once their scores are in. */
export function followsNfl(mode: LeagueMode): boolean {
  return mode === 'crossover' || mode === 'solo'
}

/**
 * The next battle: "Battle in 2 days", then "Battle in progress" once a Crossover or Solo week's games have
 * kicked off, then "Waiting for final scores" until the import brings them in. A Classic battle happens the
 * moment it's due, so it's only "now" until the page catches up.
 */
export function battleText(at: Date, kicksOffAt: Date | null, nfl: boolean, lead = 'Battle', now: Date = new Date()): string {
  if (at.getTime() <= now.getTime()) return nfl ? 'Waiting for final scores' : `${lead} now`
  if (kicksOffAt && kicksOffAt.getTime() <= now.getTime()) return `${lead} in progress`
  return `${lead} ${timeUntil(at, now)}`
}

/** A Crossover or Solo week: "Goes final in 2 days", or "Waiting for final scores" once that time has passed. */
export function goesFinalText(at: Date, now: Date = new Date()): string {
  return at.getTime() <= now.getTime() ? 'Waiting for final scores' : `Goes final ${timeUntil(at, now)}`
}

/** A chat timestamp: the time today ("3:41 PM"), or the date and time for older messages. */
export function chatTime(at: Date, now: Date = new Date()): string {
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (at.toDateString() === now.toDateString()) return time
  return `${at.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}

/** A league's season length: Crossover's depends on when it drafted, Classic's is always 14. */
export function seasonWeeksOf(league: { seasonWeeks?: number } | null | undefined): number {
  return league?.seasonWeeks || SEASON_WEEKS
}

/** When the next game week resolves, given week 1's time and weeks already played. */
export function nextBattleAt(weekOneAt: string, resolvedWeeks: number, cadence: Cadence): Date {
  return new Date(new Date(weekOneAt).getTime() + resolvedWeeks * CADENCE_MS[cadence])
}

/** A kickoff for Crossover lineups: "Sun 1:00 PM" this week, with the date further out. */
export function kickoffText(at: Date, now: Date = new Date()): string {
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const day = at.toLocaleDateString([], { weekday: 'short' })
  if (Math.abs(at.getTime() - now.getTime()) < 6 * DAY) return `${day} ${time}`
  return `${day} ${at.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}
