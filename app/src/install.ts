import { computed, ref } from 'vue'

/*
 * Installing the web app on a phone's home screen. Chrome and Edge (Android, desktop) offer an
 * install prompt the app can trigger; iPhone and iPad Safari don't, so players get instructions
 * instead. The service worker (public/sw.js) is registered in production builds only, so it never
 * caches files while developing.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'ff.installDismissed'

const promptEvent = ref<InstallPromptEvent | null>(null)
const installed = ref(false)
const dismissed = ref(readDismissed())

function readDismissed(): boolean {
  try {
    return globalThis.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** Call once at startup, before the browser fires its install event. */
export function startInstallSupport(win: Window = window, registerWorker = import.meta.env.PROD) {
  win.addEventListener('beforeinstallprompt', event => {
    event.preventDefault() // Show our own button instead of the browser's mini-bar.
    promptEvent.value = event as InstallPromptEvent
  })
  win.addEventListener('appinstalled', () => {
    installed.value = true
    promptEvent.value = null
  })
  if (registerWorker && 'serviceWorker' in win.navigator) {
    win.addEventListener('load', () => {
      win.navigator.serviceWorker.register('/sw.js').catch(() => {
        // Without the worker the app still runs; it just can't open offline.
      })
    })
  }
}

/** Already running as an installed app. */
function isStandalone(win: Window): boolean {
  return win.matchMedia?.('(display-mode: standalone)').matches === true || (win.navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iPhone or iPad (iPadOS reports itself as a Mac with touch). */
function isIos(nav: Navigator): boolean {
  return /iphone|ipad|ipod/i.test(nav.userAgent) || (nav.userAgent.includes('Macintosh') && nav.maxTouchPoints > 1)
}

export function useInstall(win: Window = window) {
  const standalone = isStandalone(win)
  return {
    /** The browser can show its install dialog */
    canPrompt: computed(() => !standalone && !installed.value && !dismissed.value && !!promptEvent.value),
    /** iPhone/iPad Safari: show Add to Home Screen steps */
    showIosSteps: computed(() => !standalone && !installed.value && !dismissed.value && isIos(win.navigator)),
    async install() {
      const event = promptEvent.value
      if (!event) return
      promptEvent.value = null // A prompt can be used once.
      await event.prompt()
      if ((await event.userChoice).outcome === 'accepted') installed.value = true
    },
    dismiss() {
      dismissed.value = true
      try {
        win.localStorage.setItem(DISMISSED_KEY, '1')
      } catch {
        // Private mode: it just shows again next visit.
      }
    }
  }
}

/** Test hook: reset module state between tests. */
export function resetInstallStateForTest() {
  promptEvent.value = null
  installed.value = false
  dismissed.value = readDismissed()
}
