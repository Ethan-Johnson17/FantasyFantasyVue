<template>
  <div class="row">
    <div class="col-12 mt-3">
      <h2>Start a League!</h2>
    </div>
  </div>
  <form @submit.prevent="startLeague()">
  <div class="row d-flex mt-3">
    <div class="col-md-6 my-3">
        <label for="leagueName" class="form-label fs-5">League Name</label>
        <input type="text" class="form-control" minlength="3" id="leagueName" v-model="state.editable.leagueName" placeholder="Freedom Fighters">
    </div>
    <div class="col-md-4 form-check my-4 d-flex justify-content-center">
      <input class="form-check-input mt-4" type="checkbox" id="privacyStatus" v-model="state.editable.privacyStatus">
      <label class="form-check-label ms-3 mt-3 fs-5" for="privacyStatus">
        Private League
      </label>
    </div>
    <div class="col-md-6 mt-4">
        <label for="leagueStyleSelect" class="form-label fs-5">League Style</label>
        <select class="form-select" aria-label="League Style" v-model="state.editable.leagueStyle">
          <option value="classic" selected>Classic</option>
          <option value="crossover">Crossover</option>
          <option value="coOp" disabled>Co-op (coming soon)</option>
          <option value="freeForAll" disabled>Free-for-all (coming soon)</option>
          <option value="loneWolf" disabled>Lone Wolf (coming soon)</option>
        </select>
        <div class="mt-2 ms-1">
          <p class="p-0">Not sure which style you want?
          <span class="p-0 offcanvasLink fst-italic" data-bs-toggle="offcanvas" data-bs-target="#leagueStyles"> Learn more here.</span></p>
        </div>
    </div>
    <div class="col-md-6 mt-4" v-if="state.editable.leagueStyle === 'classic'">
      <!-- TODO Need to add team to hostLeague request -->
      <div class="d-flex justify-content-between">
        <label for="leaguePartySelect" class="form-label fs-5">Party:</label>
        <button title="New Party" class="btn btn-sm btn-outline-secondary py-0 h-50 ms-2 border-none" @click="goToCreatePage('Party')">Go to parties</button>
      </div>
        <select class="form-select" aria-label="League Party" v-model="state.editable.unit" :disabled="myParties.length === 0">
          <option v-for="party in myParties" :key="party.id" :value="party" selected>{{ party.partyName }}</option>
        </select>
        <div class="mt-2 ms-1">
          <p class="p-0">Select the party you want to use in your new league!</p>
        </div>
    </div>
    <div class="col-md-6 mt-4" v-else>
      <!-- TODO Need to add team to hostLeague request -->
        <label for="leagueStyleSelect" class="form-label fs-5">Team:</label>
        <select class="form-select" aria-label="League Style" v-model="state.editable.unit">
          <option v-for="team in myTeams" :key="team.id" :value="team" selected>{{ team.teamName }}</option>
        </select>
        <div class="mt-2 ms-1">
          <p class="p-0">Select the team you want to use in your new league!</p>
        </div>
    </div>
  </div>
  <div class="row d-flex justify-content-center">
    <div class="col-2">
      <button class="btn btn-lg fs-5 btn-secondary w-100" @click="$emit('leagueCreated', true)">Start</button>
    </div>
  </div>
  <!-- TODO this should be on a success page after creation -->
  <!-- <div class="row d-flex justify-content-center mt-3">
    <div class="col-8 d-flex justify-content-center">
      <p v-if="state.editable.privacyStatus === true">Upon creation of the league, a pin will be assigned. This pin can be
        used by friends to join the league.</p>
    </div>
  </div> -->
</form>



  <Offcanvas id="leagueStyles">
    <template #offcanvas-title>League Styles</template>
    <template #offcanvas-body>
      <LeagueStyles />
    </template>
  </Offcanvas>
</template>

<script>
import { computed, onMounted, reactive, ref } from 'vue';
import { AppState } from '../AppState';
import { teamService } from '../services/TeamService';
import { leagueService } from '../services/LeagueService';
import { logger } from '../utils/Logger';
import Pop from '../utils/Pop';
import { femaleNames, maleNames } from '../heroes';
import { playersService } from '../services/PlayersService';
import { partyService } from '../services/PartyService';
import { useRouter } from 'vue-router';

export default {
  props: {
    account: {
      type: Object
    }
  },
  emits: ['leagueCreated'],
  methods: {
    submit() {
      this.$emit('leagueCreated')
    }
  },
  setup(props) {
    // const emit = defineE(['leagueCreated', leagueCreated])
    const router = useRouter()
    const state = reactive({
      editable: {
        privacyStatus: false,
        unit: {},
        leagueStyle: '',
        leagueName: '',
        heroes: [],
        participants: []
      }
    })
    onMounted(() => {
      console.log(AppState.myTeams)
    })
    // let leagueCreated = ref(false)
    return {
      state,
      // TODO need to filter out teams that are already assigned to a league. How will a league be attached to a team? 
      // When creating or joining a league, should have option to create a team
      myTeams: computed(() => AppState.myTeams.filter(t => !t.leagueId)),
      myParties: computed(() => AppState.myParties.filter(p => !p.leagueId)),

      async startLeague() {
        try {
          let league = {}
          league = state.editable
          if (league.leagueStyle === 'classic') {
            league.heroes = await this.generateHeroes()
          }
          league.hostId = props.account.id
          await leagueService.startLeague(league)
          let activeLeague = AppState.activeLeague
          let unit = state.editable.unit
          unit.leagueId = league.id
          await leagueService.joinLeague(activeLeague, unit)
          console.log(league.leagueStyle)
          if (league.leagueStyle.toLowerCase() === 'classic') {
            await partyService.editParty(unit.id, unit)
          } else {
            await teamService.editTeam(unit.id, unit)
          }
          router.push({
            name: "LeagueDetails",
            params: { id: activeLeague.id }
          })
          state.editable = {}
        } catch (error) {
          logger.error(error)
          Pop.toast(error.message, 'error')
        }
      },

      // TODO Limit number of heroes to number of names
      async generateHeroes() {
        let allHeroes = []
        let year = this.randomNum('season')
        // TODO does the year need to be saved within the party? If heroes are generated by each party, yes. 
        // If heroes are generated for the party, year will be saved to the hero. 
        let players = await playersService.getMyFDPPlayerData('api/players/fdpPlayers/' + year);
        players.forEach(p => {
          let hero = {}
          let num1 = this.randomNum('race', 10)
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
              hero.heroName = this.generateName(hero.gender)
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
              hero.heroName = this.generateName(hero.gender)
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
              hero.heroName = this.generateName(hero.gender)
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
              hero.heroName = this.generateName(hero.gender)
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
              hero.heroName = this.generateName(hero.gender)
              break;
          }
          allHeroes.push(hero)
        });
        console.log(allHeroes)
        return allHeroes
      },

      goToCreatePage(pageName) {
        // Push to parties page
        // Pop modal
        // Push back to league page
        router.push({
          name: pageName
        })
        
        // router.go(-1)
      },

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
      },

      generateName(gender) {
        if (gender === 'male') {
          let num = this.randomNum('male', 62)
          let name = maleNames[num]
          return name
        } else if (gender === 'female') {
          let num = this.randomNum('female', 43)
          let name = femaleNames[num]
          return name
        }
      }
  }
}
}
</script>

<style>
#privacyStatus {
  transform: scale(1.5);
}

.offcanvasLink {
  color: #056137;
}

.offcanvasLink:hover {
  color: #004C54;
  cursor: pointer;
}
</style>