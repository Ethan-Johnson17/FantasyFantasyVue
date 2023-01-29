<template>
  <h2>Team Builder</h2>
  <form @submit.prevent="createTeam()" name="teamBuilder">
  <div class="modal fade" id="teamNameModal" aria-hidden="true" aria-labelledby="teamNameModalLabel"
    tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="teamNameModalLabel">Enter a Team Name</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="row">
            <div class="col m-2">
              <input type="text" aria-label="name" placeholder="Enter Team Name..." class="form-control"
                v-model="state.editable.name" required />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" :disabled="!state.editable.name" data-bs-target="#teamLogoModal" data-bs-toggle="modal"
            data-bs-dismiss="modal">Next</button>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="teamLogoModal" aria-hidden="true" aria-labelledby="teamLogoModalLabel"
    tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="teamLogoModalLabel">Choose Team Logo</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body container p-5">
          <div class="row">
            <div class="col-4" @click="selectLogo('racoon')">
              <img src="../assets/img/racoon.svg" class="racoon logoSVG" alt="Racoon">
              <!-- <Racoon></Racoon> -->
            </div>
            <div class="col-4" @click="selectLogo('wolf')">
            <!-- <Wolf></Wolf> -->
              <img src="../assets/img/wolf.svg" class="wolf mt-2 logoSVG" alt="wolf">
            </div>
            <div class="col-4" @click="selectLogo('fox')">
            <!-- <Fox></Fox> -->
              <img src="../assets/img/fox.svg" class="fox logoSVG" alt="fox">
            </div>
          </div>
          <div class="row d-flex justify-content-center">
            <div class="col-4" @click="selectLogo('bird')">
              <!-- <Bird></Bird> -->
              <img src="../assets/img/bird.svg" class="bird logoSVG" alt="bird">
            </div>
            <div class="col-4" @click="selectLogo('knight')">
            <!-- <Knight></Knight> -->
              <img src="../assets/img/knight.svg" class="knight mt-5 logoSVG" alt="knight">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" data-bs-target="#teamNameModal" data-bs-toggle="modal"
            data-bs-dismiss="modal">Back</button>
          <button class="btn btn-primary" data-bs-target="#teamColorModal" data-bs-toggle="modal"
            data-bs-dismiss="modal" :disabled="!state.editable.logo">Next</button>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="teamColorModal" aria-hidden="true" aria-labelledby="teamColorModalLabel"
    tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="teamColorModalLabel">Choose Team Colors</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="card">
            <div class="card-body text-center d-flex justify-content-center align-items-center flex-column">
              <p>Click the dark square to activate the Color Picker</p>
              <div id="color-picker-1" class="mx-auto"></div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" data-bs-target="#teamLogoModal" data-bs-toggle="modal"
            data-bs-dismiss="modal">Back</button>
          <button class="btn btn-primary" data-bs-target="#exampleModalToggle" data-bs-toggle="modal"
            data-bs-dismiss="modal">Next</button>
        </div>
      </div>
    </div>
  </div>
  </form>
  <PlayersList />
</template>

<script>
import { Modal } from "bootstrap"
import { onMounted, reactive } from 'vue';
import { logger } from "../utils/Logger";

export default {
  setup() {
    const state = reactive({
      editable: {},
    });
    onMounted(() => {
      Modal.getOrCreateInstance(document.getElementById('teamNameModal')).show()
    })
    return {
      state,

      selectLogo(choice) {
        let logos = document.getElementsByClassName('logoSVG');
        for (let i = 0; i < logos.length; i++) {
          const e = logos[i];
          logger.log(e.classList)
          if (e.classList.value.includes(choice)) {
            e.classList.add('selectedLogo')
            logger.log('nailed it')
          } else {
            e.classList.remove('selectedLogo')
          }
        }
        state.editable.logo = choice
      },

      createTeam() {
        logger.log(state)
      }
    }
  }
}
</script>

<style>
.logoSVG {
  transition: 500ms;
  border-radius: 10px;
}

.wolf {
  transition: 500ms;
  transform: scale(1.5);
}

.knight {
  transform: scale(1.5);
}

.selectedLogo {
  background-color: rgb(75, 75, 75);
  transform: scale(1.5);
}
</style>