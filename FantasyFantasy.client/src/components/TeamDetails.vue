<template>
  <div class="col-12 shadow py-3">
    <div class="row">
      <div class="col-2 mt-3 ms-3">
        <h3 class="mb-3">{{ team.teamName }}</h3>
        <div class="">
          <button class="mdi mdi-pencil btn btn-secondary" data-bs-toggle="modal" data-bs-target="#editTeamNameModal" >Edit Team Details</button>
        </div>
      </div>
      <div class="col-2 me-3" :class="{'mt-neg' : team.teamLogo === 'bird'}">
        <Logo class="teamDetailsLogo" :logo="team.teamLogo" :primaryColor="team.primaryColor" :secondaryColor="team.secondaryColor" />
      </div>
      <div class="col-lg-6 p-4 h-50 me-2 border rounded">
        <div class="row">
          <div class="col-6" v-if="team.league"><p class="fs-5">League Name: {{ team.league?.leagueName }}</p></div>
          <div class="col-6 d-flex" v-else>
            <p class="fs-5">League Name:</p>
            <router-link
              :to="{ name: 'Leagues' }"
              class="selectable"
            >
              <p class="fs-5 ms-2">Join a league</p>
              <!-- TODO Instead of the router link, we could use the router and open the modal right away -->
            </router-link>
          </div>
        </div>
        <div class="row">
          <div class="col-6"><p class="fs-5">Party Name:</p></div>
        </div>
        <div class="row">
          <div class="col-6"><p class="fs-5">Salary Cap: {{ team.salary }}</p></div>
        </div>
      </div>
    </div>
    <div class="row border rounded d-flex justify-content-center mx-5" :class="{'mt-5' : team.teamLogo !== 'bird'}">
      <div class="col-11">
        <h4 class="my-2">Players</h4>
      </div>
      <div class="col-11">
        <div class="row">
          <div class="col-2">img</div>
          <div class="col-10">
            <div class="row">
              <div class="col-3">
                Name
              </div>
              <div class="col-3">
                Position
              </div>
              <div class="col-3">
                Team
              </div>
              <div class="col-3">
                Opponent
              </div>
            </div>
            <div class="row">
              <div class="col-12">
                Stats
              </div>
            </div>
          </div>
          <!-- <table class="table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Name</th>
              <th scope="col">Position</th>
              <th scope="col">Opponent</th>
              <th scope="col">Injury</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">1</th>
              <td>Mark</td>
              <td>Otto</td>
              <td>@mdo</td>
            </tr>
            <tr>
              <th scope="row">2</th>
              <td>Jacob</td>
              <td>Thornton</td>
              <td>@fat</td>
            </tr>
            <tr>
              <th scope="row">3</th>
              <td colspan="2">Larry the Bird</td>
              <td>@twitter</td>
            </tr>
          </tbody>
        </table> -->
      </div>
    </div>
    </div>
  </div>

  <EditTeamModal :team="team"></EditTeamModal>
</template>

<script>
import { onMounted } from 'vue'
export default {
  props: {
    team: {
      type: Object
    }
  },
  setup(props) {
    onMounted(() => {
      console.log(props.team)
    })
    return {


    }
  }

}
</script>

<style>
.teamDetailsLogo {
  transform: scale(0.75);
}

.mt-neg {
  margin-top: -50px;
}

#bird {
  margin: -40px 0px -20px 0px;
}

#knight {
  margin-top: 20px;
}

#wolf {
  margin-top: 20px;
}
</style>