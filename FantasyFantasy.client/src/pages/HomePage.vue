<template>
  <div v-if="!user.isAuthenticated" class="home flex-grow-1 container">
    <div class="row masthead d-flex justify-content-center align-items-center">
      <div class="col-8 text-grey text-center pt-5">
        <h2 class="pt-5">Where Fantasy Football Meets Fantasy RPG.</h2>
        <!-- <img src="../assets/img/orcNoBG.png" alt="Orc with a football" class="mastheadImage"> -->
        <h4 class="fst-italic">Sign up or log in below to get started!</h4>
        <router-link :to="{ name: 'About' }" class="text-grey">
          <h5 class="moreInfoLink">Or, give us a chance to explain how it works... <i class="mdi mdi-arrow-right mt-2"></i></h5>
        </router-link>
        <button class="btn btn-outline-light btn-lg pb-2" @click="login">Get started!</button>
      </div>
    </div>
    <!-- <div class="row">
      <img src="../assets/img/dice.jpg" alt="Dice" class="diceImg img-fluid">
    </div> -->
  </div>

  <div v-else class="home flex-grow-1 container">
    <div class="row masthead d-flex justify-content-center">
      <div class="col-8 text-grey text-center pt-5">
        <h2>Welcome back, {{ account.name }}</h2>
        <div class="row mt-5" v-if="myLeagues">
          <h3>Here's an overview of your leagues</h3>
          <!-- TODO Link to league details -->
          <div class="col-12 rounded mt-3 bg-light px-0" v-for="league in myLeagues" :key="league.id">
            <h4 class="bg-dark rounded">{{ league.leagueName }} <span v-if="league.activeStatus == 'active'">- Week 0</span></h4>
            <div v-if="league.activestatus= 'active'">
              <h5 class="text-dark">The top unit is ___</h5>
              <h6 class="text-dark">Your rank is is ___</h6>
            </div>
            <div v-else class="text-dark">
              <h5>This league is not active.</h5>
              <h6>Your Ready Status: {{ league.participantsReady.includes(account.id) ? 'Ready' : 'Not Ready' }}</h6>
              <h6>Number of Units in the League: {{ league.participants.length }} / 6</h6>
              <h6>Number of Heroes in your Party: {{ league.parties.find(p => p.accountId == account.id)?.heroes.length }} / 8</h6>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

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
import { computed, reactive } from "@vue/reactivity";
import { AppState } from "../AppState";
import { AuthService } from "../services/AuthService";
import { onMounted } from "vue";
import { logger } from '../utils/Logger';
import { accountService } from "../services/AccountService";
import { ref } from "vue";
import { leagueService } from "../services/LeagueService";
import { teamService } from "../services/TeamService";
import { partyService } from "../services/PartyService";
export default {
  name: 'Home',
  setup() {
    const state = reactive({
      editable: {}
    })
    onMounted(async () => {
      })
    return {
      state,
      user: computed(() => AppState.user),
      account: computed(() => AppState.account),
      async login() {
        await AuthService.loginWithPopup();
        logger.log('leagues home', AppState.leagues)
      },
      myLeagues: computed(() => AppState.leagues),

      async finishAccount() {
        this.account.name = this.state.editable.name
        this.account.picture = this.state.editable.picture
        this.account.accountComplete = true
        accountService.editAccount(this.account)
      },
      
      async logout() {
        AuthService.logout({ returnTo: window.location.origin });
      },
    }
  }
}
</script>

<style scoped lang="scss">
.masthead {
  // background: rgb(0, 76, 84);
  background-image: url('../assets/img/orc.jpg');
  // background: linear-gradient(180deg, rgba(0, 76, 84, 1) 10%, rgba(0, 53, 59, 1) 55%, rgba(0, 76, 84, 1) 96%);
  height: 100vh;
}

.mastheadImage {
  height: 40vh;
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
