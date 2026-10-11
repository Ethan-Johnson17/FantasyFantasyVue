<template>
  <div class="modal fade" id="editPartyModal" aria-hidden="true" aria-labelledby="editPartyModalLabel" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="editPartyModalLabel">Create Party</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body container py-3 px-5">
            <div class="row">
              <div class="col-12 m-2">
                <label class="mb-2" for="partyName">Choose a party name:</label>
                <input type="text" aria-label="name" placeholder="Enter Party Name..." class="form-control"
                  v-model="editable.partyName" required />
              </div>
              <div class="col-12 my-3 d-flex">
                <input type="color" name="logoColor" v-model="editable.logoColor" class="zIndex" required>
                <label class="ms-5" for="logoColor">Choose a logo color</label>
              </div>
            </div>
            <div class="row">
              <Logo logo="shield" :primaryColor="editable.logoColor" :logoLetter="editable.partyName?.slice(0,1)" />
            </div>
            </div>
          <div class="modal-footer">
            <button class="btn btn-primary" data-bs-target="#editPartyModal" data-bs-toggle="modal"
              data-bs-dismiss="modal" :disabled="!editable.partyName" @click="editParty()">Done</button>
          </div>
        </div>
      </div>
    </div>
</template>

<script>
import { Modal } from "bootstrap"
import { onMounted, reactive, ref, watchEffect } from 'vue';
import { logger } from "../utils/Logger";
import Logo from '../components/Logo.vue';
import { teamService } from "../services/TeamService";
import { AppState } from "../AppState";
import Pop from "../utils/Pop";
import { partyService } from "../services/PartyService";
export default {
  props: {
    party: {
      type: Object
    }
  },
  setup(props) {
    const state = reactive({
      editable: {},
    });
    const editable = ref({})
    watchEffect(async () => {
      try {
        logger.log(props.party)
        editable.value = { ...props.party }
      } catch (error) {
        logger.error(error)
        Pop.toast(error.message, 'error')
      }
    })
    return {
      state,
      editable,

      async editParty() {
        await partyService.editParty(editable.value.id, editable.value)
      }
    }
  }
}
</script>

<style>

</style>