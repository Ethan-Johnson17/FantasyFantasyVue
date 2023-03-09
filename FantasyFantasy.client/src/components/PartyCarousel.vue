<template>
  <div class="row">
    <div class="col-12 d-flex justify-content-center">
      <Logo logo="shield" :primaryColor="party.logoColor" :logoLetter="party.partyName?.slice(0, 1)"
        class="myTeamsLogos" />
    </div>
    <div class="col-12"><p class="text-center">{{ party.partyName }}</p></div>
  </div>
</template>

<script>
export default {
  props: {
    party: {
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
.myTeamsLogos {
  transform: scale(0.75);
  cursor: pointer;
}
</style>