<script setup lang="ts">
import { useInstall } from '../install'

/* Offers to put the app on the home screen: the browser's install dialog, or steps on iPhone. */

const { canPrompt, showIosSteps, install, dismiss } = useInstall()
// A public-folder file, bound as a string so the build leaves the URL as is.
const ICON = '/icons/icon-192.png'
</script>

<template>
  <section v-if="canPrompt || showIosSteps" class="card install" aria-labelledby="install-title">
    <img :src="ICON" alt="" width="44" height="44" class="install-icon" />
    <div class="install-text">
      <h2 id="install-title" class="install-title">Get the app</h2>
      <p v-if="canPrompt" class="muted small">Put FantasyFantasy on your home screen for one-tap access.</p>
      <p v-else class="muted small">
        On iPhone or iPad: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
      </p>
      <div class="install-actions">
        <button v-if="canPrompt" type="button" class="btn btn-primary" @click="install">Install</button>
        <button type="button" class="btn btn-secondary" @click="dismiss">{{ canPrompt ? 'Not now' : 'Got it' }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.install {
  margin-top: 16px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.install-icon {
  flex: none;
  border-radius: 10px;
}
.install-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.install-title {
  font-size: 20px;
}
.install-text p {
  margin: 0;
  line-height: 1.4;
}
.small {
  font-size: 14px;
}
.install-actions {
  margin-top: 6px;
  display: flex;
  gap: 8px;
}
.install-actions .btn {
  min-height: var(--tap);
  padding: 0 14px;
}
</style>
