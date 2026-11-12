/* Shapes returned by the FantasyFantasy API (see api/README.md). Dates arrive as ISO strings. */
import type { Crest } from '../crests'

export type LeagueStatus = 'forming' | 'drafting' | 'active' | 'complete' | 'canceled'
export type Visibility = 'private' | 'public'
export type Cadence = 'daily' | 'weekly'
/**
 * Classic hides each hero's player; Crossover (docs/CROSSOVER_SPEC.md) shows real, current players; Co-op
 * (docs/COOP_SPEC.md) is Classic with every party against the same campaign monsters, and no matchups. Solo
 * (docs/SOLO_SPEC.md) is a run of one party, bought from Crossover's players, against a Co-op campaign.
 */
export type LeagueMode = 'classic' | 'crossover' | 'coop' | 'solo'

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
  /** Game weeks in the season (Crossover's depend on when it drafted) */
  seasonWeeks?: number
  /** When the next game week resolves, once the season has started */
  nextResolvesAt?: string | null
  /** Classic with playoffs: the bracket's size, and its rounds (weeks after the 14-week regular season); null without */
  playoffs?: LeaguePlayoffs | null
  /** Dynasty only: which season of the chain this is, and the seasons before and after it */
  dynasty?: { seasons: number; number: number; previousLeagueId: string | null; nextLeagueId: string | null } | null
  /** Dynasty, between seasons: parties waiting for a new member to take them over */
  openParties?: { id: string; name: string; crest: Crest }[]
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
  /** I hid it from my list (finished or canceled leagues only) */
  hidden?: boolean
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
  /** Co-op only, once drafted: where the campaign stands, and my party's damage last week */
  campaign?: {
    chapter: number
    monster: string
    hp: number
    hpLeft: number
    deadline: number
    livesLeft: number
    outcome: CampaignOutcome
    myLastWeek: number | null
  } | null
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
  /** Classic unless given; Crossover leagues are always weekly; Co-op never has playoffs */
  mode?: LeagueMode
  /** Classic only: play a dynasty of this many seasons */
  dynastySeasons?: 3 | 5
  /** Classic: a playoff bracket decides the champion (on unless false; false: the best record wins) */
  playoffs?: boolean
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
  /** Dynasty only: XP carried into this season, its tier and damage bonus */
  xp?: HeroXp
  /** Dynasty only: the trait earned at the top XP tier */
  earnedTrait?: HeroTrait
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
  /** Crossover only: the Quest party's hero ids and its size; null in Classic */
  questParty?: string[] | null
  questPartySize?: number | null
  /** Crossover only: the next week's encounter and the Quest's modifiers */
  quest?: {
    encounter: Encounter | null
    weakMultiplier: number
    resistMultiplier: number
    classMultipliers: Record<HeroClass, number>
  } | null
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
  /** Crossover's rules, and whether its leagues can be created yet */
  crossover?: CrossoverRules
  /** Co-op's campaign rules, and whether its leagues can be created yet */
  coop?: CoopRules | null
  /** Solo's budget, swaps and campaign, and whether runs can be started yet */
  solo?: SoloRules | null
}

export interface SoloRules {
  available: boolean
  version: number
  rosterSize: number
  /** The Quest party: the heroes who fight */
  partySize: number
  classLimits: Partial<Record<HeroClass, number>>
  /** Gold by Level, Level 1 first */
  costs: number[]
  cap: number
  swapsPerWeek: number
  /** Runs play NFL weeks firstWeek (at the earliest) through lastWeek, and need minWeeks of them */
  firstWeek: number
  lastWeek: number
  minWeeks: number
  chapters: number
  lives: number
  weakMultiplier: number
  resistMultiplier: number
  boss: string
}

/** A hero in a Solo run's pool: the price to sign them now, and their game in the run's next week. */
export interface SoloHero extends Hero {
  cost: number
  /** What the run paid, for heroes in the party */
  price: number | null
  projected: number
  /** Null on a bye, or before the run starts */
  kickoff: string | null
  locked: boolean
}

/** A Solo run's market and budget (GET /api/leagues/:id/solo). */
export interface SoloRun {
  status: LeagueStatus
  /** The party is confirmed and the campaign under way (or over) */
  confirmed: boolean
  rosterSize: number
  partySize: number
  cap: number
  costs: number[]
  paladinLimit: number
  /** The prices paid for the party, added up */
  spent: number
  swapsPerWeek: number
  /** Swaps left this NFL week, while the run is played */
  swapsLeft: number | null
  /** The latest final NFL week the Levels reflect */
  poolWeek: number | null
  /** Before confirming: when the run would start if confirmed now, and each monster's window in weeks */
  start: { firstWeek: number; weeks: number; windows: number[] } | null
  /** Before confirming: why the run can't start now */
  startProblem: string | null
  /** The five monsters in order, with their weaknesses */
  monsters: { name: string; weak: HeroClass[]; resists: HeroClass; boss: boolean }[]
  /** The whole pool, the party first */
  pool: SoloHero[]
}

export interface SoloConfirmInput {
  heroIds: string[]
  questParty: string[]
  champion: string | null
}

export interface CoopRules {
  available: boolean
  version: number
  /** The last game week each chapter's monster may fall by; the last is the boss raid */
  deadlines: number[]
  lives: number
  weakMultiplier: number
  resistMultiplier: number
  /** The boss raid's monster */
  boss: string
}

export type CampaignOutcome = 'ongoing' | 'won' | 'lost'

/** One chapter of a Co-op campaign: its monster, and how it went. */
export interface CampaignChapter {
  chapter: number
  name: string
  weak: HeroClass[]
  resists: HeroClass
  boss: boolean
  hp: number
  deadline: number
  status: 'upcoming' | 'active' | 'fallen' | 'failed'
  /** The full HP until it's fought, 0 once fallen */
  hpLeft: number
  /** The week it fell, or its deadline passed */
  endedWeek: number | null
}

/** A Co-op league's quest board (GET /api/leagues/:id/campaign). */
export interface Campaign {
  lives: number
  livesLeft: number
  outcome: CampaignOutcome
  /** The chapter being fought (the last one fought, once it's over) */
  chapter: number
  chapters: CampaignChapter[]
  lastWeek: number | null
  nextWeek: { week: number; at: string } | null
  /** Every party, by damage to this chapter's monster, most first */
  contributions: (PartyRef & { lastWeek: number; chapter: number; total: number })[]
  /** My party, if I'm in the league; no Champion means a reminder */
  myParty: { partyId: string; hasChampion: boolean } | null
  /** Solo: the run was abandoned, which counts as a loss */
  abandoned?: boolean
}

export type CoopAward =
  | { kind: 'monsterSlayer'; party: PartyRef; damage: number }
  | { kind: 'finalBlow'; chapter: number; monster: string; week: number; party: PartyRef; damage: number }
  | { kind: 'natural20'; party: PartyRef; count: number }
  | { kind: 'cursedDice'; party: PartyRef; count: number }

/** The end of a Co-op campaign (GET /api/leagues/:id/finale in a Co-op league). */
export interface CoopFinale {
  mode: 'coop'
  outcome: 'won' | 'lost'
  lives: number
  livesLeft: number
  chapters: CampaignChapter[]
  contributions: (PartyRef & { total: number })[]
  myParty: { partyId: string } | null
  awards: CoopAward[]
}

export const isCoopFinale = (finale: Finale | CoopFinale | SoloFinale): finale is CoopFinale => 'mode' in finale && finale.mode === 'coop'

/** A hero named in a Solo award, with the real player behind them */
export interface SoloHeroRef {
  heroId: string
  name: string
  heroClass: HeroClass
  player: { name: string; team: string; position: string } | null
}

export type SoloAward =
  | { kind: 'biggestWeek'; week: number; damage: number }
  | { kind: 'topHero'; hero: SoloHeroRef; damage: number }
  | { kind: 'natural20'; count: number; hero: SoloHeroRef }

/** The end of a Solo run (GET /api/leagues/:id/finale in a Solo run). */
export interface SoloFinale {
  mode: 'solo'
  outcome: 'won' | 'lost'
  /** Abandoned before the campaign ended, which counts as a loss */
  abandoned: boolean
  lives: number
  livesLeft: number
  chapters: CampaignChapter[]
  weeksPlayed: number
  total: number
  awards: SoloAward[]
}

export const isSoloFinale = (finale: Finale | CoopFinale | SoloFinale): finale is SoloFinale => 'mode' in finale && finale.mode === 'solo'

export interface CrossoverRules {
  available: boolean
  rosterSize: number
  /** Football lineup slot labels, in order */
  slots: string[]
  /** Leagues play through this NFL week, and need this many weeks left to start */
  lastWeek: number
  minWeeks: number
  quest: QuestRules
  encounters: Encounter[]
}

export interface QuestRules {
  partySize: number
  weakMultiplier: number
  resistMultiplier: number
  natural20Multiplier: number
  natural1Multiplier: number
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

/** Regular-season battles count in the standings; playoff weeks hold bracket games and consolation battles. */
export type MatchupKind = 'regular' | 'playoff' | 'consolation'

export interface PlayoffFormat {
  /** Parties in the bracket */
  spots: number
  /** Playoff weeks after the regular season */
  rounds: number
}

export interface LeaguePlayoffs extends PlayoffFormat {
  /** Game weeks before the bracket: playoff round r is game week regularWeeks + r */
  regularWeeks: number
}

export interface PlayoffSeed extends PartyRef {
  seed: number
}

export interface BracketSide extends PlayoffSeed {
  /** null until played. Crossover: the Quest board */
  total: number | null
  /** Crossover only: the Gridiron board */
  gridiron?: number | null
}

/** The playoff bracket (GET /api/leagues/:id/playoffs). */
export interface Playoffs {
  format: LeaguePlayoffs
  /** The regular season isn't over, so the seeds can still change */
  provisional: boolean
  seeds: PlayoffSeed[]
  rounds: {
    round: number
    week: number
    name: string
    /** Empty while earlier rounds are still to be played */
    games: { high: BracketSide; low: BracketSide; winner: string | null }[]
    /** The top seeds resting on a bye */
    byes: PlayoffSeed[]
  }[]
  champion: PartyRef | null
}

export interface ScheduleWeek {
  week: number
  /** Crossover only: the real NFL week this game week follows */
  nflWeek?: number | null
  resolvesAt: string | null
  matchups: {
    home: PartyRef
    away: PartyRef | null
    kind?: MatchupKind
    /** Classic: one battle. Crossover: totals and outcome are the Quest board; the gridiron fields the other board. */
    result: {
      homeTotal: number
      awayTotal: number
      outcome: Outcome
      monster: string | null
      homeGridiron?: number | null
      awayGridiron?: number | null
      gridironOutcome?: Outcome | null
    } | null
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
  /** Crossover only: fought the encounter in the Quest party */
  quest?: boolean
  /** Crossover only: the player's real fantasy points that week */
  points?: number
}

export interface ResultSide extends PartyRef {
  /** Classic: the battle total. Crossover: the Quest board. */
  total: number
  /** Crossover only: the Gridiron board, plain fantasy points */
  gridiron?: number | null
  /** The Champion named that week, if any */
  champion: string | null
  synergies: Synergy[]
  heroes: ResultHero[]
}

export interface WeekResult {
  week: number
  matchups: {
    home: ResultSide
    away: ResultSide | null
    monster: { name: string; total: number; gridiron?: number | null } | null
    /** Classic: the battle. Crossover: the Quest board. */
    outcome: Outcome
    /** Crossover only: the Gridiron board */
    gridironOutcome?: Outcome | null
    kind?: MatchupKind
  }[]
  /** Crossover only: the week's encounter */
  encounter?: Encounter | null
  /** Co-op only: every party's damage against the chapter monster, most first (matchups is empty) */
  sides?: ResultSide[]
  /** Co-op only: the campaign this week */
  campaign?: {
    chapter: number
    monster: string
    hpBefore: number
    dealt: number
    /** Chapters whose monster fell this week */
    fallen: number[]
    /** A chapter whose deadline passed with its monster standing (a life lost) */
    failed: number | null
    failedHpLeft: number | null
    state: { chapter: number; hpLeft: number; livesLeft: number; outcome: CampaignOutcome }
  } | null
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

/** Dynasty: a hero's XP this season (docs/DYNASTY_SPEC.md) */
export interface HeroXp {
  xp: number
  tier: number
  /** Damage bonus, e.g. 0.02 for +2% */
  bonus: number
  nextTierAt: number | null
}

/** Dynasty, between seasons: one of last season's heroes, re-leveled for this season */
export interface KeeperOption {
  heroId: string
  name: string
  heroClass: HeroClass
  previousLevel: number | null
  /** Null when retired */
  level: number | null
  traits: HeroTrait[]
  retired: boolean
  kept: boolean
  /** The XP they'd carry if kept */
  xp: HeroXp
  earnedTrait: HeroTrait | null
}

export interface Keepers {
  limit: number
  options: KeeperOption[]
}

interface DynastyParty {
  name: string
  crest: Crest
}

export interface DynastySummary {
  seasons: number
  current: number
  history: { number: number; leagueId: string; status: LeagueStatus; champion: DynastyParty | null }[]
  standings: (DynastyParty & { titles: number; wins: number; losses: number; draws: number; seasons: number; isMine: boolean })[]
}
