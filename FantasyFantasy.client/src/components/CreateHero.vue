<template>
  <div class="offcanvas offcanvas-start" tabindex="-1" id="addHero" aria-labelledby="offcanvasLabel">
    <div class="offcanvas-header">
      <h5 class="offcanvas-title" id="offcanvasLabel">Add Hero</h5>
      <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body container" v-if="allHeroes.length === 0">
      <button @click="generateHeroes()"></button>
      <h6>Getting Heroes...</h6>
    </div>
    <div class="offcanvas-body container" v-else>
      <div class="row" v-for="hero in allHeroes" :key="hero.id">
        <div class="col-6">{{ hero.heroName }}</div>
        <div class="col-6">{{ hero.heroClass }}</div>
        <div class="col-6">{{ hero.heroRace }}</div>
      </div>
    </div>
    <div class="offcanvas-body">
      
    </div>
  </div>
</template>

<script>
import { computed, onMounted } from 'vue'
import { maleNames, femaleNames, races, classes } from '../heroes'
import { FDPPlayerApi } from '../services/AxiosService'
import { playersService } from '../services/PlayersService'
import { heroService } from '../services/HeroService'
import { AppState } from '../AppState'
export default {
  props: {
    heroes: {
      type: Object
    }
  },
  setup() {
    
    return {
      allHeroes: computed(() => AppState.heroes),
      async createHero() {
        let players = await playersService.getData('2004/1')
        players.forEach(element => {
          // Need to attach hero to a player dependent on selected season
          // How will we ensure a player is in mulitple weeks?
        });
    }
  }
}
}
</script>

<style>

</style>