<template>
  <div class="container-fluid">
    <div class="row d-flex justify-content-center">
      <div class="col-4 text-center mt-5 border-top border-bottom border-primary">
        <h2>{{ league.leagueName }}</h2>
        <h6>{{ league.leagueStyle?.charAt(0).toUpperCase() + league.leagueStyle?.substr(1) }}</h6>
        <h6 v-if="league.privacyStatus == true">Your league's pin is: {{ league.pin }}</h6>
        <p v-if="league.hostId == account.id">This league is <span class="fst-italic">{{ league.activeStatus }}</span>.</p>
        <button v-if="league.hostId == account.id" id="leaveBtn" class="btn btn-sm btn-outline-danger py-0 mb-3" @click="leaveLeague(league.id, account.id)">Cancel League</button>
      </div>
      <!-- TODO In the future, we should have a manage league view -->
      <div class="col-12 d-flex justify-content-center pt-1" v-if="league.activeStatus?.toLowerCase() == 'active' && league.hostId == account.id">
        <button id="deactivateBtn" class="deactivateBtn" @click="deactivateLeague(league.id, account.id)">Deactivate League</button>
      </div>
      <!-- If league is inactive and user is host -->
      <div class="col-12 d-flex justify-content-center pt-1" v-else-if="league.activeStatus?.toLowerCase() == 'inactive' && league.hostId == account.id">
        <div class="d-flex flex-column align-items-center justify-content-center" v-if="league.participantsReady?.length !== (league.parties?.length -1)">
          <p>{{ league.participantsReady.length  }} out of {{ league.parties.length -1 || league.teams.length -1 }} units in your league are ready. </p>
          <p v-if="!heroesFilled" class="p-0 m-0 text-danger">Your party doesn't have enough heroes to start the league. <router-link class="selectable text-primary" to="/party">Go to party details</router-link> to add heroes to your party.</p>
          <button id="activateBtn" :disabled="heroesFilled ? false : true" :class="heroesFilled ? 'forceActivateBtn' : 'forceActivateBtn-disabled'" @click="activateLeague(league.id, true, account.id)">Force Start League</button>
        </div>
        <div v-else-if="league.participantsReady.length === (league.parties.length -1 || league.teams.length -1)" class="text-center">
          <p>All units in your league are ready to start!</p>
          <p v-if="!heroesFilled" class="p-0 m-0 text-danger">Your party doesn't have enough heroes to start the league. <router-link class="selectable text-primary" to="/party">Go to party details</router-link> to add heroes to your party.</p>
          <button id="activateBtn" :disabled="heroesFilled ? false : true" :class="heroesFilled ? 'activateBtn' : 'activateBtn-disabled'" @click="activateLeague(league.id, false, account.id)">Start League</button>
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
        <!-- IF Unit doesn't have enough heroes, cannot be marked as ready -->
        <div class="col-12 d-flex justify-content-center pt-1">
          <p v-if="!heroesFilled" class="p-0 m-0 text-danger">Your party doesn't have enough heroes to mark your unit as ready. <router-link class="selectable text-primary" to="/party">Go to party details</router-link> to add heroes to your party.</p>
        </div>
        <div class="col-12 d-flex justify-content-center pt-1">
          <button id="readyBtn" :disabled="heroesFilled ? false : true" :class="heroesFilled ? 'readyBtn' : 'readyBtn-disabled'" @click="activateLeague(league.id, false, account.id)">Ready</button>
        </div>
        <div class="col-12 d-flex justify-content-center pt-1">
          <button id="leaveBtn" class="btn btn-sm btn-outline-danger py-0" @click="leaveLeague(league.id, account.id)">Leave League</button>
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
          </div>
      
      <!-- <h3>My team</h3>

      <h4>Opponents: {{ league.teams[0].teamName }}</h4> -->
      <div class="row">
        <div class="col-12">

        
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
              <th class="d-flex justify-content-center" v-if="league.hostId === account.id">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="party in league.parties" class="selectable" :key="party.id" @mouseenter="showRemoveBtn(party.partyName, party.accountId)" @mouseleave="showRemoveBtn(party.partyName, party.accountId)">
              <td class="ps-4"><i class="fs-4" :class="unitStatuses.unitsReady.includes(party) ? 'mdi mdi-check text-success darken-20' : 'mdi mdi-alpha-x text-danger'"></i></td>
              <th class="ps-4" scope="row">1</th>
              <td>{{ party.partyName }}</td>
              <td>{{ league.participants.find(p => p?.id === party.accountId)?.name }}</td>
              <td>party.stats.totalPoints</td>
              <td>party.stats.totalPoints</td>
              <!-- TODO the remove button should only show on hover -->
              <div class="d-flex justify-content-center"><i v-if="league.hostId === account.id" :id="party.partyName" hidden="true" class="mdi mdi-account-cancel-outline fs-4 px-2 text-danger selectable" :title="'Remove ' + party.account.name + ' from the league'" @click="leaveLeague(league.id, party.accountId)"></i></div>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
      </div>

      <div v-if="schedule?.length > 0">
        <div class="row ps-3">
          <h3>League Schedule</h3>
          <!-- TODO for leagues with more teams than two or three we will want to show only the current week and/or the next week -->
          <div class="col-8" v-for="fight in schedule.slice(0, 1)" :key="fight.week">
            <h4>Week {{ fight.week }}</h4>
            <!-- TODO The side of the victor should be highlighted in past weeks and in current or future weeks the side with a better record -->
             <div v-for="m in fight.matchups" :key="m.indexOf()">
            <div class="table table-striped border border-dark row" v-if="m[0].partyName !== 'REST WEEK' && m[1].partyName !== 'REST WEEK'">
              <div class="col-12">
                <div class="row border-bottom border-dark" :style="'background: ' + m[0].logoColor +'; background: linear-gradient(124deg, ' + m[0].logoColor + ' 20%, rgba(130,155,138,0) 40%, rgba(108,124,118,0) 60%,' + m[1].logoColor +' 80%);'">
                  <!-- TODO Add party logos here -->
                  <h5 class="text-start col-5" :style="{ color: getContrastYIQ(m[0].logoColor) }">#1 {{ m[0].partyName }}</h5>
                  <h5 class="text-center col-2 fw-bold">Vs.</h5>
                  <h5 class="text-end col-5" :style="{ color: getContrastYIQ(m[1].logoColor) }">#3 {{ m[1]?.partyName }}</h5>
                </div>
                <div class="row">
                  <div class="col-6 border-dark border-end">
                    <div class="row">
                      <h6 class="col-6 text-center">W/L</h6>
                      <h6 class="col-6 text-center">Score</h6>
                    </div>
                  </div>
                  <div class="col-6 border-dark border-start">
                    <div class="row">
                      <h6 class="col-6 text-center">Score</h6>
                      <h6 class="col-6 text-center">W/L</h6>
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-12">
                <div class="row border-top border-dark">
                  <div class="col-6 border-dark border-end">
                    <div class="row">
                      <p class="col-6 mb-0 p-1 text-center">
                        3-0
                      </p>
                      <p class="col-6 mb-0 p-1 text-center">
                        47.32
                      </p>
                    </div>
                  </div>
                  <div class="col-6 border-dark border-start">
                    <div class="row">
                      <p class="col-6 mb-0 p-1 text-center">
                        0-3
                      </p>
                      <p class="col-6 mb-0 p-1 text-center">
                        37.71
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="table table-striped border border-dark row" v-else>
              <div class="col-12">
                <div class="row border-bottom border-dark" :style="'background-color:' + (m[0].logoColor ? m[0].logoColor : m[1].logoColor) + '; color: ' + (m[0].logoColor ? getContrastYIQ(m[0].logoColor) : getContrastYIQ(m[1].logoColor) + ';')">
                  <!-- TODO Add party logos here -->
                  <h5 class="text-start col-4">#1 {{ m[0].partyName === 'REST WEEK' ?  m[1]?.partyName : m[0]?.partyName}}</h5>
                  <h5 class="text-center col-4">- REST WEEK -</h5>
                  <h5 class="text-end col-4">W/L 3-1</h5>
                </div>
                <div class="row bg-grey d-flex justify-content-center">
                  <h6 class="col-6 text-center">Next Week:</h6>
                </div>
              </div>
              <div class="col-12 text-center">
                <p class="mb-0 p-1 text-center">
                  Next Opponent
                </p>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      <!-- SECTION Heroes -->
      <!-- TODO Should heroes be displayed here? Only if they can be switched in and out. Will that be allowed? -->
      <div class="row" v-if="league.leagueStyle === 'classic'">
        <div class="col-12">
        <h4>Available Heroes</h4>
        <div>
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
import { partyService } from '../services/PartyService';

export default {
  setup() {
    let route = useRoute()
    let unitStatuses = reactive({unitsReady: [], unitsNotReady: []})
    let heroesFilled = ref(true)
    let schedule = ref([])
    onMounted(async () => {
      await leagueService.getById(route.params.id)
      AppState.activeLeague.parties.forEach(p => {
        if (AppState.activeLeague.participantsReady.includes(p.accountId)) {
          unitStatuses.unitsReady.push(p)
          p.readyStatus == true
        } else {
          unitStatuses.unitsNotReady.push(p)
        }
        schedule.value = AppState.activeLeague.schedule
      })
      logger.log('ActiveLeague', AppState.activeLeague)

      heroesFilled.value = AppState.activeLeague.parties.find(p => p.accountId == AppState.account.id).heroes.length >= 5
    })
    // Manually trigger reactivity update
    unitStatuses = reactive(unitStatuses);
    return {
      unitStatuses,
      heroesFilled,
      schedule,
      league: computed(() => AppState.activeLeague),
      account: computed(() => AppState.account),
      async generateHeroes(leagueId) {
        let heroes = await generateHeroes.generateLeagueHeroes();
        let updatedLeague = { id: leagueId, heroes: heroes }
        await leagueService.editLeague(updatedLeague)
      },

      async deactivateLeague(leagueId, accountId)
      {
        logger.log(accountId, this.league)
        if (accountId == this.league.hostId)
        {
          // TODO We need to decide if we want to allow reactivation and how that is handled. Will we rebuild a schedule? Keep the same? Now setup to keep the same schedule, so teams cannot be added. 
          const yes = await Pop.confirm('Are you sure you want to deactivate this league?', 'You can only reactivate this league if no matchups have been completed.')
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
            yes = await Pop.confirm('Are you sure you want to force start this league?', 'We recommend you wait until all units are ready. A combat schedule will be generated for the league and it cannot be edited.')
          } else {
            yes = await Pop.confirm('Are you sure you want to activate your league?', 'A combat schedule will be generated for your league and there will be no going back.')
          }
          // FIXME This conditional is always true. What was the intent here?
          if (yes || !forceStart) {
            if (this.league.id == leagueId) {
              this.league.activeStatus = 'active';
              this.league.participantsReady.push(accountId)
              this.league.schedule = this.league.schedule.length < 1 ? this.generateSchedule() : this.league.schedule;
              schedule.value = this.league.schedule
              let week1Faceoff = this.buildFaceoff()
              // NOTE add this in when we are ready to start the league
              leagueService.editLeague(this.league)

            } else {
              Pop.error('League error-ID does not match', 'error')
            }
          }
        } else {
          yes = await Pop.confirm('Are you sure you want to mark your team as ready?', '')
          if (yes) {
            let updatedLeague = this.league
            updatedLeague.participantsReady.push(accountId)
            // NOTE this is to make the league auto-ready when all units mark themselves as ready
            // TODO Auto start should be a toggle available to the host AND/OR only used after host marks themselves as ready
            // if (updatedLeague.participantsReady.length == (updatedLeague.participants - 1)) {
            //   updatedLeague.activeStatus = 'active';
            // }
            leagueService.editLeague(updatedLeague)
          }
        }
      },

      generateSchedule() {
        if (this.league.leagueStyle !== 'classic') {
          return;
        }

        let leagueUnits = [...this.league.parties];  // Copy the teams
        if (leagueUnits.length < 2 || leagueUnits.length > 6) {
          throw new Error("Invalid number of teams. Must be between 2 and 6.");
        }

        const totalWeeks = 13;
        const totalTeams = leagueUnits.length;
        const schedule = [];

        // Add "REST WEEK" team if there's an odd number of teams
        if (totalTeams % 2 !== 0) {
          leagueUnits.push({ partyName: 'REST WEEK' });
        }

        const totalMatchWeeks = totalTeams - 1;  // Each team plays every other team once
        const matchupsPerWeek = totalTeams / 2;  // Number of matchups per week

        for (let week = 1; week <= totalWeeks; week++) {
          const matchups = [];

          // Perform round-robin matching by rotating teams
          for (let i = 0; i < matchupsPerWeek; i++) {
            const team1 = leagueUnits[i];
            const team2 = leagueUnits.filter(t => t.id !== team1.id)[totalTeams - 1 - i];
            matchups.push([team1, team2]);
          }

          schedule.push({ week, matchups });

          // Rotate the teams (except the first one) for the next round
          leagueUnits.splice(1, 0, leagueUnits.pop());
        }

        return schedule;
      },

      buildFaceoff() {
        logger.log('schedule', schedule.value)
      },

      rotateleagueUnits(leagueUnits) {
        const lastTeam = leagueUnits.pop();
        leagueUnits.splice(1, 0, lastTeam);
      },

      getContrastYIQ(hexColor) {
        let r = parseInt(hexColor.substring(1, 3), 16);
        let g = parseInt(hexColor.substring(3, 5), 16);
        let b = parseInt(hexColor.substring(5, 7), 16);
        
        let yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return (yiq >= 128) ? 'black' : 'white';
      },

      async leaveLeague(leagueId, accountId) {
        // If accountId is host, cancel league. If accountId is not host but user is, remove participant. Else, leave league
        if (this.league.id === leagueId) {
          let yes;
          // Is user hsot?
          if (accountId === this.league.hostId) {
            yes = await Pop.confirm("Are you sure you want to cancel this league?", "This action cannot be undone. If you still planb to use this leage, simply leave it as inactive.")
            if (yes) {
              this.league.activeStatus = "canceled"
              await leagueService.editLeague(this.league)
            }
            // Is host removing a participant? Is a participant leaving the league?
          } else {
            if (this.account.id === this.league.hostId) {
              yes = await Pop.confirm("Are you sure you want to remove this participant?", "")
            } else {
              yes = await Pop.confirm("Are you sure you want to leave this league?", "")
            }
            if (yes) {
              // NOTE This should work for leaving a party and host removing a participant. Has not been tested.
              let party = this.league.parties.find(p => p.id === accountId)
              party.league = null;
              party.leagueId = null;
              this.league.heroes.push(...party.heroes)
              party.heroes = []
              this.league.participants.filter(p => p.id !== accountId)
              this.league.participantsReady.filter(p => p.id !== accountId)
              await leagueService.editLeague(this.league)
              await partyService.editParty(party.id, party)
            }
          }
        } else {
          logger.error('This league id does not match.')
        }
      },

      showRemoveBtn(elemId, accountId) {
        if(this.account.id !== this.league.hostId){return}
        if (accountId !== this.league.hostId) {
          let bool = document.getElementById(elemId).hidden
          document.getElementById(elemId).hidden = !bool
        }
      },


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
  background-color: rgb(226, 198, 171);
  color: #056137;
  border-radius: 5%;
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

.w-10 {
  width: 10%;
}

.w-45 {
  width: 45%;
}
.w-45 {
  width: 45%;
}
.w-45 {
  width: 45%;
}
</style>