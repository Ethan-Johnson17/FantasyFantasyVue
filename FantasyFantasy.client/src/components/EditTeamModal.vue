<template>
  <div class="modal fade" id="editTeamNameModal" aria-hidden="true" aria-labelledby="editTeamNameModalLabel" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="editTeamNameModalLabel">Choose Team Name</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="row">
            <div class="col m-2">
              <input type="text" aria-label="name" class="form-control"
                v-model="editable.teamName" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" data-bs-target="#editTeamColorsModal"
            data-bs-toggle="modal" data-bs-dismiss="modal">Next</button>
        </div>
      </div>
    </div>
  </div>

  <!-- FIXME The color pickers should have a default value of black -->
  <div class="modal fade" id="editTeamColorsModal" aria-hidden="true" aria-labelledby="editTeamColorsLabel" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="editTeamColorsLabel">Choose Team Colors</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body container">
          <div class="row mb-3">
            <div class="col-12">
              <h5 :style="{ color: editable.primaryColor }" class="textOutline">Team Name: {{
                editable.teamName
              }}</h5>
            </div>
          </div>
          <div class="row d-flex justify-content-center">
            <div class="col-8 my-3 d-flex">
              <input type="color" name="primaryColor" v-model="editable.primaryColor">
              <label class="ms-5" for="primaryColor">Primary Color</label>
            </div>
            <div class="col-8 my-3 d-flex">
              <input type="color" name="secondaryColor" :placeholder="team.secondaryColor" v-model="editable.secondaryColor" required>
              <label class="ms-5" for="secondaryColor">Secondary Color</label>
            </div>
          </div>
          <div class="row">
            <Logo :logo="editable.teamLogo" :primaryColor="editable.primaryColor"
              :secondaryColor="editable.secondaryColor" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" data-bs-target="#editTeamNameModal" data-bs-toggle="modal"
            data-bs-dismiss="modal">Back</button>
          <button class="btn btn-primary" data-bs-target="#editTeamLogoModal" data-bs-toggle="modal"
            data-bs-dismiss="modal">Change logo</button>
          <button class="btn btn-primary" data-bs-target="#editTeamColorsModal" data-bs-toggle="modal"
            data-bs-dismiss="modal" @click.prevent="editTeam(team.id)">Complete</button>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="editTeamLogoModal" aria-hidden="true" aria-labelledby="editTeamLogoModalLabel"
    tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="editTeamLogoModalLabel">Choose Team Logo</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body container p-5">
          <div class="row">
            <!-- TODO Knight and wolf need to scale and the x padding should be reduced for both. Additionally, the black background shouldn't cover other logos -->
            <div class="col-4" @click="selectLogo('racoon')">
              <img src="../assets/img/racoon.svg" class="racoon logoSVG" alt="Racoon">
            </div>
            <div class="col-4" @click="selectLogo('wolf')">
              <img src="../assets/img/wolf.svg" class="wolf mt-2 logoSVG" alt="wolf">
            </div>
            <div class="col-4" @click="selectLogo('fox')">
              <img src="../assets/img/fox.svg" class="fox logoSVG" alt="fox">
            </div>
          </div>
          <div class="row d-flex justify-content-center">
            <div class="col-4" @click="selectLogo('bird')">
              <img src="../assets/img/bird.svg" class="bird logoSVG" alt="bird">
            </div>
            <div class="col-4" @click="selectLogo('knight')">
              <img src="../assets/img/knight.svg" class="knight mt-5 logoSVG" alt="knight">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" data-bs-target="#editTeamColorsModal" data-bs-toggle="modal"
            data-bs-dismiss="modal">Next</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { Modal } from "bootstrap"
import { onMounted, reactive, ref, watchEffect } from 'vue';
import { logger } from "../utils/Logger";
import Logo from '../components/Logo.vue';
import { teamService } from "../services/TeamService";
import { AppState } from "../AppState";
import Pop from "../utils/Pop";

export default {
  components: { Logo },
  props: {
    team: {
      type: Object
    }
  },
  setup(props) {
    let primaryElems = []
    let secondaryElems = []
    const state = reactive({
      editable: {},
    });
    const editable = ref({})
    watchEffect(async () => {
      try {
        editable.value = { ...props.team }
      } catch (error) {
        logger.error(error)
        Pop.toast(error.message, 'error')
      }
    })
    let newColor = ''
    // onMounted(() => {
    //   Modal.getOrCreateInstance(document.getElementById('teamNameModal')).show()
    // })
    return {
      state,
      newColor,
      editable,

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
        editable.value.teamLogo = choice
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


      async editTeam(teamId) {
        console.log('teamId')
        let team = editable.value
        await teamService.editTeam(teamId, team)
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

.textOutline {
  text-shadow: 2px 2px 2px black;
}
</style>