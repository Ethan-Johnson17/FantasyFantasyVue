/* Shapes returned by the FantasyFantasy API (see api/README.md). Dates arrive as ISO strings. */
import type { Crest } from '../crests'

export type LeagueStatus = 'forming' | 'drafting' | 'active' | 'complete' | 'canceled'
export type Visibility = 'private' | 'public'
export type Cadence = 'daily' | 'weekly'

export interface Account {
  id: string
  displayName: string
  picture?: string
}

export interface Profile {
  id: string
  displayName: string
  picture?: string
}

export interface Party {
  id: string
  name: string
  crest: Crest
  owner: Profile
  isMine: boolean
  autoSwap?: boolean
}

export interface LeagueSummary {
  id: string
  name: string
  status: LeagueStatus
  visibility: Visibility
  cadence: Cadence
  maxParties: number
  partyCount: number
  host: Profile
  isHost: boolean
  pin?: string
  draftAt: string | null
  weekOneAt: string | null
  resolvedWeeks: number
  createdAt: string
}

export interface LeagueDetail extends LeagueSummary {
  rulesetVersion: number
  parties: Party[]
  draft: DraftResult | null
}

export interface MyLeague extends LeagueSummary {
  myParty: { id: string; name: string; crest: Crest }
  standing: { rank: number; wins: number; losses: number; draws: number } | null
}

export interface PartyInput {
  name: string
  crest: Crest
}

export interface CreateLeagueInput {
  name: string
  visibility: Visibility
  cadence: Cadence
  maxParties: number
  party: PartyInput
}

export type HeroClass = 'Mage' | 'Warrior' | 'Ranger' | 'Rogue' | 'Paladin'
export type HeroTrait = 'steadfast' | 'wild' | 'mighty'
export type Synergy = 'orderAndChaos' | 'mightyChampion' | 'bulwark'

export interface Hero {
  id: string
  name: string
  heroClass: HeroClass
  race: string
  gender: string
  weapon: string
  skill: string
  attack: number
  defense: number
  magic: number
  /** Null for mystery recruits */
  level: number | null
  levelRange: { min: number; max: number } | null
  traits: HeroTrait[]
  partyId: string | null
}

export interface DraftResult {
  order: string[]
  picks: { round: number; overall: number; partyId: string; heroId: string }[]
}

export interface SlotRule {
  key: string
  label: string
  classes: HeroClass[]
}

export interface Lineup {
  slots: SlotRule[]
  lineup: Record<string, string> | null
  autoSwap: boolean
  /** The Champion named for the next battle */
  champion: string | null
  strategy: StrategyRules
  roster: (Hero & { restingNextWeek: boolean })[]
  nextWeek: number | null
  nextWeekAt: string | null
}

export interface StrategyRules {
  championMultiplier: number
  mightyChampionMultiplier: number
  orderAndChaosBonus: number
  bulwarkFloor: number
}

export interface MatchupSide extends PartyRef {
  record: { wins: number; losses: number; draws: number }
  starters: { slot: string; label: string; hero: (Hero & { restingNextWeek: boolean }) | null }[]
  champion: string | null
  /** Synergies this lineup would trigger if the battle resolved now */
  synergies: Synergy[]
}

export interface Matchup {
  week: number
  resolvesAt: string
  me: MatchupSide
  /** null when my party faces the dungeon monster */
  opponent: MatchupSide | null
  monster: { name: string } | null
  /** Earlier battles between us, oldest first */
  meetings: { week: number; myTotal: number; theirTotal: number; outcome: 'win' | 'loss' | 'draw' }[]
}

export interface RosterMove {
  kind: 'claim'
  party: { partyId: string; name: string }
  added: { heroId: string; name: string; heroClass: string }
  dropped: { heroId: string; name: string; heroClass: string }
  /** The first battle the change counts for */
  effectiveWeek: number
  at: string
}

export interface PartyRef {
  partyId: string
  name: string
  crest: Crest
}

export type Outcome = 'home' | 'away' | 'draw'

export interface ScheduleWeek {
  week: number
  resolvesAt: string | null
  matchups: {
    home: PartyRef
    away: PartyRef | null
    result: { homeTotal: number; awayTotal: number; outcome: Outcome; monster: string | null } | null
  }[]
}

export interface ResultHero {
  heroId: string
  name: string
  heroClass: HeroClass
  slot: string
  damage: number
  resting: boolean
  swappedInto: string | null
}

export interface ResultSide extends PartyRef {
  total: number
  /** The Champion named that week, if any */
  champion: string | null
  synergies: Synergy[]
  heroes: ResultHero[]
}

export interface WeekResult {
  week: number
  matchups: { home: ResultSide; away: ResultSide | null; monster: { name: string; total: number } | null; outcome: Outcome }[]
}

export interface Standing extends PartyRef {
  wins: number
  losses: number
  draws: number
  totalDamage: number
}

export interface HeroDetail {
  hero: Hero
  history: { week: number; slot: string; damage: number; resting: boolean; swappedInto: string | null }[]
}
