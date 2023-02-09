<template>
  <div class="row">
    <div class="col-12 d-flex justify-content-center">
      <Logo :logo="team.teamLogo" :primaryColor="team.primaryColor" :secondaryColor="team.secondaryColor"
      class="myTeamsLogos" />
    </div>
    <div class="col-12"><p class="text-center">{{ team.teamName }}</p></div>
  </div>
</template>

<script>
export default {
  props: {
    team: {
      type: Object
    }
  },

  setup() {
    return {

    }
  }
}
</script>

<style>
#knight {
  transform: scale(1.5);
}

#wolf {
  transform: scale(1.5);
}
</style>