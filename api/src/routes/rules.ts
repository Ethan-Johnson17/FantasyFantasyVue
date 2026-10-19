import { Router } from 'express'
import { CURRENT_RULESET_VERSION, getRuleset } from '../modules/scoring/rulesets.js'
import { SEASON_WEEKS } from '../modules/season/schedule.js'

/*
 * Public game rules for the "How it works" page, so it never drifts from the ruleset. Only rules
 * everyone plays by; nothing about any league, hero, or the season behind it.
 */
export const rulesRouter = Router().get('/', (_req, res) => {
  const { lineup, strategy } = getRuleset(CURRENT_RULESET_VERSION)
  res.set('Cache-Control', 'public, max-age=3600')
  res.json({
    version: CURRENT_RULESET_VERSION,
    seasonWeeks: SEASON_WEEKS,
    rosterSize: lineup.rosterSize,
    starters: lineup.slots.length,
    autoSwapMultiplier: lineup.autoSwapMultiplier,
    classLimits: { ...lineup.classLimits },
    strategy: { ...strategy }
  })
})
