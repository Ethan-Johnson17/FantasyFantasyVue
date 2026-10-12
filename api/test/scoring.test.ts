import { describe, expect, it } from 'vitest'
import { getRuleset, RULESET_V1 } from '../src/modules/scoring/rulesets.js'
import {
  pointsAllowedScore,
  scoreDefense,
  scoreOffense,
  type DefenseStatLine,
  type OffenseStatLine
} from '../src/modules/scoring/scoring.js'

const noOffense: OffenseStatLine = {
  passingYards: 0,
  passingTds: 0,
  interceptions: 0,
  rushingYards: 0,
  rushingTds: 0,
  receptions: 0,
  receivingYards: 0,
  receivingTds: 0,
  twoPointConversions: 0,
  fumblesLost: 0,
  specialTeamsTds: 0
}

const noDefense: DefenseStatLine = {
  sacks: 0,
  interceptions: 0,
  fumbleRecoveries: 0,
  touchdowns: 0,
  safeties: 0,
  blockedKicks: 0,
  pointsAllowed: 21
}

describe('scoreOffense (ruleset v1, half-PPR)', () => {
  it('matches the spec example: McCaffrey 2023 week 1', () => {
    const stats = { ...noOffense, rushingYards: 152, rushingTds: 1, receptions: 3, receivingYards: 17 }
    expect(scoreOffense(stats, RULESET_V1)).toBe(24.4)
  })

  it.each([
    ['passing yard', { passingYards: 25 }, 1],
    ['passing TD', { passingTds: 1 }, 4],
    ['interception', { interceptions: 1 }, -2],
    ['rushing yard', { rushingYards: 10 }, 1],
    ['rushing TD', { rushingTds: 1 }, 6],
    ['reception', { receptions: 1 }, 0.5],
    ['receiving yard', { receivingYards: 10 }, 1],
    ['receiving TD', { receivingTds: 1 }, 6],
    ['2-pt conversion', { twoPointConversions: 1 }, 2],
    ['fumble lost', { fumblesLost: 1 }, -2],
    ['special teams TD', { specialTeamsTds: 1 }, 6]
  ])('scores %s', (_label, partial, expected) => {
    expect(scoreOffense({ ...noOffense, ...partial }, RULESET_V1)).toBe(expected)
  })

  it('handles negative yardage', () => {
    expect(scoreOffense({ ...noOffense, rushingYards: -7 }, RULESET_V1)).toBe(-0.7)
  })

  it('produces exact decimals, free of floating-point drift', () => {
    const stats = { ...noOffense, passingYards: 333, rushingYards: 33, receivingYards: 3 }
    expect(scoreOffense(stats, RULESET_V1)).toBe(16.92)
  })
})

describe('scoreDefense (ruleset v1)', () => {
  it.each([
    [0, 10],
    [1, 7],
    [6, 7],
    [7, 4],
    [13, 4],
    [14, 1],
    [20, 1],
    [21, 0],
    [27, 0],
    [28, -1],
    [34, -1],
    [35, -4],
    [70, -4]
  ])('scores %i points allowed as %i', (allowed, expected) => {
    expect(pointsAllowedScore(allowed, RULESET_V1)).toBe(expected)
  })

  it('adds every scoring category', () => {
    const stats: DefenseStatLine = {
      sacks: 3,
      interceptions: 2,
      fumbleRecoveries: 1,
      touchdowns: 1,
      safeties: 1,
      blockedKicks: 1,
      pointsAllowed: 10
    }
    // 3 + 4 + 2 + 6 + 2 + 2 + 4 (7-13 allowed)
    expect(scoreDefense(stats, RULESET_V1)).toBe(23)
  })

  it('can go negative', () => {
    expect(scoreDefense({ ...noDefense, pointsAllowed: 45 }, RULESET_V1)).toBe(-4)
  })
})

describe('getRuleset', () => {
  it('returns known versions and rejects unknown ones', () => {
    expect(getRuleset(1)).toBe(RULESET_V1)
    expect(() => getRuleset(99)).toThrow(/Unknown scoring ruleset/)
  })
})
