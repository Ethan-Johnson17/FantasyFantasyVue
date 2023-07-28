<template>
  <div class="modal fade addHeroModal" :id="'addHero-' + hero?.heroName" tabindex="-1" aria-labelledby="addHeroLabel" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="addHeroLabel">Confirm Add Hero</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <h6>You've selected {{ hero.heroName }}, a {{ hero.gender }} {{ hero.heroClass }} of the {{ hero.heroRace }} race. Would you like to add {{ hero.heroName }} to your party?</h6>
            <p>Your party has {{ party.heroes.length }} of 5 heroes.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-danger" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" @click="addHero(hero)">Confirm</button>
          </div>
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
import { partyService } from '../services/PartyService'
import { leagueService } from '../services/LeagueService'
export default {
  props: {
    hero: {
      type: Object
    },
    party: {
      type: Object
    }
  },
  setup(props) {

    return {
      allHeroes: computed(() => AppState.heroes),

      async addHero(hero) {
        let party = props.party
        party.heroes.push(hero)
        let league = party.league
        league.heroes = league.heroes.filter(h => h !== hero)
        // await partyService.editParty(party)
        // await leagueService.editLeague(league)
      }
    }
  }
}
</script>

<style>
.addHeroModal {
  z-index: 9999;
}

.modal-backdrop {
  display: none !important;
}
</style>