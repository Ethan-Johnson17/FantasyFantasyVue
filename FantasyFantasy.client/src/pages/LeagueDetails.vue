<template>
  <div class="container-fluid">
    <div class="row d-flex justify-content-center">
      <div class="col-4 text-center mt-5 border-top border-bottom border-primary">
        <h2>{{ league.leagueName }}</h2>
        <h6>{{ league.leagueStyle?.charAt(0).toUpperCase() + league.leagueStyle?.substr(1) }}</h6>
      </div>
      <!-- <h3>My team</h3>

      <h4>Opponents: {{ league.teams[0].teamName }}</h4> -->
      <h4>Standings</h4>
      <table class="table">
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
      <tr>
        <th scope="row">2</th>
        <td>Jacob</td>
        <td>Thornton</td>
        <td>@fat</td>
      </tr>
      <tr>
        <th scope="row">3</th>
        <td colspan="2">Larry the Bird</td>
        <td>@twitter</td>
      </tr>
    </tbody>
  </table>
    </div>
  </div>
</template>

<script>
import { onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { AppState } from '../AppState';
import { leagueService } from '../services/LeagueService';

export default {
  setup() {
    let route = useRoute()
    onMounted(async () => {
      await leagueService.getById(route.params.id)
    })
    return {
      league: computed(() => AppState.activeLeague)
    }
  }
}
</script>

<style>

</style>