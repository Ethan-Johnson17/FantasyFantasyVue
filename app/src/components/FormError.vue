<script setup lang="ts">
import { computed } from 'vue'
import { ApiError } from '../api/client'

const props = defineProps<{ error: unknown }>()

const message = computed(() => {
  if (!props.error) return ''
  return props.error instanceof ApiError ? props.error.message : 'Something went wrong. Please try again.'
})
const issues = computed(() => (props.error instanceof ApiError ? props.error.issues : []))
</script>

<template>
  <div v-if="message" class="error" role="alert">
    <p class="message">{{ message }}</p>
    <ul v-if="issues.length" class="issues">
      <li v-for="issue in issues" :key="issue.path + issue.message">{{ issue.path }}: {{ issue.message }}</li>
    </ul>
  </div>
</template>

<style scoped>
.message {
  margin: 0;
}
.issues {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 14px;
}
</style>
