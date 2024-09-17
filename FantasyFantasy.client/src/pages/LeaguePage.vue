<template>
  <div class="container" v-if="!toggleStartLeague">
    <Loader v-if="loading"></Loader>
    <div class="row mt-3">
      <div class="col-12 d-flex">
        <h2>My Leagues</h2>
        <div class="mt-1 ms-4">
          <button class="btn rounded btn-outline-primary" @click="toggleStartLeague = !toggleStartLeague">Host League</button>
        </div>
        <div class="mt-1 ms-4">
          <button class="btn rounded btn-outline-primary" data-bs-toggle="modal" data-bs-target="#findLeague" @click="getMyTeamsAndParties()">Join League</button>
          <Modal id="findLeague">
            <template #modal-title>Find a League to Join</template>
            <template #modal-body>
              <SearchLeagues></SearchLeagues>
            </template>
          </Modal>
        </div>
      </div>
      <hr class="w-50 ms-2 mt-1">
      <div class="col-12">
        <div class="row ps-2">
          <div class="col-md-3">
            <h5>League Name</h5>
          </div>
          <div class="col-md-2">
            <h5>Style</h5>
          </div>
          <div class="col-md-2">
            <h5>Privacy Status</h5>
          </div>
          <div class="col-md-2">
            <h5># of participants</h5>
          </div>
        </div>
      </div>
    </div>
    <div class="row my-4 ps-2">
      <div class="col-12">
        <h3 class="border-bottom border-dark w-50">Hosted Leagues</h3>
        <div class="row my-1" v-for="hl in hostedLeagues" :key="hl.id">
          <div class="col-12 selectable" @click="leagueDetails(hl, 'host')">
            <div class="row" v-if="hl.leagueName">
              <div class="col-md-3">
                <h5>{{ hl.leagueName }}</h5>
              </div>
              <div class="col-md-2">
                <h5>{{ hl.leagueStyle.charAt(0).toUpperCase() + hl.leagueStyle.substr(1) }}</h5>
              </div>
              <div class="col-md-2">
                <h5>{{ hl.privacyStatus ? 'Private' : 'Public' }}</h5>
              </div>
              <div class="col-md-2">
                <h5>{{ hl.teams.length || hl.parties.length }}</h5>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="row my-4 ps-2">
      <div class="col-12">
        <h3>Joined Leagues</h3>
        <div class="row" v-for="jl in joinedLeagues" :key="jl.id">
          <div class="col-12 selectable" @click="leagueDetails(jl, 'joined')">
              <div class="row">
              <div class="col-md-3">
                <h5>{{ jl.leagueName }}</h5>
              </div>
              <div class="col-md-2">
                <h5>{{ jl.leagueStyle }}</h5>
              </div>
              <div class="col-md-2">
                <h5>{{ jl.privacyStatus ? 'Private' : 'Public' }}</h5>
              </div>
              <div class="col-md-2">
                <h5>{{ jl.teams.length || jl.parties.length }}</h5>
              </div>
            </div>
            </div>
        </div>
      </div>
    </div>
    <!-- <div class="row my-4 ps-2">
      <div class="col-12">
        <h4>League Invitations</h4>
      </div>
    </div> -->
  </div>
<!-- FIXME This should be displayed dependent on the route params -->
  <div class="container pt-5" id="startLeagueContainer" v-else-if="toggleStartLeague">
    <div class="col-md-2 backBtn fw-bold" @click="toggleStartLeague = !toggleStartLeague"><i class="mdi mdi-arrow-left"></i> Back</div>
    <StartLeague :account="account" />
  </div>

  <div class="container d-none" id="leagueCreatedContainer">
    <LeagueCreated />
  </div>
</template>

<script>
import { computed, watchEffect } from '@vue/runtime-core'
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { AppState } from '../AppState';
import { leagueService } from '../services/LeagueService';
import { teamService } from '../services/TeamService';
import { partyService } from '../services/PartyService';
import { logger } from '../utils/Logger';
export default {
  setup() {
    let router = useRouter()
    let toggleStartLeague = ref(false)
    let loading = ref(true)
    onMounted( async() => {
      await leagueService.getMyLeagues();
      await teamService.getMyTeams('account/myTeams')
      await partyService.getMyParties('account/myParties')
      if (AppState.leagues) {
        loading.value = false
      }
      })
    return {
      toggleStartLeague,
      loading,
      account: computed(() => AppState.account),
      hostedLeagues: computed(() => AppState.myLeagues),
      joinedLeagues: computed(() => AppState.joinedLeagues),

      leagueDetails(league, ownership) {
        AppState.activeLeague = league
        router.push({
          name: "LeagueDetails",
          params: { id: league.id }
        })
      },

      async getMyTeamsAndParties() {
        await teamService.getMyTeams('account/myTeams')
        await partyService.getMyParties('account/myParties')
      }
    }
  }
}
</script>

<style>
.backBtn {
  transition: 300ms;
  margin-bottom: 3px;
  color: black;
}

.backBtn:hover {
  cursor: pointer;
  color: #056137;
  transition: 300ms;
  margin-bottom: 1px;
}
</style>