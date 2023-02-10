<template>
  <div class="row">
    <div class="col-12">
      <h2>Start a League!</h2>
    </div>
  </div>
  <form @submit.prevent="startLeague">
  <div class="row d-flex mt-3">
    <div class="col-md-6 my-3">
        <label for="leagueName" class="form-label fs-5">League Name</label>
        <input type="text" class="form-control" id="leagueName" v-model="state.editable.leagueName" placeholder="Freedom Fighters">
    </div>
    <div class="col-md-4 form-check my-4 d-flex justify-content-center">
      <input class="form-check-input mt-4" type="checkbox" value="false" id="privacyStatus" v-model="state.editable.privacyStatus">
      <label class="form-check-label ms-3 mt-3 fs-5" for="privacyStatus">
        Private League
      </label>
    </div>
    <div class="col-md-6 mt-4">
        <label for="leagueStyleSelect" class="form-label fs-5">League Style</label>
        <select class="form-select" aria-label="League Style" v-model="state.editable.leagueStyle">
          <option value="classic" selected>Classic</option>
          <option value="crossover" disabled>Classic Crossover (coming soon)</option>
          <option value="coOp" disabled>Co-op (coming soon)</option>
          <option value="freeForAll" disabled>Free-for-all (coming soon)</option>
          <option value="loneWolf" disabled>Lone Wolf (coming soon)</option>
        </select>
        <div class="mt-2 ms-1">
          <p class="p-0">Not sure which style you want?
          <span class="p-0 offcanvasLink fst-italic" data-bs-toggle="offcanvas" data-bs-target="#leagueStyles"> Learn more here.</span></p>
        </div>
    </div>
  </div>
  <div class="row d-flex justify-content-center">
    <div class="col-2">
      <button class="btn btn-lg fs-5 btn-secondary w-100">Start</button>
    </div>
  </div>
</form>



  <Offcanvas id="leagueStyles">
    <template #offcanvas-title>League Styles</template>
    <template #offcanvas-body>
      <LeagueStyles />
    </template>
  </Offcanvas>
</template>

<script>
import { reactive } from 'vue';

export default {
  setup() {
    const state = reactive({
      editable: {}
    })
    return {
    state
  }
}
}
</script>

<style>
#privacyStatus {
  transform: scale(1.5);
}

.offcanvasLink {
  color: #056137;
}

.offcanvasLink:hover {
  color: #004C54;
  cursor: pointer;
}
</style>