<template>
  <h3>No team created. Go to the team builder to build your winning team!</h3>
  <router-link :to="{ name: 'TeamBuilder' }" class="text-grey">
    <h5 class="moreInfoLink">Go to team builder <i class="mdi mdi-arrow-right mt-2"></i></h5>
  </router-link>
</template>

<script>
export default {

}
</script>

<style>

</style>

<!-- Check for players, if no players in the team, show build team button -->