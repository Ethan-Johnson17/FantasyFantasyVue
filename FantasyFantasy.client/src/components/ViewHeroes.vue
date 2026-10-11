<template>
  <div class="offcanvas offcanvas-start" tabindex="-1" id="addHero" aria-labelledby="offcanvasLabel">
    <div class="offcanvas-header border-bottom border-dark">
      <h4 class="offcanvas-title" id="offcanvasLabel">Add Hero</h4>
      <button class="btn btn-primary" :disabled="heroAdded > 0 ? false : true" @click="confirmAddHero()">Confirm Party</button>
      <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body container">
      <div class="row mb-2">
        <h5>Your Party</h5>
        <div class="row border-top border-dark selectable" v-for="hero in party.heroes" :key="hero.id">
          <div class="col-10">
            <div class="row">
              <div class="col-6 fw-bold">{{ hero.heroName }}</div>
              <div class="col-6 fst-italic">{{ hero.heroClass }}</div>
              <div class="col-6 fst-italic">{{ hero.heroRace }}</div>
              <div class="col-4 fst-italic">Gender: {{ hero.gender.slice(0, 1).toUpperCase() }}</div>
            </div>
          </div>
          <div class="col-2 align-self-center">
            <button class="btn btn-sm btn-secondary" @click="removeHero(hero)">
              Remove
            </button>
          </div>
        </div>
      </div>
      <div class="row my-4 border-top border-black">
        <div class="col-12">
          <h5>Available Heroes</h5>
          <h6 class="mb-0">A party can have up to 5 active heroes and 3 reserves. You are limited to 2 of the same class in a particular fight. Select your heroes wisely!</h6>
          <p class="mb-1 fst-italic">Names can be changed later.</p>
        </div>
        <div class="col-6">
          <button class="btn btn-secondary" disabled @click="sortHeroes(heroes)">Sort</button>
        </div>
        <div class="col-6">
          <label for="filter">Filter</label>
          <select id="filter" aria-placeholder="Choose Filter" class="form-select form-select-sm filterSelect" aria-label="Filter" v-model="state.editable.filter">
            <option class="filterSelect" value="">All</option>
            <optgroup label="Class">
              <option selected value="Mage">Mage</option>
              <option value="Paladin">Paladin</option>
              <option value="Ranger">Ranger</option>
              <option value="Rogue">Rogue</option>
              <option value="Warrior">Warrior</option>
            </optgroup>
            <optgroup class="filterSelect" label="Race">
              <option value="Elf">Elf</option>
              <option value="Halfling">Halfling</option>
              <option value="Dwarf">Dwarf</option>
              <option value="Human">Human</option>
              <option value="Other">Other</option>
            </optgroup>
          </select>
        </div>
      </div>
      <div class="row border-top border-dark selectable" :class="state.editable.filter && state.editable.filter !== hero.heroClass && state.editable.filter !== hero.heroRace ? 'd-none' : ''" :disabled="party.heroes.length >= 8" v-for="hero in heroes" :key="hero.player.id" :id="'hero' + hero.player.id" @mouseleave="hideAddHero('hero' + hero.player.id)" @mouseover="showAddHero('hero' + hero.player.id)">
        <div class="col-10">
          <div class="row">
            <div class="col-7 fw-bold">{{ hero.heroName }}</div>
            <div class="col-5 fst-italic">{{ hero.heroClass }}</div>
            <div class="col-6 fst-italic">{{ hero.heroRace }}</div>
            <div class="col-4 fst-italic">Gender: {{ hero.gender.slice(0, 1).toUpperCase() }}</div>
          </div>
        </div>
        <div class="col-2 align-self-center">
          <button v-if="party.heroes.length < 8" class="btn btn-sm btn-secondary" @click="addHero(hero)" :id="'hero' + hero.player.id + 'AddBtn'" hidden>
            Add
          </button>
        </div>
        <AddHero :hero="hero" :party="party"></AddHero>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, onMounted, reactive } from 'vue'
import { maleNames, femaleNames, races, classes } from '../heroes'
import { playersService } from '../services/PlayersService'
import { heroService } from '../services/HeroService'
import { AppState } from '../AppState'
import { Modal, Offcanvas } from 'bootstrap'
import Pop from '../utils/Pop'
import { logger } from '../utils/Logger'
export default {
  props: {
    heroes: {
      type: Object
    },
    party: {
      type: Object
    }
  },
  setup(props) {
    let sortType = '';
    // const filter = ref("");
    const state = reactive({
      editable: {},
    });
    let heroAdded = 0;
    return {
      heroAdded,
      state,
      allHeroes: computed(() => AppState.heroes),
      
      showAddHero(id) {
        if (props.party.heroes.length < 8) {
          document.getElementById(id + 'AddBtn').hidden = false
        }
      },
      
      hideAddHero(id) {
        if (props.party.heroes.length < 8) {
          document.getElementById(id + 'AddBtn').hidden = true
        }
      },

      addHero(hero) {
        let party = props.party
        if (party.heroes.length < 8) {
          party.heroes.push(hero)
          let league = party.league
          league.heroes = league.heroes.filter(h => h !== hero)
          this.heroAdded++
        }
        else {
          return
        }
      },

      removeHero(hero) {
        let party = props.party
        console.log(party.heroes)
        if (party.heroes.find(h => h === hero)) {
          party.heroes = party.heroes.filter(h => h !== hero)
          let league = party.league
          league.heroes.push(hero)
          this.heroAdded > 0 ? this.heroAdded-- : ''
        }
        else {
          return
        }
      },

      confirmAddHero(hero) {
        state.editable.filter = ''
        Modal.getOrCreateInstance(document.getElementById('addHeroModal')).toggle()

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
        props.heroes = heroesSorted
      }
  }
}
}
</script>

<style>
.filterSelect {
  z-index: 100;
}
</style>