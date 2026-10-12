import type { Rng } from '../../lib/random.js'

export type Gender = 'male' | 'female'

const FIRST_NAMES: Readonly<Record<Gender, readonly string[]>> = {
  male: [
    'Aldric', 'Bastian', 'Corvin', 'Dorian', 'Edric', 'Faelan', 'Garrick', 'Halvard', 'Ivor', 'Jareth',
    'Kael', 'Leoric', 'Magnar', 'Niall', 'Osric', 'Perrin', 'Quillon', 'Roderick', 'Soren', 'Tobias',
    'Ulric', 'Varian', 'Wystan', 'Yorick', 'Zephyr', 'Alaric', 'Brannoc', 'Cedric', 'Darius', 'Emeric',
    'Fenwick', 'Gideon', 'Hadrian', 'Ronan', 'Thorne', 'Valen', 'Beldon', 'Ravin', 'Hollis', 'Silvester'
  ],
  female: [
    'Aelira', 'Brienna', 'Caelia', 'Delphine', 'Elowen', 'Freya', 'Gwendolyn', 'Halcyon', 'Isolde', 'Juniper',
    'Kestrel', 'Lyra', 'Maelis', 'Nimue', 'Odessa', 'Perenna', 'Rowena', 'Seraphine', 'Talia', 'Una',
    'Vesper', 'Wren', 'Ysolde', 'Zara', 'Astrid', 'Briallen', 'Cressida', 'Dagny', 'Eira', 'Fennis',
    'Liesel', 'Morgana', 'Neve', 'Orla', 'Saoirse', 'Thessaly', 'Juliette', 'Bridgette', 'Isalda', 'Kyleigh'
  ]
}

const SURNAMES: readonly string[] = [
  'Ashbourne', 'Blackthorn', 'Brightwater', 'Coldiron', 'Dawnmantle', 'Emberfall', 'Fairwind', 'Frostbeard',
  'Goldleaf', 'Grimstone', 'Hawkridge', 'Ironstone', 'Lightfoot', 'Moonwhisper', 'Nightbloom', 'Oakenshield',
  'Ravenscroft', 'Redmane', 'Silverbrook', 'Stormcaller', 'Stoneforge', 'Thornfield', 'Treeforest', 'Underhill',
  'Valewood', 'Wildheart', 'Winterborn', 'Boulderflayer', 'Fusefury', 'Grandorb', 'Sethildrud', 'Velas'
]

const EPITHETS: readonly string[] = [
  'the Bold', 'the Swift', 'the Unbroken', 'the Wise', 'the Fearless', 'the Silent', 'the Radiant',
  'the Relentless', 'the Wanderer', 'the Steadfast', 'the Cunning', 'the Mighty', 'the Gilded', 'the Stormborn',
  'the Lionheart', 'the Ironwilled', 'the Keen-eyed', 'the Untamed', 'the Shieldbearer', 'the Oathkeeper',
  'the Dauntless', 'the Valiant', 'the Unyielding', 'the Bright', 'the Grim', 'the Lucky', 'the Tireless'
]

const MAX_ATTEMPTS = 200

/**
 * Generates a name not already in `used` (and records it). About 2,400 combinations per
 * gender, far more than any league's pool needs.
 */
export function generateName(rng: Rng, gender: Gender, used: Set<string>): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const first = rng.pick(FIRST_NAMES[gender])
    const name = rng.chance(0.5) ? `${first} ${rng.pick(SURNAMES)}` : `${first} ${rng.pick(EPITHETS)}`
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
  throw new Error('Could not generate a unique hero name')
}
