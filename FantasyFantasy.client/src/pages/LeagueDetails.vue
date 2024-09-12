<template>
  <div class="container-fluid">
    <div class="row d-flex justify-content-center">
      <div class="col-4 text-center mt-5 border-top border-bottom border-primary">
        <h2>{{ league.leagueName }}</h2>
        <h6>{{ league.leagueStyle?.charAt(0).toUpperCase() + league.leagueStyle?.substr(1) }}</h6>
        <h6 v-if="league.privacyStatus == true">Your league's pin is: {{ league.pin }}</h6>
        <p v-if="league.hostId == account.id">This league is <span class="fst-italic">{{ league.activeStatus }}</span>.</p>
      </div>
      <!-- TODO In the future, we should have a manage league view -->
      <div class="col-12 d-flex justify-content-center pt-1" v-if="league.activeStatus?.toLowerCase() == 'active' && league.hostId == account.id">
        <button id="deactivateBtn" class="deactivateBtn" @click="deactivateLeague(league.id)">Deactivate League</button>
      </div>
      <!-- If league is inactive and user is host -->
      <div class="col-12 d-flex justify-content-center pt-1" v-else-if="league.activeStatus?.toLowerCase() == 'inactive' && league.hostId == account.id">
        <div class="d-flex flex-column align-items-center justify-content-center" v-if="league.participantsReady?.length !== (league.parties?.length -1)">
          <p>{{ league.participantsReady.length  }} out of {{ league.parties.length -1 || league.teams.length -1 }} units in your league are ready. </p>
          <p v-if="!heroesFilled" class="p-0 m-0 text-danger">Your party doesn't have enough heroes to start the league.</p>
          <button id="activateBtn" :disabled="heroesFilled ? false : true" :class="heroesFilled ? 'forceActivateBtn' : 'forceActivateBtn-disabled'" @click="activateLeague(league.id, true, account.id)">Force Start League</button>
        </div>
        <div v-else-if="league.participantsReady.length === (league.parties.length -1 || league.teams.length -1)" class="text-center">
          <p>All units in your league are ready to start!</p>
          <p v-if="!heroesFilled" class="p-0 m-0 text-danger">Your party doesn't have enough heroes to start the league.</p>
          <button id="activateBtn" :disabled="heroesFilled ? false : true" :class="heroesFilled ? 'activateBtn' : 'activateBtn-disabled'" class="" @click="activateLeague(league.id, false, account.id)">Start League</button>
        </div>
        <div v-else-if="(league.parties.length || league.teams.length) <= 1">
          <p>Still waiting on more people to join. When another user joins, you can start your league here.</p>
        </div>
      </div>
      <!-- If league is inactive and user is NOT host -->
      <div v-else-if="league.activeStatus?.toLowerCase() == 'inactive' && league.hostId !== account.id && !league.participantsReady.includes(account.id)">
        <div class="col-12 d-flex justify-content-center pt-1">
          <!-- TODO This needs a better font and styling -->
          <i>Is your unit ready?</i>
        </div>
        <div class="col-12 d-flex justify-content-center pt-1">
          <p v-if="!heroesFilled" class="p-0 m-0 text-danger">Your party doesn't have enough heroes to mark your unit as ready.</p>
          <button id="readyBtn" :disabled="heroesFilled ? false : true" :class="heroesFilled ? 'readyBtn' : 'readyBtn-disabled'" class="" @click="activateLeague(league.id, false, account.id)">Ready</button>
        </div>
      </div>
      <div v-else-if="league.activeStatus?.toLowerCase() == 'inactive' && league.hostId !== account.id && league.participantsReady.includes(account.id)">
        <div class="col-12 d-flex justify-content-center pt-1">
          <!-- TODO This needs a better font and styling -->
          <i>Your unit is ready. The league will start when all units are ready or the host starts it.</i>
        </div>
        <div class="col-12 d-flex justify-content-center pt-1">
          <button id="deactivateBtn" class="deactivateBtn" @click="deactivateLeague(league.id, account.id)">Not Ready</button>
        </div>
      </div>
      
      <!-- <h3>My team</h3>

      <h4>Opponents: {{ league.teams[0].teamName }}</h4> -->
      <div class="my-5">
        <h4>Standings</h4>
        <table class="table" v-if="league.teams?.length > 0">
          <thead>
            <tr>
              <th scope="col">Place</th>
              <th scope="col">Team</th>
              <th scope="col">Wins</th>
              <th scope="col">Losses</th>
              <th scope="col">Total Points</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="team in league.teams" :key="team.id">
              <th scope="row">1</th>
              <td>{{ team.teamName }}</td>
              <td>team.stats.wins</td>
              <td>team.stats.losses</td>
              <td>team.stats.totalPoints</td>
            </tr>
          </tbody>
        </table>
        <table class="table" v-else-if="league.teams?.length === 0 && league.parties.length > 0">
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Place</th>
              <th scope="col">Party</th>
              <th scope="col">Party Owner</th>
              <th scope="col">Weekly Points</th>
              <th scope="col">Season Points</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="party in league.parties" :key="party.id">
              <td class="ps-4"><i class="fs-4" :class="league.participantsReady.includes(account.id) ? 'mdi mdi-check text-success darken-20' : 'mdi mdi-alpha-x text-danger'"></i></td>
              <th class="ps-4" scope="row">1</th>
              <td>{{ party.partyName }}</td>
              <td>{{ league.participants.find(p => p?.id === party.accountId)?.name }}</td>
              <td>party.stats.totalPoints</td>
              <td>party.stats.totalPoints</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- SECTION Heroes -->
      <!-- TODO Should heroes be displayed here? Only if they can be switched in and out. Will that be allowed? -->
      <div v-if="league.leagueStyle === 'classic'">
        <h4>Available Heroes</h4>
        <div class="">
          <h6><router-link class="selectable text-primary" to="/party">Go to party details</router-link> to add heroes to your party.</h6>
        </div>
        <div v-if="league.heroes.length === 0">
          <p>No heroes found.</p>
          <button class="btn btn-primary" @click="generateHeroes(league.id)">Generate heroes</button>
        </div>
        <div v-else>
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Race</th>
                <th scope="col">Class</th>
                <th scope="col">Gender</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="hero in league.heroes.filter(h => !h.partyId)" :key="hero.id">
                <td>{{ hero.heroName }}</td>
                <td>{{hero.heroRace}}</td>
                <td>{{hero.heroClass}}</td>
                <td>{{hero.gender}}</td>
              </tr>
            </tbody>
          </table>  
        </div>
      </div>
      <!-- SECTION END Heroes -->
    </div>
  </div>
</template>

<script>
import { onMounted, computed, ref, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { AppState } from '../AppState';
import { leagueService } from '../services/LeagueService';
import { heroService } from '../services/HeroService';
import { femaleNames, maleNames, generateHeroes } from '../heroes';
import Pop from '../utils/Pop';
import { logger } from '../utils/Logger';

export default {
  setup() {
    let route = useRoute()
    let unitStatuses = reactive({unitsReady: [], unitsNotReady: []})
    let heroesFilled = ref()
    onMounted(async () => {
      logger.log('params', route.params.id)
      await leagueService.getById(route.params.id)
      logger.log('ActiveLeague', AppState.activeLeague)
      AppState.activeLeague.parties.forEach(p => {
        if (p.readyStatus === true) {
          unitStatuses.unitsReady.push(p)
        } else {
          unitStatuses.unitsNotReady.push(p)
        }
      })
      heroesFilled.value = AppState.activeLeague.parties.find(p => p.accountId == AppState.account.id).heroes >= 5
      logger.log('heroes', AppState.activeLeague.parties.find(p => p.accountId == AppState.account.id).heroes)
    })
    // Manually trigger reactivity update
    unitStatuses = reactive(unitStatuses);
    return {
      unitStatuses,
      heroesFilled,
      league: computed(() => AppState.activeLeague),
      account: computed(() => AppState.account),
      async generateHeroes(leagueId) {
        let heroes = await generateHeroes.generateLeagueHeroes();
        let updatedLeague = { id: leagueId, heroes: heroes }
        await leagueService.editLeague(updatedLeague)
      },

      async deactivateLeague(leagueId, accountId)
      {
        if (accountId == this.league.hostId)
        {
          const yes = await Pop.confirm('Are you sure you want to deactivate this league?', 'You can only reactivate this league when all teams are ready.')
          if (yes) {
            if (this.league.id == leagueId) {
              this.league.activeStatus = 'inactive';
              leagueService.editLeague(this.league)
            } else {
              Pop.error('League error-ID does not match', 'error')
            }
          }
        }
        else {
          const yes = await Pop.confirm('Are you sure you want to mark your unit as not ready?', '')
          if (yes) {
            if (this.league.id == leagueId) {
              this.league.participantsReady = this.league.participantsReady.filter(x => x != accountId);
              leagueService.editLeague(this.league)
            } else {
              Pop.error('League error-ID does not match', 'error')
            }
          }
        }
      },

      async activateLeague(leagueId, forceStart, accountId) {
        let yes;
        if (accountId == this.league.hostId) {
          if (forceStart) {
            yes = await Pop.confirm('Are you sure you want to force start this league?', 'We recommend you wait until all units are ready. A schedule will be generated for the league and it cannot be edited.')
          } else {
            yes = await Pop.confirm('Are you sure you want to activate your league?', 'A schedule will be generated for your league and there will be no going back.')
          }
          // FIXME This conditional is always true. What was the intent here?
          if (yes || !forceStart) {
            if (this.league.id == leagueId) {
              this.league.activeStatus = 'inactive';
              this.league.schedule = this.generateSchedule();
              // leagueService.editLeague(this.league)
            } else {
              Pop.error('League error-ID does not match', 'error')
            }
          }
        } else {
          yes = await Pop.confirm('Are you sure you want to mark your team as ready?', '')
          if (yes) {
            let updatedLeague = this.league
            updatedLeague.participantsReady.push(accountId)
            if (updatedLeague.participantsReady.length == (updatedLeague.participants - 1)) {
              this.league.activeStatus = 'active';
            }
            leagueService.editLeague(updatedLeague)
          }
        }
      },

      generateSchedule() {
        if(this.league.leagueStyle !== 'classic'){return}
        // let leagueUnits = this.league.teams + {teamName: 'BYE WEEK'};
        let leagueUnits = this.league.parties;
        // leagueUnits.push({ partyName: 'RECOVERY WEEK' }, { partyName: 'RECOVERY WEEK' })
        if (leagueUnits.length < 2 || leagueUnits.length > 6) {
          throw new Error("Invalid number of teams. Must be between 2 and 6.");
        }
        const schedule = [];
        const totalWeeks = 13;
        //For a given team, select random opponent for each week
        //If a team has been used more then 2-3 times, skip.
        //Save the faceoff to both leagueUnits' schedule
        for (let week = 1; week <= totalWeeks; week++) {
          const matchups = [];
          if (leagueUnits.length == 2 && week == 7) {
            matchups.push([leagueUnits[0], { partyName: 'REST' }], [leagueUnits[1], { partyName: 'REST' }])
          } else
          if (week <= totalWeeks) {
            // Regular weeks
            for (let i = 0; i < leagueUnits.length; i += 2) {
              const team1 = leagueUnits[i];
              const team2 = leagueUnits[i + 1];
              matchups.push([team1, team2]);
            }
          } 

          schedule.push({ week, matchups });
          this.rotateleagueUnits(leagueUnits); // Rotate leagueUnits for the next week
        }
        
        return schedule;
      },

      rotateleagueUnits(leagueUnits) {
      const lastTeam = leagueUnits.pop();
      leagueUnits.splice(1, 0, lastTeam);
      }
    }
  }
}
</script>

<style>
.deactivateBtn {
  background-color: transparent;
  color: rgb(202, 0, 0);
  border: none;
  width: 20%;
  transition: 1000ms;
}

.deactivateBtn:hover {
  background-color: rgb(202, 0, 0);
  color: rgb(221, 221, 221);
  border: none;
  width: 35%;
  transition: 1000ms;
}

.readyBtn {
  background-color: transparent;
  color: #056137;
  border: none;
  width: 20%;
  transition: 1000ms;
}

.readyBtn-disabled {
  background-color: transparent;
  color: #056137;
  border: none;
  width: 20%;
  transition: 1000ms;
}

.readyBtn:hover {
  background-color: #056137;
  color: rgb(221, 221, 221);
  border: none;
  width: 35%;
  transition: 1000ms;
}

.activateBtn {
  background-color: transparent;
  color: #056137;
  border: none;
  width: 35%;
  transition: 1000ms;
}

.activateBtn-disabled {
  background-color: rgb(226, 198, 171);
  color: #056137;
  border-radius: 5%;
  /* width: 35%; */
  transition: 1000ms;
}

.activateBtn:hover {
  background-color: #056137;
  color: rgb(221, 221, 221);
  border: none;
  width: 65%;
  transition: 1000ms;
}

.forceActivateBtn {
  background-color: transparent;
  color: #abab16;
  border: none;
  width: 55%;
  transition: 1000ms;
}

.forceActivateBtn-disabled {
  background-color: rgb(226, 198, 171);
  color: #abab16;
  border-radius: 5%;
  width: 55%;
}

.forceActivateBtn:hover {
  background-color: #abab16;
  color: rgb(222, 1, 1);
  border: none;
  width: 75%;
  transition: 1000ms;
}
</style>