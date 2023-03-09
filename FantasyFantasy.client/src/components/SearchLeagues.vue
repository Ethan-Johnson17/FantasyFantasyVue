<template>
  <div class="container-fluid">
    <div class="row justify-content-center mb-3">
      <div class="col-md-12">
        <div class="search">
          <div class="mb-3 m-3">
              <div class="input-group my-3">
                <input
                  v-model="search"
                  type="text"
                  class="form-control"
                  placeholder="Enter a league name or pin"
                  aria-label="Search Leagues"
                  aria-describedby="button-addon2"
                  @keyup="searchLeagues()"
                />
                <button
                  class="btn btn-outline-secondary"
                  id="button-addon2"
                >
                  Search
                </button>
              </div>
          </div>
        </div>
      </div>
    </div>
    <div class="row mb-2 border-bottom border-dark">
      <div class="col-4">
        <h6>League Name</h6>
      </div>
      <div class="col-4">
        <h6>League Style</h6>
      </div>
      <div class="col-4">
        <h6>League Host</h6>
      </div>
    </div>
    <div class="row pt-2 pb-0" :class="{'selectedLeague': selectedLeague === league}" v-for="league in results" :key="league.id" @click="selectedLeague = league">
      <div class="col-4">
        <h6>{{ league.leagueName }}</h6>
      </div>
      <div class="col-4">
        <p>{{ league.leagueStyle.toUpperCase() }}</p>
      </div>
      <div class="col-4">
        <p>{{ league.account.name }}</p>
      </div>
    </div>
    <!-- SECTION Team based leagues -->
    <div class="row mt-3 border-top border-dark d-flex justify-content-center" v-if="selectedLeague.leagueStyle !== 'classic'">
      <div class="col-8 mt-3">
        <h5 class="mb-3 text-center">Select a team to use in your chosen league</h5>
        <select name="assignTeamSelect" v-model="selectedTeam" id="assignTeamSelect" class="form-select" aria-label="Assign team to league">
          <option :value="team" v-for="team in myTeams" :key="team.id">{{ team.teamName }}</option>
        </select>
        <div class="mt-2 text-center border-top border-dark" v-if="selectedLeague.privacyStatus == 'true'">
          <label class="form-label" for="enteredPin">This league is private. Enter the league pin to join.</label>
          <input class="form-input" type="text" name="enteredPin" required v-model="enteredPin" />
          <p class="text-danger" v-if="enteredPin !== selectedLeague.pin && enteredPin.length === 6"> Incorrect pin</p>
        </div>
      </div>
    </div>
    <div class="row mt-3 border-top border-dark d-flex justify-content-end" v-if="selectedLeague.leagueStyle !== 'classic'">
      <div class="col-7 mt-3" v-if="selectedLeague.leagueName && selectedTeam.teamName && enteredPin == selectedLeague.pin">
        <h6>You'll be joining the {{ selectedLeague.leagueName }} with your team, {{ selectedTeam.teamName }}</h6>
      </div>
      <div class="col-5 mt-4" v-if="selectedLeague?.participants?.includes(account.id)">
        <h6 class="text-danger">You already have a team in this league.</h6>
      </div>
      <div class="col-3 mt-3">
        <button class="btn btn-outline-secondary" data-bs-dismiss="modal" :disabled="selectedLeague.privacyStatus == 'true' && enteredPin !== selectedLeague.pin && selectedLeague?.participants?.includes(account.id)" @click="joinLeague()">Join League</button>
      </div>
    </div>
    <!-- SECTION END -->
    <!-- SECTION Party based leagues -->
    <div class="row mt-3 border-top border-dark d-flex justify-content-center" v-if="selectedLeague.leagueStyle === 'classic'">
      <div class="col-8 mt-3">
        <h5 class="mb-3 text-center">Select a party to use in your chosen league</h5>
        <select name="assignPartySelect" v-model="selectedParty" id="assignPartySelect" class="form-select" aria-label="Assign party to league">
          <option :value="party" v-for="party in myParties" :key="party.id">{{ party.partyName }}</option>
        </select>
        <div class="mt-2 text-center border-top border-dark" v-if="selectedLeague.privacyStatus == 'true'">
          <label class="form-label" for="enteredPin">This league is private. Enter the league pin to join.</label>
          <input class="form-input" type="text" name="enteredPin" required v-model="enteredPin" />
          <p class="text-danger" v-if="enteredPin !== selectedLeague.pin && enteredPin.length === 6"> Incorrect pin</p>
        </div>
      </div>
    </div>
    <div class="row mt-3 border-top border-dark d-flex justify-content-end" v-if="selectedLeague.leagueStyle === 'classic'">
      <div class="col-7 mt-3" v-if="selectedLeague.leagueName && selectedParty.partyName && enteredPin == selectedLeague.pin">
        <h6>You'll be joining the {{ selectedLeague.leagueName }} with your team, {{ selectedParty.partyName }}</h6>
      </div>
      <div class="col-5 mt-4" v-if="selectedLeague?.participants?.includes(account.id)">
        <h6 class="text-danger">You already have a party in this league.</h6>
      </div>
      <div class="col-3 mt-3">
        <button class="btn btn-outline-secondary" data-bs-dismiss="modal" :disabled="selectedLeague.privacyStatus == 'true' && enteredPin !== selectedLeague.pin && selectedLeague?.participants?.includes(account.id)" @click="joinLeague()">Join League</button>
      </div>
    </div>
    <!-- SECTION END -->
  </div>
</template>

<script>
import { computed, onMounted, ref } from "@vue/runtime-core"
import { logger } from "../utils/Logger"
import { AppState } from "../AppState"
import { leagueService } from '../services/LeagueService'
import { teamService } from '../services/TeamService'
import { useRouter } from 'vue-router'
import Pop from "../utils/Pop"
import { partyService } from '../services/PartyService'
export default {
  setup() {
    const router = useRouter()
    const search = ref('')
    const results = ref([])
    const enteredPin = ref('')
    let selectedLeague = ref({})
    let selectedTeam = ref({})
    let selectedParty = ref({})
    onMounted(async () => {
      try {
        await leagueService.getAll()
      } catch (error) {
        logger.error(error)
      }
    })
    return {
      search,
      results,
      selectedLeague,
      selectedTeam,
      selectedParty,
      enteredPin,
      leagues: computed(() => AppState.leagues),
      myLeagues: computed(() => AppState.myLeagues),
      myTeams: computed(() => AppState.myTeams.filter(t => !t.leagueId)),
      myParties: computed(() => AppState.myParties.filter(t => !t.leagueId)),
      account: computed(() => AppState.account),
      
      async searchLeagues() {
        try {
          // TODO include loader
          if (search.value.length < 3) {
            return
          }
          this.results = this.leagues.filter(l => l.leagueName.toLowerCase().includes(search.value.toLowerCase()) || l.pin == search.value)
        } catch (error) {
          logger.error(error)
        }
      },

      async joinLeague() {
        console.log(selectedParty, selectedLeague)
        try {
          if (selectedLeague.value.leagueStyle === 'classic') {
            if (!selectedParty || !selectedLeague) {
              Pop.toast('Please make all necessary selections', 'error')
              return
            }
            let party = selectedParty.value
            party.leagueId = selectedLeague.value.id
            // TODO need notification telling what's missing
            await leagueService.joinLeague(selectedLeague.value, party)
            await partyService.editParty(party.id, party)
            search.value = ''
          } else {
            console.log('bad')
            if (!selectedTeam || !selectedLeague) {
              Pop.toast('Please make all necessary selections', 'error')
              return
            }
            let team = selectedTeam.value
            team.leagueId = selectedLeague.value.id
            // TODO need notification telling what's missing
            await leagueService.joinLeague(selectedLeague.value, team)
            await teamService.editTeam(team.id, team)
            search.value = ''
            
          }
          router.push({
            name: "LeagueDetails",
            params: { id: selectedLeague.value.id }
          })
          selectedParty = {}
          selectedTeam = {}
          selectedLeague = {}
        } catch (error) {
          logger.error(error)
          Pop.toast('error', 'error')

        }
      }
    }
  }
}
</script>

<style>
 .selectedLeague {
  background-color: #056137;
  color: white;
 }
 
</style>