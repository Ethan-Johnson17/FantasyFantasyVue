<template>
  <header>
    <Navbar />
  </header>
  <main>
    <router-view />
  </main>
  <footer>
    <div class="bg-dark text-light text-center p-4">
      FantasyFantasy Copyright {{ year }}
    </div>
  </footer>
</template>

<script>
import { computed } from 'vue';
import { AppState } from './AppState';

export default {
  name: 'App',
  setup() {
    let year = new Date().getFullYear()
    return {
      appState: computed(() => AppState),
      year
    }
  }
}
</script>
<style lang="scss">
@import "./assets/scss/main.scss";
</style>
