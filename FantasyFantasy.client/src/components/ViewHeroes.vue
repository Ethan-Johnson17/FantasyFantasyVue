<template>
  <div class="offcanvas offcanvas-start" tabindex="-1" id="addHero" aria-labelledby="offcanvasLabel">
    <div class="offcanvas-header border-bottom border-dark">
      <h5 class="offcanvas-title" id="offcanvasLabel">Add Hero</h5>
      <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body container">
      <div class="row mb-2">
        <h6 class="mb-0">A party can have up to 5 active heroes. Select your heroes wisely!</h6>
        <p class="mb-1 fst-italic">Names can be changed later.</p>
        <button @click="sortHeroes(heroes)">Sort</button>
      </div>
      <div class="row border-top border-dark selectable" :disabled="party.heroes.length >= 5" v-for="hero in heroes" :key="hero.id" @click="confirmAddHero(hero)">
        <div class="col-6 fw-bold">{{ hero.heroName }}</div>
        <div class="col-6 fst-italic">{{ hero.heroClass }}</div>
        <div class="col-6 fst-italic">{{ hero.heroRace }}</div>
        <div class="col-4 fst-italic">Gender: {{ hero.gender.slice(0, 1).toUpperCase() }}</div>
        <AddHero :hero="hero" :party="party"></AddHero>
      </div>
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
import { Modal } from 'bootstrap'
export default {
  props: {
    heroes: {
      type: Object
    },
    party: {
      type: Object
    }
  },
  setup() {
    
    return {
      allHeroes: computed(() => AppState.heroes),
      confirmAddHero(hero) {
        Modal.getOrCreateInstance(document.getElementById('addHero-' + hero.heroName)).toggle()
      },

      sortHeroes(heroes) {
        let heroesSorted = heroes.sort((a, b) => {
          let fa = a.heroClass.toLowerCase(),
            fb = b.heroClass.toLowerCase();

          if (fa < fb) {
            return -1;
          }
          if (fa > fb) {
            return 1;
          }
          return 0;
        });
        console.log(heroesSorted)
      }
  }
}
}
</script>

<style>

</style>