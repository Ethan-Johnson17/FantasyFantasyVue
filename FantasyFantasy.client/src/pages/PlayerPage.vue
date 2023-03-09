<template>
  <div class="container-fluid">
    <div class="row">
      <div class="col-12">
        <label for="season">Season</label>
        <input type="text" name="season" id="season" placeholder="season" v-model="state.editable.season">
      </div>
      <div class="col-3">
        <label for="week">Week</label>
        <input type="text" name="weekA" id="weekA" placeholder="week" v-model="state.editable.weekA">
      </div>
      <div class="col-3">
        <label for="week">Week</label>
        <input type="text" name="weekB" id="weekB" placeholder="week" v-model="state.editable.weekB">
      </div>
      <div class="col-3">
        <label for="week">Week</label>
        <input type="text" name="weekC" id="weekC" placeholder="week" v-model="state.editable.weekC">
      </div>
      <div class="col-12">
        <button @click="createPlayerArrays()">Create</button>
      </div>
      <div class="col-12">
        <button @click="getFDPPlayers()">Get Created Players</button>
      </div>
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
import { computed, reactive } from 'vue'
import { AppState } from '../AppState'
import { playersService } from '../services/PlayersService'
export default {
  setup() {
    const state = reactive({
      editable: {}
    })
    let finalPlayers =[]
    return {
      state,
      players: computed(() => AppState.players.filter(p => p.Active === true)),

      async createPlayerArrays() {
        let dbPlayersA = await playersService.getFDPPlayerData(state.editable.season + '/' + state.editable.weekA)
        let dbPlayersB = await playersService.getFDPPlayerData(state.editable.season + '/' + state.editable.weekB)
        let dbPlayersC = await playersService.getFDPPlayerData(state.editable.season + '/' + state.editable.weekC)
        let qbsA = []
        let wrsA = []
        let rbsA = []
        let qbsB = []
        let wrsB = []
        let rbsB = []
        let qbsC = []
        let wrsC = []
        let rbsC = []
        let tesA = []
        let tesB = []
        let tesC = []
        let miscA = []
        let miscB = []
        let miscC = []
        for (let i = 0; i < dbPlayersA.length; i++) {
          const pA = dbPlayersA[i];
          const pB = dbPlayersB[i];
          const pC = dbPlayersC[i];
          if (pA?.position === 'QB') {
            qbsA.push(pA?.player_name) 
          } else if (pA?.position === 'WR') {
            wrsA.push(pA?.player_name) 
          } else if (pA?.position === 'RB' && pA?.position === 'HB') {
            rbsA.push(pA?.player_name) 
          } else if(pA?.position === 'TE') {
            tesA.push(pA?.player_name)
          } else {
            miscA.push(pA?.player_name)
          }
          if (pB?.position === 'QB') {
            qbsB.push(pB?.player_name) 
          } else if (pB?.position === 'WR') {
            wrsB.push(pB?.player_name) 
          } else if (pB?.position === 'RB' && pB?.position === 'HB') {
            rbsB.push(pB?.player_name) 
          } else if (pB?.position === 'TE') {
            tesA.push(pB?.player_name)
          } else {
            miscB.push(pB?.player_name)
          }
          if (pC?.position === 'QB') {
            qbsC.push(pC?.player_name) 
          } else if (pC?.position === 'WR') {
            wrsC.push(pC?.player_name) 
          } else if (pC?.position === 'RB' && pC?.position === 'HB') {
            rbsC.push(pC?.player_name) 
          } else if (pC?.position === 'TE') {
            tesA.push(pC?.player_name)
          } else {
            miscC.push(pC?.player_name)
          }
        }
        qbsA.forEach(p => {
          if (qbsB.includes(p) && qbsC.includes(p)) {
            let qb = {
              playerName: p,
              position: 'QB',
              season: state.editable.season
            }
            finalPlayers.push(qb)
          }
        });
        wrsA.forEach(p => {
          if (wrsB.includes(p) && wrsC.includes(p)) {
            let wr = {
              playerName: p,
              position: 'WR',
              season: state.editable.season
            }
            finalPlayers.push(wr)
          }
        });
        rbsA.forEach(p => {
          if (rbsB.includes(p) && rbsC.includes(p)) {
            let rb = {
              playerName: p,
              position: 'RB',
              season: state.editable.season
            }
            finalPlayers.push(rb)
          }
        });
        tesA.forEach(p => {
          if (tesB.includes(p) && tesC.includes(p)) {
            let te = {
              playerName: p,
              position: 'TE',
              season: state.editable.season
            }
            finalPlayers.push(te)
          }
        });
        miscA.forEach(p => {
          if (miscB.includes(p) && miscC.includes(p)) {
            let def = {
              playerName: p,
              position: 'DEF',
              season: state.editable.season
            }
            finalPlayers.push(def)
          }
        });

        await playersService.createFDPPlayers(finalPlayers)
      },

      async getFDPPlayers() {
        let players = await playersService.getMyFDPPlayerData('api/players/fdpPlayers/' + state.editable.season)
        console.log(players)
      }
    }
  }
}
</script>

<style>

</style>