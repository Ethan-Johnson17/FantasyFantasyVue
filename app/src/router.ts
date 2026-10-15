import type { Auth0VueClient } from '@auth0/auth0-vue'
import { watch } from 'vue'
import { createRouter, createWebHistory, type RouteLocationNormalized, type RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/leagues' },
  { path: '/sign-in', name: 'sign-in', component: () => import('./views/SignInView.vue'), meta: { guestOnly: true } },
  { path: '/leagues', name: 'leagues', component: () => import('./views/LeaguesView.vue'), meta: { auth: true } },
  { path: '/leagues/new', name: 'host', component: () => import('./views/HostLeagueView.vue'), meta: { auth: true } },
  { path: '/join', name: 'join', component: () => import('./views/JoinLeagueView.vue'), meta: { auth: true } },
  { path: '/leagues/:id', name: 'league', component: () => import('./views/LeagueView.vue'), meta: { auth: true } },
  { path: '/:pathMatch(.*)*', redirect: '/leagues' }
]

type AuthState = Pick<Auth0VueClient, 'isLoading' | 'isAuthenticated'>

/** Resolves once Auth0 has finished checking for an existing session. */
function authSettled(auth: AuthState): Promise<void> {
  if (!auth.isLoading.value) return Promise.resolve()
  return new Promise(resolve => {
    const stop = watch(auth.isLoading, loading => {
      if (loading) return
      stop()
      resolve()
    })
  })
}

/** Signed-out visitors go to our sign-in screen (remembering where they were headed). */
export function authGuard(auth: AuthState) {
  return async (to: RouteLocationNormalized) => {
    await authSettled(auth)
    if (to.meta.auth && !auth.isAuthenticated.value) return { name: 'sign-in', query: { next: to.fullPath } }
    if (to.meta.guestOnly && auth.isAuthenticated.value) return { name: 'leagues' }
    return true
  }
}

export function createAppRouter(auth: AuthState) {
  const router = createRouter({ history: createWebHistory(), routes })
  router.beforeEach(authGuard(auth))
  return router
}
