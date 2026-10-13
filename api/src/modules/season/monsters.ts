import type { Rng } from '../../lib/random.js'

const MONSTERS: readonly string[] = [
  'Cave Troll', 'Bone Hydra', 'Gelatinous Cube', 'Owlbear', 'Basilisk', 'Frost Wyrm', 'Minotaur Warlord',
  'Lich of the Barrow', 'Swamp Hag', 'Iron Golem', 'Shadow Drake', 'Goblin King', 'Manticore', 'Ogre Chieftain',
  'Wraith Lord', 'Giant Spider Queen', 'Fire Elemental', 'Chimera', 'Sand Wurm', 'Kraken Spawn'
]

export function monsterName(rng: Rng): string {
  return rng.pick(MONSTERS)
}
