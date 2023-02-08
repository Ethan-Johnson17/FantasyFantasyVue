<template>
  <div class="container-fluid">
    <div class="row">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Name</th>
            <th scope="col">Position</th>
            <th scope="col">Opponent</th>
            <th scope="col">Injury</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="player in players" :key="player.PlayerID">
            <th scope="row">1</th>
            <td>{{ player.Number }}</td>
            <td>{{ player.FirstName }} {{ player.LastName }}</td>
            <td>{{ player.Position }}</td>
            <td>{{ player.UpcomingGameOpponent }}</td>
            <td>{{ player.InjuryStatus }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
import { AppState } from '../AppState'
export default {
  setup() {
    return {
      players: computed(() => AppState.players.filter(p => p.Active === true))
    }
  }
}
</script>

<style>

</style>