<template>
  <div v-if="!user.isAuthenticated" class="home flex-grow-1 container-fluid">
    <div class="row masthead d-flex justify-content-center align-items-center">
      <div class="col-8 text-grey text-center pt-5">
        <h2>Where Fantasy Football Meets Fantasy RPG.</h2>
        <h4 class="fst-italic">Sign up or log in below to get started!</h4>
        <router-link :to="{ name: 'About' }" class="text-grey">
          <h5 class="moreInfoLink">Or, give us a chance to explain how it works... <i class="mdi mdi-arrow-right mt-2"></i></h5>
        </router-link>
      </div>
      <div class="col-12 d-flex justify-content-center pb-4">
        <button class="btn btn-outline-light btn-lg pb-2" @click="login">Get started!</button>
      </div>
    </div>
    <div class="row">
      <img src="../assets/img/dice.jpg" alt="Dice" class="diceImg img-fluid">
    </div>
  </div>

  <div v-else class="home flex-grow-1 container-fluid">
    <div class="row masthead d-flex justify-content-center align-items-center">
      <div class="col-8 text-grey text-center pt-5">
        <h2>Welcome back, {{ user.name }}</h2>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from "@vue/reactivity";
import { AppState } from "../AppState";
import { AuthService } from "../services/AuthService";
export default {
  name: 'Home',
  setup() {
    return {
      user: computed(() => AppState.user),
      account: computed(() => AppState.account),
      async login() {
        AuthService.loginWithPopup();
      },
    }
  }
}
</script>

<style scoped lang="scss">
.masthead {
  background: rgb(0, 76, 84);
  background: linear-gradient(180deg, rgba(0, 76, 84, 1) 10%, rgba(0, 53, 59, 1) 55%, rgba(0, 76, 84, 1) 96%);
  height: 35vh;
}

:hover.moreInfoLink {
  cursor: pointer;
  color: rgb(159, 159, 159);
}

.diceImg {
  width: 100%;
  height: 50%;
  padding: 0px;
}
</style>
