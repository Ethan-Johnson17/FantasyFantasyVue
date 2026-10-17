/*
 * FantasyFantasy service worker. Deliberately small: it makes the app installable and lets it open
 * without a connection, and never touches data.
 *
 * - Page loads: network first, so a new version always shows when online; the last good page is
 *   the fallback offline.
 * - Built assets (/assets/*, content-hashed and never changed): cache first.
 * - Everything else, including the API and sign-in (other origins), goes straight to the network.
 *
 * Bump VERSION to drop old caches.
 */
const VERSION = 'v1'
const PAGES = `pages-${VERSION}`
const ASSETS = `assets-${VERSION}`
const SHELL = '/'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(PAGES).then(cache => cache.add(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== PAGES && key !== ASSETS).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Every route serves the same app shell. Stored under '/', so sign-in callback URLs (?code=...) are never kept.
          if (response.ok) {
            const copy = response.clone()
            void caches.open(PAGES).then(cache => cache.put(SHELL, copy))
          }
          return response
        })
        .catch(() => caches.match(SHELL).then(cached => cached ?? Response.error()))
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        cached =>
          cached ??
          fetch(request).then(response => {
            if (response.ok) {
              const copy = response.clone()
              void caches.open(ASSETS).then(cache => cache.put(request, copy))
            }
            return response
          })
      )
    )
  }
})
