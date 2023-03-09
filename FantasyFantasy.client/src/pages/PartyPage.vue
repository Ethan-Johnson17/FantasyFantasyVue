<template>
  <div class="container-fluid">
    <div class="row mt-3">
      <div class="col-12 d-flex">
        <h2 class="me-3">My Parties</h2>
        <PartyBuilder :parties="parties"></PartyBuilder>
      </div>
      <hr class="w-50 ms-2 mt-2">
    </div>
    <div class="row my-2" v-if="parties.length !== 0">
      <div class="col partyContainer" v-for="party in parties" :key="party.id" :id="'party' + party.id" @click="selectedParty = party">
        <PartyCarousel :party="party"></PartyCarousel>
      </div>
    </div>
  </div>
  <div class="container-fluid" v-if="partyDetails">
    <div class="row bg-white" id="partyDetailsSection">
      <PartyDetails :party="partyDetails" />
    </div>
  </div>
</template>

<script>
import { computed, watchEffect } from '@vue/runtime-core'
import { onMounted, ref } from 'vue';
import { AppState } from '../AppState';
import { partyService } from '../services/PartyService';
export default {
  setup() {
    let selectedParty = ref({})
    onMounted(async () => {
      await partyService.getMyParties('account/myParties')
    })
    return {
      parties: computed(() => AppState.myParties),
      partyDetails: computed(() => AppState.myParties.filter(t => t.id == selectedParty.value.id)[0]),
      selectedParty,

    }
  }
}
</script>

<style>
.myPartiesLogos {
  width: 100px;
}

.partyContainer {
  transition: 500ms;
}

:hover.partyContainer {
  transform: scale(1);
  transition: 500ms;
}

#partyDetailsSection {
  height: 60vh;
}
</style>

<!-- Check for players, if no players in the team, show build team button -->
<!-- My teams display in a carousel -->