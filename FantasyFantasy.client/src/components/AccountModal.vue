<template>
  <div class="modal" tabindex="-1" id="finishAccountModal">
      <div class="modal-dialog modal-fullscreen">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">You're Almost Done!</h5>
          </div>
          <form @submit.prevent="finishAccount">
          <div class="modal-body">
            <h1 class="my-5">Please finish creating your account.</h1>
              <div class="row d-flex">
                <div class="col-6 text-start px-5">
                  <label for="usernameFormInput" class="form-label">Username</label>
                  <input type="text" required class="form-control" id="usernameFormInput" v-model="state.editable.name" placeholder="Enter your username">
                </div>
                <div class="col-6 text-start px-5">
                  <label for="imageUrlFormInput" class="form-label">Profile Picture URL</label>
                  <input type="text" class="form-control" id="imageUrlFormInput" v-model="state.editable.picture" placeholder="Enter your profile picture URL">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" @click="logout()" class="btn btn-secondary" data-bs-dismiss="modal">Logout</button>
              <button type="submit" class="btn btn-primary" data-bs-dismiss="modal">Save changes</button>
            </div>
          </form>
        </div>
      </div>
    </div>
</template>

<script>
import { computed } from "@vue/reactivity";
import { AppState } from "../AppState";
import { AuthService } from "../services/AuthService";
export default {
  setup() {
    return {
      user: computed(() => AppState.user),
      account: computed(() => AppState.account),
      async login() {
        AuthService.loginWithPopup();
      },
      async logout() {
        AuthService.logout({ returnTo: window.location.origin });
      },
    };
  },
};
</script>

<style>

</style>