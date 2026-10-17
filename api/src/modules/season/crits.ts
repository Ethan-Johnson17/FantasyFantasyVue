import type { HeroClass } from '../heroes/classes.js'
import type { Ruleset } from '../scoring/rulesets.js'

/*
 * Natural 20s and natural 1s. A d20 lands on 20 one time in 20, so a critical success is a week in
 * the top 5% of a hero's class, and a critical fail one in the bottom 5% (thresholds in the
 * ruleset). Flavor only: crits never change damage or who wins.
 */

export type Crit = 'success' | 'fail'

interface FoughtLine {
  slot: string
  points: number
  resting: boolean
  swappedInto?: string | null
}

/**
 * The crit for one hero-week, judged on class damage before Champion or auto-swap modifiers, so it
 * reflects how the hero performed. Only heroes who fought can crit.
 */
export function critOf(line: FoughtLine, heroClass: HeroClass, ruleset: Ruleset): Crit | null {
  const fought = !line.resting && (line.slot !== 'Bench' || !!line.swappedInto)
  if (!fought) return null
  const damage = line.points * ruleset.lineup.classMultipliers[heroClass]
  if (damage >= ruleset.crits.success[heroClass]) return 'success'
  if (damage <= ruleset.crits.fail[heroClass]) return 'fail'
  return null
}
