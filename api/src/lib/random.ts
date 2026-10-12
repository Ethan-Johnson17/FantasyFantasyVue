import { createHash, randomBytes } from 'node:crypto'

/**
 * Deterministic random numbers for game setup. A league stores its seed, so its hero pool and
 * draft can be reproduced and audited. The seed itself comes from a cryptographic source and is
 * never sent to clients, so outcomes can't be predicted.
 */
export interface Rng {
  /** Float in [0, 1) */
  next(): number
  /** Integer in [min, max], inclusive */
  int(min: number, max: number): number
  chance(probability: number): boolean
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: readonly T[]): T[]
}

export function newSeed(): string {
  return randomBytes(16).toString('hex')
}

/**
 * sfc32 generator seeded from SHA-256(seed + label). Different labels give independent streams
 * from the same league seed (e.g. "pool" vs "draft"), so changing one step never shifts another.
 */
export function createRng(seed: string, label = ''): Rng {
  const digest = createHash('sha256').update(`${seed}:${label}`).digest()
  let a = digest.readUInt32LE(0)
  let b = digest.readUInt32LE(4)
  let c = digest.readUInt32LE(8)
  let d = digest.readUInt32LE(12)

  const next = () => {
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }

  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))

  return {
    next,
    int,
    chance: probability => next() < probability,
    pick: items => {
      if (items.length === 0) throw new Error('Cannot pick from an empty list')
      return items[int(0, items.length - 1)] as (typeof items)[number]
    },
    shuffle: items => {
      const result = [...items]
      for (let i = result.length - 1; i > 0; i--) {
        const j = int(0, i)
        ;[result[i], result[j]] = [result[j] as (typeof result)[number], result[i] as (typeof result)[number]]
      }
      return result
    }
  }
}
