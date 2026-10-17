import type { ResultHero, ResultSide } from './api/types'
import { CRIT_NAMES, synergyInfo } from './heroes'

/*
 * A short story of one battle, told from the featured side, built only from the result. Pure fantasy
 * (hero and party names, rounded damage). Wording varies by a stable hash, so a battle always reads
 * the same way.
 */

export interface RecapInput {
  week: number
  us: ResultSide
  /** null against the dungeon monster */
  them: ResultSide | null
  opponentName: string
  opponentTotal: number
}

/** Up to this many crit lines, so the recap stays short. */
const MAX_CRIT_LINES = 3

function pick<T>(options: readonly T[], key: string): T {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return options[hash % options.length] as T
}

const fought = (hero: ResultHero) => !hero.resting && (hero.slot !== 'Bench' || !!hero.swappedInto)
const critName = (hero: ResultHero) => (hero.crit ? (CRIT_NAMES as Record<string, Record<string, string> | undefined>)[hero.heroClass]?.[hero.crit] : undefined)

export function battleRecap({ week, us, them, opponentName, opponentTotal }: RecapInput): string[] {
  const key = `${String(week)}-${us.partyId}`
  const ours = Math.round(us.total)
  const theirs = Math.round(opponentTotal)
  const lines: string[] = []

  if (us.total === opponentTotal) {
    lines.push(`${us.name} and ${opponentName} fought to a standstill, ${String(ours)} apiece.`)
  } else {
    const won = us.total > opponentTotal
    const [winner, loser] = won ? [us.name, opponentName] : [opponentName, us.name]
    const [high, low] = won ? [ours, theirs] : [theirs, ours]
    const margin = Math.abs(us.total - opponentTotal) / Math.max(1, Math.max(us.total, opponentTotal))
    const verb = margin < 0.05 ? pick(['edged', 'narrowly held off'], key) : margin > 0.25 ? pick(['routed', 'overwhelmed'], key) : pick(['defeated', 'overcame'], key)
    lines.push(`${winner} ${verb} ${loser}, ${String(high)} to ${String(low)}.`)
  }

  const best = us.heroes.filter(fought).sort((a, b) => b.damage - a.damage)[0]
  if (best && best.damage > 0) {
    const who = best.heroId === us.champion ? `${best.name}, the party's Champion,` : best.name
    lines.push(`${who} ${pick(['led the charge', 'carried the day', 'struck hardest'], key + best.heroId)} with ${String(best.damage)} damage.`)
  }

  const critLines = [
    ...us.heroes.filter(hero => fought(hero) && hero.crit).map(hero => ({ hero, side: null as string | null })),
    ...(them?.heroes.filter(hero => fought(hero) && hero.crit).map(hero => ({ hero, side: them.name })) ?? [])
  ]
    .sort((a, b) => Number(b.hero.crit === 'success') - Number(a.hero.crit === 'success') || b.hero.damage - a.hero.damage)
    .slice(0, MAX_CRIT_LINES)
    .map(({ hero, side }) => {
      const name = critName(hero)
      const prefix = side ? `For ${side}, ` : ''
      return hero.crit === 'success'
        ? `${prefix}${hero.name}'s ${name ?? 'strike'} landed for ${String(hero.damage)}: a natural 20!`
        : `${prefix}${hero.name} rolled a natural 1. ${name ?? 'A miss'}, just ${String(hero.damage)} damage.`
    })
  lines.push(...critLines)

  for (const synergy of us.synergies) {
    const { label } = synergyInfo(synergy)
    lines.push(pick([`${label} bolstered ${us.name}.`, `${us.name} fought with ${label} on their side.`], key + synergy))
  }
  return lines
}
