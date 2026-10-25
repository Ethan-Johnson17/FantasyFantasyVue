/* Shapes returned by the FantasyFantasy API (see api/README.md). Dates arrive as ISO strings. */
import type { Crest } from '../crests'

export type LeagueStatus = 'forming' | 'drafting' | 'active' | 'complete' | 'canceled'
export type Visibility = 'private' | 'public'
export type Cadence = 'daily' | 'weekly'
/** Classic hides each hero's player; Crossover (docs/CROSSOVER_SPEC.md) shows real, current players */
export type LeagueMode = 'classic' | 'crossover'

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
  mode: LeagueMode
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
  outlook: PartyOutlook
  /** Chat messages from others I haven't seen; stops counting at UNREAD_CAP */
  unreadChat: number
}

/** Next battle, last result, and anything to fix before the lineup locks. */
export interface PartyOutlook {
  /** While drafting */
  ranking: { ranked: number; pool: number } | null
  /** While the season runs */
  nextBattle: {
    week: number
    at: string
    /** null against the dungeon monster */
    opponent: { name: string; crest: Crest } | null
    monster: string | null
    noChampion: boolean
    restingStarters: number
  } | null
  lastBattle: { week: number; outcome: 'win' | 'loss' | 'draw'; myTotal: number; theirTotal: number; opponentName: string } | null
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
/** A natural 20 (top 5% week for the class) or natural 1 (bottom 5%) */
export type Crit = 'success' | 'fail'

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
  /** Crossover only: the real player. Classic heroes never have one. */
  player?: { name: string; team: string; position: string }
  /** Recent form; included in the league's hero list */
  form?: HeroForm
}

/** Average class damage, rounded: over the season so far and the latest three played weeks. */
export interface HeroForm {
  average: number | null
  recent: number | null
  played: number
  /** Mystery recruits after 3 battles: the veteran Level their damage so far matches */
  playingLike: number | null
  /** Projected damage for the next battle, before Champion or swap modifiers */
  projected: number
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
  /** Crossover adds each hero's kickoff that week (null on a bye) and whether it has started (locked) */
  roster: (Hero & { restingNextWeek: boolean; projected: number; kickoff?: string | null; locked?: boolean })[]
  nextWeek: number | null
  nextWeekAt: string | null
}

/** The public numbers of the current ruleset (GET /api/rules). */
export interface GameRules {
  version: number
  seasonWeeks: number
  rosterSize: number
  starters: number
  autoSwapMultiplier: number
  /** Most heroes of a class one party may hold */
  classLimits: Partial<Record<HeroClass, number>>
  strategy: StrategyRules
}

export interface StrategyRules {
  championMultiplier: number
  mightyChampionMultiplier: number
  orderAndChaosBonus: number
  bulwarkFloor: number
}

export interface MatchupSide extends PartyRef {
  record: { wins: number; losses: number; draws: number }
  starters: { slot: string; label: string; hero: (Hero & { restingNextWeek: boolean; projected: number; game?: LiveGame | null }) | null }[]
  champion: string | null
  /** Projected party total: starters who'll fight, with Champion and synergy bonuses */
  projectedTotal: number
  /** Crossover game days: real Quest damage for final games, projections for the rest; null otherwise */
  liveTotal?: number | null
  /** Crossover only: the heroes fighting the encounter (the Quest board) */
  questParty?: (Hero & { restingNextWeek: boolean; projected: number; game?: LiveGame | null })[] | null
  /** Crossover only: projected and game-day Gridiron points */
  projectedGridiron?: number | null
  liveGridiron?: number | null
  /** Synergies this lineup would trigger if the battle resolved now */
  synergies: Synergy[]
}

export interface Matchup {
  week: number
  resolvesAt: string
  /** Who rests is shown for the next battle only */
  restingKnown: boolean
  me: MatchupSide
  /** null when my party faces the dungeon monster */
  opponent: MatchupSide | null
  monster: { name: string } | null
  /** Earlier battles between us, oldest first */
  meetings: { week: number; myTotal: number; theirTotal: number; outcome: 'win' | 'loss' | 'draw' }[]
  /** Crossover game days: how many of the NFL week's games are final; null otherwise */
  games?: { final: number; total: number } | null
  /** Crossover only: the week's encounter, known ahead */
  encounter?: Encounter | null
}

/** A Crossover encounter: weak to two classes, resists one. */
export interface Encounter {
  name: string
  weak: HeroClass[]
  resists: HeroClass
}

type AwardParty = PartyRef
type AwardHero = { heroId: string; name: string; heroClass: string }

export type Award =
  | { kind: 'mightiestBlow'; party: AwardParty; week: number; total: number }
  | { kind: 'heroOfTheSeason'; hero: AwardHero; party: AwardParty; damage: number }
  | { kind: 'greatestStrike'; hero: AwardHero; party: AwardParty; week: number; damage: number }
  | { kind: 'closestBattle'; winner: AwardParty; loser: AwardParty; week: number; margin: number }
  | { kind: 'unbreakable'; party: AwardParty; damageFaced: number }
  | { kind: 'natural20'; party: AwardParty; count: number }
  | { kind: 'cursedDice'; party: AwardParty; count: number }

/** After the season (GET /api/leagues/:id/finale). */
export interface Finale {
  champion: Standing
  standings: Standing[]
  myFinish: { partyId: string; rank: number } | null
  awards: Award[]
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
  crit: Crit | null
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
  hero: Hero & { form: HeroForm }
  history: { week: number; slot: string; damage: number; resting: boolean; swappedInto: string | null; crit: Crit | null }[]
}

/** A league chat message. Bodies arrive already filtered for profanity. */
export interface ChatMessage {
  id: string
  body: string
  at: string
  /** The author's party; null once they've left the league */
  author: { partyId: string; name: string; crest: Crest } | null
  mine: boolean
  reportedByMe: boolean
  /** How many members reported it: the host sees a count, everyone else null */
  reports: number | null
}

export interface ChatPage {
  /** Oldest first */
  messages: ChatMessage[]
  hasMore: boolean
  /** The viewer hosts the league and can remove anyone's message */
  canModerate: boolean
  /** The league was canceled: messages can be read, not sent */
  readOnly: boolean
}

/** Crossover, next battle only: a starter's real NFL game that week. */
export interface LiveGame {
  kickoff: string
  /** Kicked off: the player can't move in or out of the lineup */
  locked: boolean
  final: boolean
  /** Fantasy points once the game is final; null until then */
  points: number | null
}
