import { playersService } from "./services/PlayersService"

export const maleNames = [
"Alaric the Bold",
"Artorius the Chosen",
"Euron the Crow’s Eye",
"Garen the Might",
"Kallisto the Lioness",
"Leander the Swift",
"Marcus the Exile",
"Niklaus the Bloody",
"Victorus the Unconquered",
"Xerxes the God-King",
"Cassius the Silent",
"Flavius the Intrepid",
"Lucius the Loyal",
"Maximus the Gladiator",
"Decimus the Traitor",
"Augustus the Emperor",
"Constantine the Great",
"Theodoric the Goth",
"Alaric the Visigoth",
"Attila the Hun",
"Genghis Khan",
"Tamerlane the Great",
"Vlad Dracul",
'Dean Hiltred',
'Pell Chubok',
'Reese Tururnya',
'Ryland Qao',
'Varkag Jassi',
'Hein Dodatsk',
'Mol Fusefury',
'Beldon Vanzuehd',
'Korbinian Tiang',
'Ravin Velas',
'Normal Estorus',
'Nelles Cakum',
'Rodolf Khussom',
'Bastle Treeforest',
'Joey Boulderflayer',
'Herve Menzok',
'Spenser Danaz',
'Silvester Ironstone',
'Guifford Grandorb',
'Vardon Sethildrud',
'Brooks Hankab',
'Marquise Trodurgano',
'Pierce Mokyadze',
'Hollis Wie',
'Rudi Wing',
'Akim Dao',
'Blaine Gilerus',
'Levin Sasciscor',
'Luther Zula',
"Mannix",
"Mannix",
"Baalmelgart",
"Shammael",
"Resheph",
"Adrammelek",
"Keixilani",
"Cadmus",
"Arush",
"Diedrich",
]

export const femaleNames = [
"Loga Yalve",
"Hetdt Qing",
"Juliette Nei",
"Bridgette Sulilda",
"Kyleigh Sethildrud",
"Isalda Daoy",
"Mathilde Mournspire",
"Alhertine Ironstone",
"Lillian Sandl",
"Aggy Merdosk",
"Wilf Mournclaw",
"Blanche Rockbreath",
"Liealia Lehrihpafk",
"Tiara Biltram",
"Dasia Zuvintetve",
"Jacalyn Dulmugu",
"Wileen Ianzin",
"Luciane Dua",
"Sophia Acustes",
"Josefa Bidrinil",
"Juliana Hastu",
"Alysha Zeimmu",
"Shelby Mossbinder",
"Edeline Forestmight",
"Chauntel Susk",
"Bernadina Sokrosk",
"Delilah Riverblight",
"Dorette Runetoe",
"Edithe Vuntezd",
"Keziah",
"Vyara", 
"Zafira",
"Nyssa",
"Asherah",
"Darina",
"Elishat",
"Empusa",
"Anastasia",
"Bellatrix",
"Fariedah",
"Myshon",
"Boruta",
"Arihime",
]

export const races = [
  'human',
  'elf',
  'dwarf',
  'halfling',
  'half-elf',
  'half-orc',
  'dragonborn'
]

export const classes = [
  'warrior',
  'healer',
  'mage',
  'ranger',
  'thief'
]

let maleNamesIndex = 0
let femaleNamesIndex = 0
class GenerateHeroes{
  async generateLeagueHeroes(leagueId) {
        let maleNamesUsed = []
        let femaleNamesUsed = []
        let allHeroes = []
        let year = this.randomNum('season')
        let players = await playersService.getMyFDPPlayerData('api/players/fdpPlayers/' + year);
        console.log(players.length)
        await players.map(p => {
          let hero = {}
          let num1 = this.randomNum('race', 10)
          console.log(p.position)
          switch (p.position) {
            case 'QB':
              hero.heroClass = 'Mage';
              if (num1 >= 0 && num1 < 5) {
                hero.heroRace = 'Gnome'
              } else {
                hero.heroRace = 'Elf'
              }
              hero.weapon = 'Staff'
              hero.player = p
              hero.attack = (this.randomNum('stats')) + 8
              hero.defense = (this.randomNum('stats')) + 8
              hero.magic = (this.randomNum('stats')) + 10
              hero.skills = ['Fireball']
              hero.gender = this.randomNum('gender', 3) > 0 ? 'male' : 'female'
              hero.heroName = this.generateName(hero.gender, maleNamesUsed, femaleNamesUsed)
              break;
            case 'WR':
              hero.heroClass = 'Ranger';
              if (num1 >= 0 && num1 < 5) {
                hero.heroRace = 'Human'
              } else {
                hero.heroRace = 'Elf'
              }
              hero.weapon = 'Bow'
              hero.player = p
              hero.attack = (this.randomNum('stats')) + 10
              hero.defense = (this.randomNum('stats')) + 8
              hero.magic = (this.randomNum('stats')) + 8
              hero.skills = ['Power Shot']
              hero.gender = this.randomNum('gender', 3) > 0 ? 'male' : 'female'
              hero.heroName = this.generateName(hero.gender, maleNamesUsed, femaleNamesUsed)
              break;
            case 'RB':
              hero.heroClass = 'Warrior';
              if (num1 >= 0 && num1 < 5) {
                hero.heroRace = 'Half-orc'
              } else {
                hero.heroRace = 'Dwarf'
              }
              hero.weapon = 'Sword and Shield'
              hero.player = p
              hero.attack = (this.randomNum('stats')) + 11
              hero.defense = (this.randomNum('stats')) + 10
              hero.magic = (this.randomNum('stats')) + 8
              hero.skills = ['Shield Bash']
              hero.gender = this.randomNum('gender', 4) > 0 ? 'male' : 'female'
              hero.heroName = this.generateName(hero.gender, maleNamesUsed, femaleNamesUsed)
              break;
            case 'TE':
              hero.heroClass = 'Rogue';
              if (num1 >= 0 && num1 < 5) {
                hero.heroRace = 'Human'
              } else {
                hero.heroRace = 'Halfling'
              }
              hero.weapon = 'Dagger'
              hero.player = p
              hero.attack = (this.randomNum('stats')) + 9
              hero.defense = (this.randomNum('stats')) + 8
              hero.magic = (this.randomNum('stats')) + 8
              hero.skills = ['Sneak']
              hero.gender = this.randomNum('gender', 3) > 0 ? 'male' : 'female'
              hero.heroName = this.generateName(hero.gender, maleNamesUsed, femaleNamesUsed)
              break;
            case 'DEF':
              hero.heroClass = 'Paladin';
              if (num1 >= 0 && num1 < 5) {
                hero.heroRace = 'Dragonborn'
              } else {
                hero.heroRace = 'Aarakocra'
              }
              hero.weapon = 'Spear'
              hero.player = p
              hero.attack = (this.randomNum('stats')) + 10
              hero.defense = (this.randomNum('stats')) + 11
              hero.magic = (this.randomNum('stats')) + 9
              hero.skills = ['Minor Self-heal']
              hero.gender = this.randomNum('gender', 4) > 0 ? 'male' : 'female'
              hero.heroName = this.generateName(hero.gender, maleNamesUsed, femaleNamesUsed)
              break;
          }
          console.log(allHeroes.length)
          allHeroes.push(hero)
        });
        console.log(allHeroes.length)
        return allHeroes
      }

      randomNum(useCase, max) {
        if (useCase === 'race') {
          return Math.round(Math.random() * max)
        } else if (useCase === 'stats') {
          return Math.round(Math.random() * 2) + 1
        } else if (useCase === 'season') {
          // NOTE This will need to be adjusted once we get all the heroes added
          return Math.trunc(Math.random() * (2020 - 2011) + 2011)
        } else {
          return Math.floor(Math.random() * max)
        }
      }

  generateName(gender, maleNamesUsed, femaleNamesUsed) {
    const namesUsed = gender === 'male' ? maleNamesUsed : femaleNamesUsed;
    const namesArray = gender === 'male' ? maleNames : femaleNames;

    // Check if all names have been used
    const allNamesUsed = namesUsed.length === namesArray.length;

    // If all names have been used, reset the namesUsed array to allow reusing names
    if (allNamesUsed && gender === 'male') {
      maleNamesIndex = 0;
    } else if (allNamesUsed && gender === 'female') {
      femaleNamesIndex = 0
    }

    let name;
    if (gender === 'male') {
      name = namesArray[maleNamesIndex];
      maleNamesIndex++
    } else if (gender === 'female') {
      name = namesArray[femaleNamesIndex];
      femaleNamesIndex++
    }
    namesUsed.push(name);
    return name;
  }
}

export const generateHeroes = new GenerateHeroes()