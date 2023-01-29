<template>
  <button @click="getData()">Get Data</button>
</template>

<script>
import { AppState } from '../AppState'
import players from '../players.json'
export default {
  setup() {
    return {
      async getData() {
        let filteredPlayers = [];
        players.forEach(e => {
          if (e.Team !== null) {
            filteredPlayers.push(e)
          }
        });
        AppState.players = filteredPlayers
    }
  }
}
}
</script>

<style>

</style>