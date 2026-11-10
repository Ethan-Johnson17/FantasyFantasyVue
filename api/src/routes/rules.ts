import { Router } from 'express'
import { COOP_V1, CROSSOVER_V1, CURRENT_RULESET_VERSION, getRuleset } from '../modules/scoring/rulesets.js'
import { BOSS_NAME } from '../modules/season/campaign.js'
import { ENCOUNTERS } from '../modules/season/encounters.js'
import { LAST_CROSSOVER_WEEK, MIN_CROSSOVER_WEEKS } from '../modules/season/nflWeeks.js'
import { SEASON_WEEKS } from '../modules/season/schedule.js'

/*
 * Public game rules for the "How it works" page and the host form, so they never drift from the rulesets. Only
 * rules everyone plays by; nothing about any league, hero, or the season behind it.
 */
export function rulesRouter({ crossoverEnabled, coopEnabled }: { crossoverEnabled: boolean; coopEnabled: boolean }) {
  return Router().get('/', (_req, res) => {
    const { lineup, strategy } = getRuleset(CURRENT_RULESET_VERSION)
    const crossover = CROSSOVER_V1
    const coop = COOP_V1.coop
    // A minute, so switching Crossover on (or off) reaches everyone quickly.
    res.set('Cache-Control', 'public, max-age=60')
    res.json({
      version: CURRENT_RULESET_VERSION,
      seasonWeeks: SEASON_WEEKS,
      rosterSize: lineup.rosterSize,
      starters: lineup.slots.length,
      autoSwapMultiplier: lineup.autoSwapMultiplier,
      classLimits: { ...lineup.classLimits },
      strategy: { ...strategy },
      crossover: {
        // Whether Crossover leagues can be created yet (CROSSOVER_ENABLED)
        available: crossoverEnabled,
        version: crossover.version,
        rosterSize: crossover.lineup.rosterSize,
        slots: crossover.lineup.slots.map(slot => slot.label),
        lastWeek: LAST_CROSSOVER_WEEK,
        minWeeks: MIN_CROSSOVER_WEEKS,
        quest: { ...crossover.quest },
        encounters: ENCOUNTERS.map(encounter => ({ name: encounter.name, weak: [...encounter.weak], resists: encounter.resists }))
      },
      // Co-op's campaign rules. HP's per-season factors stay out: they're about the hidden seasons, not how to play.
      coop: coop
        ? {
            // Whether Co-op leagues can be created yet (COOP_ENABLED)
            available: coopEnabled,
            version: COOP_V1.version,
            deadlines: [...coop.deadlines],
            lives: coop.lives,
            weakMultiplier: coop.weakMultiplier,
            resistMultiplier: coop.resistMultiplier,
            boss: BOSS_NAME
          }
        : null
    })
  })
}
