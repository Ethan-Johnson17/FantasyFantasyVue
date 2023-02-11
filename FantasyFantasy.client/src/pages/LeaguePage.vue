<template>
  <div class="container-fluid" v-if="!toggleStartLeague && !leagueCreated">
      <div class="row mt-3">
      <div class="col-12 d-flex">
        <h2>My Leagues</h2>
        <div class=" mt-1 ms-4">
          <button class="btn rounded btn-outline-primary" @click="toggleStartLeague = !toggleStartLeague">Host League</button>
        </div>
      </div>
      <hr class="w-50 ms-2 mt-1">
    </div>
    <div class="row">
      <div class="col-12">
        <h3>Hosted Leagues</h3>
        <div class="row">
          <div class="col-12"></div>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="col-12">
        <h3>Joined Leagues</h3>
        <div class="row">
          <div class="col-12"></div>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="col-12">
        <h4>League Invitations</h4>
      </div>
    </div>
  </div>

  <div class="container pt-5" id="startLeagueContainer" v-else-if="toggleStartLeague">
    <StartLeague @league-created="test($event)" />
  </div>

  <div class="container d-none" id="leagueCreatedContainer">
    <LeagueCreated />
  </div>
</template>

<script>
import { computed, watchEffect } from '@vue/runtime-core'
import { onMounted, ref } from 'vue';
import { AppState } from '../AppState';
export default {
  setup() {
    let toggleStartLeague = ref(false)
    let leagueCreated = ref(false)
    return {
      toggleStartLeague,
      leagueCreated,
      account: computed(() => AppState.account),
      hostedLeagues: computed(() => AppState.leagues.filter(l => l.hostId == account.id)),
      joinedLeagues: computed(() => AppState.leagues.filter(l => l.participants.contains(account.id))),

      test(event) {
        document.getElementById('startLeagueContainer').classList.add('d-none')
        document.getElementById('leagueCreatedContainer').classList.remove('d-none')
      }
    }
  }
}
</script>

<style>

</style>