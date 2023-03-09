<template>
  <div class="row mt-5 d-flex justify-content-center" v-if="parties.length === 0">
    <h3 class="text-center">No parties created.</h3>
    <div class="col-4">
      <button class="btn btn-primary" data-bs-target="#createPartyModal" data-bs-toggle="modal">Create Party</button>
    </div>
  </div>
  <div class="row" v-else>
    <div class="col mt-2">
        <button class="btn btn-primary" data-bs-target="#createPartyModal" data-bs-toggle="modal">Create Party</button>
      </div>
  </div>

  <div class="modal fade" id="createPartyModal" aria-hidden="true" aria-labelledby="createPartyModalLabel" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="createPartyModalLabel">Create Party</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body container py-3 px-5">
            <div class="row">
              <div class="col-12 m-2">
                <label class="mb-2" for="partyName">Choose a party name:</label>
                <input type="text" aria-label="name" placeholder="Enter Party Name..." class="form-control"
                  v-model="state.editable.partyName" required />
              </div>
              <div class="col-12 my-3 d-flex">
                <input type="color" name="logoColor" v-model="state.editable.logoColor" class="zIndex" required>
                <label class="ms-5" for="logoColor">Choose a logo color</label>
              </div>
            </div>
            <div class="row">
              <Logo logo="shield" :primaryColor="state.editable.logoColor" :logoLetter="state.editable.partyName?.slice(0,1)" />
            </div>
            </div>
          <div class="modal-footer">
            <button class="btn btn-primary" data-bs-target="#createPartyModal" data-bs-toggle="modal"
              data-bs-dismiss="modal" :disabled="!state.editable.partyName" @click="createParty()">Done</button>
          </div>
        </div>
      </div>
    </div>
</template>

<script>
import { reactive } from 'vue'
import { partyService } from '../services/PartyService'
export default {
  props: {
    parties: {
      type: Object
    }
  },
  setup() {
    const state = reactive({
      editable: {
        partyName: '',
        logoColor: '#ff0000'
      }
    })
    return {
      state,

      async createParty() {
        let party = state.editable
        await partyService.createParty(party)
      }
    }
  }
}
</script>

<style>

</style>