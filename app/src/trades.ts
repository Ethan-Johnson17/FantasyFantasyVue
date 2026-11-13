import type { LeagueDetail, MoveHero, Trade, TradeMove, TradeStatus, Trades } from './api/types'

/* Trades between parties (docs/TRADES_SPEC.md): what the offer screens check before sending, and how offers read. */

/** Most heroes from each side in one offer */
export const TRADE_MAX_HEROES = 3

/** Leagues with trades at all: every mode with more than one party */
export const hasTrades = (league: Pick<LeagueDetail, 'mode'> | null) => !!league && league.mode !== 'solo'

/** How many heroes a party must release so a trade leaves it within the roster size. */
export function releasesNeeded(rosterCount: number, giving: number, getting: number, rosterSize: number): number {
  return Math.max(0, rosterCount - giving + getting - rosterSize)
}

export interface OfferDraft {
  /** Their heroes I'm asking for */
  getting: readonly string[]
  /** My heroes I'm giving */
  giving: readonly string[]
  releases: readonly string[]
  rosterCount: number
  rosterSize: number
}

/** Why an offer can't be sent yet, or null when it's ready. The API checks class limits and lineups. */
export function offerProblem(draft: OfferDraft): string | null {
  if (draft.getting.length === 0) return 'Pick at least one of their heroes'
  if (draft.giving.length === 0) return 'Pick at least one of your heroes to give'
  const needed = releasesNeeded(draft.rosterCount, draft.giving.length, draft.getting.length, draft.rosterSize)
  const short = needed - draft.releases.length
  if (short > 0) return `Release ${String(short)} more of your heroes to make room`
  if (short < 0) return needed === 0 ? 'This trade leaves room on your roster: release nobody' : `Release only ${String(needed)}`
  return null
}

export const TRADE_STATUS: Record<TradeStatus, string> = {
  open: 'Open',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  expired: 'Expired'
}

export const heroNames = (heroes: readonly MoveHero[]) => heroes.map(hero => hero.name).join(', ')

/** "You give A for B", or "Bob gives A for your B": from my side of the offer. */
export function tradeLine(trade: Trade, myPartyId: string | null): string {
  const sent = trade.from.partyId === myPartyId
  if (sent) return `You give ${heroNames(trade.offered)} for ${trade.to.name}’s ${heroNames(trade.requested)}`
  return `${trade.from.name} gives ${heroNames(trade.offered)} for your ${heroNames(trade.requested)}`
}

/** An accepted trade in the league's recent moves: "A got X; B got Y, Z, released W". */
export function tradeMoveText(move: TradeMove): string {
  return move.sides
    .map(side => `${side.party.name} got ${heroNames(side.received)}${side.released.length ? `, released ${heroNames(side.released)}` : ''}`)
    .join('; ')
}

/** The trade window, as the inbox and the offer screen say it. */
export function windowText(window: Trades['window']): string {
  if (window.lastWeek === null) return 'This season is too short for trades.'
  if (!window.open) return `The trade deadline has passed: trades closed after week ${String(window.lastWeek)}.`
  return `Trades are open through week ${String(window.lastWeek)}. An accepted trade happens at once and counts from the next battle.`
}
