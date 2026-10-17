import type { Auth0VueClient } from '@auth0/auth0-vue'
import { watch } from 'vue'
import { createRouter, createWebHistory, type RouteLocationNormalized, type RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/leagues' },
  // Public, so newcomers can read it before signing in
  { path: '/how-it-works', name: 'how-it-works', component: () => import('./views/HowItWorksView.vue') },
  { path: '/sign-in', name: 'sign-in', component: () => import('./views/SignInView.vue'), meta: { guestOnly: true } },
  { path: '/leagues', name: 'leagues', component: () => import('./views/LeaguesView.vue'), meta: { auth: true } },
  { path: '/leagues/new', name: 'host', component: () => import('./views/HostLeagueView.vue'), meta: { auth: true } },
  { path: '/join', name: 'join', component: () => import('./views/JoinLeagueView.vue'), meta: { auth: true } },
  {
    path: '/leagues/:id',
    component: () => import('./views/league/LeagueLayout.vue'),
    meta: { auth: true },
    children: [
      { path: '', name: 'league', component: () => import('./views/league/LeagueHomeView.vue') },
      { path: 'party', name: 'party', component: () => import('./views/league/PartyView.vue') },
      { path: 'battles', name: 'battles', component: () => import('./views/league/BattlesView.vue') },
      // Static, so it wins over battles/:week
      { path: 'battles/upcoming', name: 'matchup', component: () => import('./views/league/MatchupView.vue') },
      { path: 'battles/:week', name: 'battle', component: () => import('./views/league/BattleResultView.vue') },
      { path: 'heroes', name: 'heroes', component: () => import('./views/league/HeroesView.vue') },
      { path: 'heroes/:heroId', name: 'hero', component: () => import('./views/league/HeroDetailView.vue') },
      { path: 'finale', name: 'finale', component: () => import('./views/league/FinaleView.vue') },
      { path: 'draft', name: 'draft', component: () => import('./views/league/DraftRecapView.vue') }
    ]
  },
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
  const router = createRouter({
    history: createWebHistory(),
    routes,
    // Back/forward restores the old position; links to a section (#traits) scroll to it; otherwise start at the top.
    scrollBehavior: (to, _from, saved) => saved ?? (to.hash ? { el: to.hash, top: 16 } : { top: 0 })
  })
  router.beforeEach(authGuard(auth))
  return router
}
