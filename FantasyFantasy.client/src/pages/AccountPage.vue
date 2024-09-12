<template>
  <div class="container-fluid about text-center">
    <div class="row">
      <div class="col-10 pt-2">
        <h1>Welcome {{ account.name }}</h1>
        <img class="rounded" :src="account.picture" alt="" />
        <p>{{ account.email }}</p>
      </div>
      <div class="col-2 px-0 pt-1">
        <button class="rounded w-100 bg-body custom-border" @click="accountView = editAccount"><i class="me-3 mdi mdi-account-edit"></i>Edit Account</button>
        <button class="rounded w-100 bg-body custom-border"><i class="me-3 mdi mdi-account-lock-open"></i>Achievements</button>
        <button class="rounded w-100 bg-body custom-border"><i class="me-3 mdi mdi-account-group"></i>Friends</button>
        <button class="rounded w-100 bg-body custom-border"><i class="me-3 mdi mdi-wrench"></i>Settings</button>
      </div>
    </div>
  </div>
  <div class="container-fluid about text-center" v-if="accountView == editAccount">
    <form action="submit">
      <div class="row d-flex">
        <div class="col-6 text-start px-5">
          <label for="usernameFormInput" class="form-label">Username</label>
          <input type="text" class="form-control" v-model="state.editable.name" id="usernameFormInput" placeholder="Enter your username">
        </div>
        <div class="col-6 text-start px-5">
          <label for="imageUrlFormInput" class="form-label">Profile Picture URL</label>
          <input type="text" class="form-control" v-model="state.editable.picture" id="imageUrlFormInput" placeholder="Enter your profile picture URL">
        </div>
      </div>
      <button class="btn btn-primary mt-3" @click="editAccount()">Save Changes</button>
    </form>
  </div>
</template>

<script>
import { computed, reactive, ref } from 'vue'
import { AppState } from '../AppState'
import { accountService } from '../services/AccountService'
export default {
  name: 'Account',
  setup() {
    let accountView = ref('account')
    const state = reactive({
      editable: {}
    })
    return {
      state,
      accountView,
      account: computed(() => AppState.account),

      editAccount() {
        this.account.name = this.state.editable.name
        this.account.picture = this.state.editable.picture
        this.account.accountComplete = true
        accountService.editAccount(this.account)
      }
    }
  }
}
</script>

<style scoped>
img {
  max-width: 100px;
}

.custom-border {
  border: 1px grey solid;
}
</style>
