<template>
  <nav class="navbar navbar-expand-lg navbar-light bg-light px-3 title-font">
    <router-link class="navbar-brand d-flex" :to="{ name: 'Home' }">
      <div class="d-flex align-items-center">
        <img src="../assets/img/fantasyFantasyLogo.png" alt="Logo" class="logo">
        <img src="../assets/img/fantasyFantasyTextOnly.png" alt="Logo" class="logoText">
        <!-- <h1 class="title-font">FantasyFantasy</h1> -->
      </div>
    </router-link>
    <button
      class="navbar-toggler"
      type="button"
      data-bs-toggle="collapse"
      data-bs-target="#navbarText"
      aria-controls="navbarText"
      aria-expanded="false"
      aria-label="Toggle navigation"
    >
      <span class="navbar-toggler-icon" />
    </button>
    <div class="collapse navbar-collapse" id="navbarText" v-if="!user.isAuthenticated">
      <ul class="navbar-nav me-auto">
        <li>
          <router-link
            :to="{ name: 'About' }"
            class="btn text-black selectable text-uppercase"
          >
            Learn More
          </router-link>
        </li>
      </ul>
      <!-- LOGIN COMPONENT HERE -->
      <Login />
    </div>

    <div class="collapse navbar-collapse" id="navbarText" v-else>
      <ul class="navbar-nav me-auto">
        <li>
          <router-link
            :to="{ name: 'Team' }"
            class="btn text-black selectable text-uppercase"
          >
            My Teams
          </router-link>
        </li>
        <li>
          <router-link
            :to="{ name: 'Party' }"
            class="btn text-black selectable text-uppercase"
          >
            My Parties
          </router-link>
        </li>
        <li>
          <router-link
            :to="{ name: 'Leagues' }"
            class="btn text-black selectable text-uppercase"
          >
            My Leagues
          </router-link>
        </li>
      </ul>
      <!-- LOGIN COMPONENT HERE -->
      <Login />
    </div>
  </nav>
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
    };
  },
};
</script>

<style scoped>
a:hover {
  text-decoration: none;
}
.nav-link {
  text-transform: uppercase;
}
.navbar-nav .router-link-exact-active {
  border-bottom: 2px solid var(--bs-dark);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.logo {
  height: 120px;
}
.logoText {
  height: 65px;
}
</style>
