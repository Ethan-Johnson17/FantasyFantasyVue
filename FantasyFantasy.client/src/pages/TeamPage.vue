<template>
  <div class="container">
    <div class="row">
      <div class="col-12 d-flex">
        <h2 class="me-3">My Teams</h2>
        <TeamBuilder :teams="teams"></TeamBuilder>
      </div>
    </div>
    <div class="row mt-4" v-if="teams.length !== 0">
      <div class="col teamContainer" v-for="team in teams" :key="team.id" :id="'team' + team.id" @click="selectedTeam=team">
        <TeamCarousel :team="team" />
      </div>
    </div>
  </div>
  <div class="container-fluid" v-if="teamDetails">
    <div class="row bg-white" id="teamDetailsSection">
      <TeamDetails :team="teamDetails"/>
    </div>
  </div>
</template>

<script>
import { computed, watchEffect } from '@vue/runtime-core'
import { onMounted, ref } from 'vue';
import { AppState } from '../AppState';
import { teamService } from '../services/TeamService';
export default {
  setup() {
    let selectedTeam = ref({})
    onMounted(async () => {
      await teamService.getMyTeams('account/myTeams')
    })
    return {
      teams: computed(() => AppState.myTeams),
      teamDetails: computed(() => AppState.myTeams.filter(t => t.id == selectedTeam.value.id)[0]),
      selectedTeam,

    }
  }
}
</script>

<style>
.myTeamsLogos {
  width: 100px;
}

.teamContainer {
  transition: 500ms;
}

:hover.teamContainer {
  transform: scale(1.5);
  transition: 500ms;
}

#teamDetailsSection {
  height: 60vh;
}
</style>

<!-- Check for players, if no players in the team, show build team button -->
<!-- My teams display in a carousel -->