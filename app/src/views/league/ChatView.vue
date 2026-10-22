<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useApi } from '../../api/inject'
import type { ChatMessage } from '../../api/types'
import CrestShield from '../../components/CrestShield.vue'
import FormError from '../../components/FormError.vue'
import { useLeague } from '../../league'
import { CHAT_MESSAGE_MAX, CHAT_POLL_MS } from '../../chat'
import { chatTime } from '../../time'

const api = useApi()
const { league } = useLeague()
const leagueId = () => league.value?.id ?? ''

const messages = ref<ChatMessage[]>([])
const hasMore = ref(false)
const canModerate = ref(false)
const readOnly = ref(false)
const loaded = ref(false)
const draft = ref('')
const sending = ref(false)
const error = ref<unknown>(null)
const offline = ref(false)
const end = ref<HTMLElement | null>(null)

const tabsShown = computed(() => league.value?.status !== 'forming' && league.value?.status !== 'canceled')
const remaining = computed(() => CHAT_MESSAGE_MAX - draft.value.length)

/** Takes the latest page, keeping any older messages already loaded above it. */
function mergeLatest(latest: ChatMessage[]) {
  const first = latest[0]?.id
  // Ids are time-ordered hex strings of one length, so they compare in posting order.
  const older = first ? messages.value.filter(message => message.id < first) : []
  messages.value = [...older, ...latest]
}

async function refresh(scroll: boolean) {
  const nearBottom = isNearBottom()
  const page = await api.getChat(leagueId())
  const before = messages.value.at(-1)?.id
  if (!loaded.value) hasMore.value = page.hasMore
  canModerate.value = page.canModerate
  readOnly.value = page.readOnly
  mergeLatest(page.messages)
  loaded.value = true
  if (scroll || (nearBottom && messages.value.at(-1)?.id !== before)) await scrollToEnd()
}

function isNearBottom(): boolean {
  if (typeof window === 'undefined') return true
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160
}

async function scrollToEnd() {
  await nextTick()
  end.value?.scrollIntoView?.({ block: 'end' })
}

let timer: ReturnType<typeof setInterval> | undefined
async function poll() {
  if (document.visibilityState === 'hidden') return
  try {
    await refresh(false)
    offline.value = false
  } catch {
    offline.value = true
  }
}

onMounted(async () => {
  try {
    await refresh(true)
  } catch (caught) {
    error.value = caught
  }
  timer = setInterval(() => void poll(), CHAT_POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
})
onUnmounted(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})
function onVisible() {
  if (document.visibilityState === 'visible') void poll()
}

async function loadOlder() {
  const first = messages.value[0]
  if (!first) return
  try {
    const page = await api.getChat(leagueId(), first.id)
    messages.value = [...page.messages, ...messages.value]
    hasMore.value = page.hasMore
  } catch (caught) {
    error.value = caught
  }
}

async function send() {
  const body = draft.value.trim()
  if (!body || sending.value) return
  sending.value = true
  error.value = null
  try {
    const message = await api.postChat(leagueId(), body)
    messages.value = [...messages.value.filter(existing => existing.id !== message.id), message]
    draft.value = ''
    await scrollToEnd()
  } catch (caught) {
    error.value = caught
  } finally {
    sending.value = false
  }
}

/** Enter sends; Shift+Enter starts a new line. */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void send()
  }
}

async function remove(message: ChatMessage) {
  const prompt = message.mine ? 'Remove your message?' : `Remove this message from ${message.author?.name ?? 'a former member'}?`
  if (!window.confirm(prompt)) return
  try {
    await api.deleteChat(leagueId(), message.id)
    messages.value = messages.value.filter(existing => existing.id !== message.id)
  } catch (caught) {
    error.value = caught
  }
}

async function report(message: ChatMessage) {
  if (!window.confirm('Report this message to the league host?')) return
  try {
    const updated = await api.reportChat(leagueId(), message.id)
    messages.value = messages.value.map(existing => (existing.id === updated.id ? updated : existing))
  } catch (caught) {
    error.value = caught
  }
}

const authorName = (message: ChatMessage) => message.author?.name ?? 'Former member'
</script>

<template>
  <header class="page-header">
    <RouterLink :to="`/leagues/${league?.id}`" class="back-link">‹ {{ league?.name }}</RouterLink>
    <h1 class="title">League chat</h1>
    <div class="muted small">Members only · strong language is masked · kept until 30 days after the season</div>
  </header>

  <FormError :error="error" />
  <p v-if="!loaded && !error" class="muted" aria-busy="true">Loading…</p>

  <button v-if="hasMore" type="button" class="link-button older" @click="loadOlder">Show older messages</button>

  <p v-if="loaded && !messages.length" class="card muted empty">No messages yet. Say hello to the league.</p>

  <ol class="messages" aria-live="polite" aria-label="Messages">
    <li v-for="message in messages" :key="message.id" class="message" :class="{ mine: message.mine }">
      <CrestShield v-if="message.author" :crest="message.author.crest" :size="28" decorative class="crest" />
      <span v-else class="crest former" aria-hidden="true"></span>
      <div class="bubble">
        <div class="meta">
          <span class="author">{{ message.mine ? 'You' : authorName(message) }}</span>
          <time class="muted tiny" :datetime="message.at">{{ chatTime(new Date(message.at)) }}</time>
          <span v-if="message.reports" class="reports tiny" :aria-label="`Reported by ${message.reports} member${message.reports === 1 ? '' : 's'}`">
            ⚑ {{ message.reports }}
          </span>
        </div>
        <p class="body">{{ message.body }}</p>
        <div class="actions">
          <span v-if="message.reportedByMe" class="muted tiny">Reported</span>
          <button v-else-if="!message.mine && !readOnly" type="button" class="action tiny" :aria-label="`Report message from ${authorName(message)}`" @click="report(message)">
            Report
          </button>
          <button v-if="message.mine || canModerate" type="button" class="action tiny" :aria-label="`Remove message from ${message.mine ? 'you' : authorName(message)}`" @click="remove(message)">
            Remove
          </button>
        </div>
      </div>
    </li>
  </ol>
  <span ref="end" class="end"></span>

  <p v-if="readOnly" class="card muted">This league was canceled, so its chat is closed.</p>
  <form v-else-if="loaded" class="composer" :class="{ 'no-tabs': !tabsShown }" @submit.prevent="send">
    <p v-if="offline" class="muted tiny offline">Can’t reach chat right now. Trying again…</p>
    <div class="row">
      <label for="chat-message" class="visually-hidden">Message</label>
      <textarea
        id="chat-message"
        v-model="draft"
        class="input"
        rows="1"
        :maxlength="CHAT_MESSAGE_MAX"
        placeholder="Message the league"
        @keydown="onKeydown"
      ></textarea>
      <button type="submit" class="btn btn-primary send" :disabled="sending || !draft.trim()">Send</button>
    </div>
    <span v-if="remaining <= 50" class="muted tiny">{{ remaining }} characters left</span>
  </form>
</template>

<style scoped>
.title {
  margin: 0;
}
.small {
  font-size: 13px;
}
.tiny {
  font-size: 12px;
}
.older {
  display: block;
  margin: 0 auto 8px;
}
.empty {
  margin-top: 8px;
}
.messages {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.message {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.message.mine {
  flex-direction: row-reverse;
}
.crest {
  flex: none;
  margin-top: 2px;
}
.crest.former {
  width: 28px;
  height: 32px;
  border-radius: 6px;
  background: var(--line);
}
.bubble {
  min-width: 0;
  max-width: 80%;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.mine .bubble {
  border-color: var(--gold);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}
.author {
  font-weight: 700;
  font-size: 14px;
}
.reports {
  color: var(--danger);
  font-weight: 700;
}
.body {
  margin: 2px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.4;
}
.actions {
  display: flex;
  gap: 12px;
}
.actions:empty {
  display: none;
}
.action {
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-family: inherit;
  cursor: pointer;
}
.action:hover {
  color: var(--gold);
}
.link-button {
  min-height: var(--tap);
  border: 0;
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.end {
  display: block;
  height: 1px;
}
.composer {
  position: sticky;
  bottom: calc(61px + env(safe-area-inset-bottom));
  margin-top: 12px;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--ink);
}
.composer.no-tabs {
  bottom: 0;
}
.row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.row .input {
  flex: 1;
  min-width: 0;
  padding: 11px 12px;
  resize: none;
  field-sizing: content;
  max-height: 140px;
}
.send {
  flex: none;
  min-height: 46px;
}
.offline {
  margin: 0;
}
</style>
