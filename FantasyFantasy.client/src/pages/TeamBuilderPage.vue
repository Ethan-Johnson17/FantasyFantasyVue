<template>
  <h2>Team Builder</h2>
  <!-- <form name="teamBuilder"> -->
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
              <!-- TODO Knight and wolf need to scale and the x padding should be reduced for both. Additionally, the black background shouldn't cover other logos -->
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
          <div class="modal-body container">
            <div class="row d-flex justify-content-center">
              <div class="col-8 my-3 d-flex">
                <input type="color" name="primaryColor" v-model="state.editable.primaryColor">
                <label class="ms-5" for="primaryColor">Primary Color</label>
              </div>
              <div class="col-8 my-3 d-flex">
                <input type="color" name="secondaryColor" v-model="state.editable.secondaryColor">
                <label class="ms-5" for="secondaryColor">Secondary Color</label>
              </div>
            </div>
            <div class="row">
              <Logo :logo="state.editable.logo" :primaryColor="state.editable.primaryColor" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" data-bs-target="#teamLogoModal" data-bs-toggle="modal"
              data-bs-dismiss="modal">Back</button>
            <button class="btn btn-primary" data-bs-target="#teamColorModal" data-bs-toggle="modal"
              data-bs-dismiss="modal" @click.prevent="createTeam()">Complete</button>
          </div>
        </div>
      </div>
    </div>
  <!-- </form> -->
  <PlayersList />
</template>

<script>
import { Modal } from "bootstrap"
import { onMounted, reactive } from 'vue';
import { logger } from "../utils/Logger";
import Logo from '../components/Logo.vue';

export default {
  components: { Logo },
  setup() {
    let primaryElems = []
    let secondaryElems = []
    const state = reactive({
      editable: {},
    });
    let newColor = ''
    onMounted(() => {
      Modal.getOrCreateInstance(document.getElementById('teamNameModal')).show()
    })
    return {
      state,
      newColor,

      selectLogo(choice) {
        let logos = document.getElementsByClassName('logoSVG');
        for (let i = 0; i < logos.length; i++) {
          const e = logos[i];
          if (e.classList.value.includes(choice)) {
            e.classList.add('selectedLogo')
          } else {
            e.classList.remove('selectedLogo')
          }
        }
        state.editable.logo = choice
      },

      setColor() {
        let logo = document.getElementsByTagName('svg')[0]
        let paths = document.getElementsByClassName('st0');
        for (let i = 0; i < paths.length; i++) {
          const e = paths[i];
          console.log(e, i)
          if (e.classList.contains('st0')) {
            primaryElems.push(e)
            this.changeColors('primary')
            break
          } else if (e.classList.contains('st2')) {
            secondaryElems.push(e)
            this.changeColors('secondary')
            break
          }
        }
      },

      changeColors(selection) {
        if (selection === 'primary') {
          primaryElems.forEach(e => {
            e.classList.remove('st0')
            var style = document.createElement('style');
            style.type = 'text/css';
            style.innerHTML = `.cssClass { color: ${state.editable.primaryColor}; }`;
            e.classList.add(style)
          });
        } else {
          secondaryElems.forEach(e => {
            e.classList.remove('st2')
            e.style.stroke = state.editable.secondaryColor
            e.style.fill = state.editable.secondaryColor
          })
        }
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