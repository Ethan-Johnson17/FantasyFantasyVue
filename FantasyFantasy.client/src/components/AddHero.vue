<template>
  <div class="modal fade addHeroModal" id="addHeroModal" tabindex="-1" aria-labelledby="addHeroLabel" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="addHeroLabel">Confirm Add Hero</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <h6>Your party has {{ party.heroes.length }} of 5 heroes.</h6>
            <ul>
              <li v-for="hero in party.heroes" :key="hero.id">
                <h6>{{ hero.heroName }}, a {{ hero.gender }} {{ hero.heroClass }} of the {{ hero.heroRace }} race. </h6>
              </li>
            </ul>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-danger" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" @click="addHero()">Confirm</button>
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
import { logger } from '../utils/Logger'
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

      async addHero() {
        let party = props.party
        let league = party.league
        await partyService.editParty(party.id, party)
        await leagueService.editLeague(league)
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