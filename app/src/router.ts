import type { Auth0VueClient } from '@auth0/auth0-vue'
import { watch } from 'vue'
import { createRouter, createWebHistory, type RouteLocationNormalized, type RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/leagues' },
  // Public, so newcomers can read it before signing in
  { path: '/how-it-works', name: 'how-it-works', component: () => import('./views/HowItWorksView.vue') },
  { path: '/privacy', name: 'privacy', component: () => import('./views/PrivacyView.vue') },
  { path: '/sign-in', name: 'sign-in', component: () => import('./views/SignInView.vue'), meta: { guestOnly: true } },
  { path: '/account', name: 'account', component: () => import('./views/AccountView.vue'), meta: { auth: true } },
  { path: '/leagues', name: 'leagues', component: () => import('./views/LeaguesView.vue'), meta: { auth: true } },
  { path: '/leagues/find', name: 'find', component: () => import('./views/FindLeaguesView.vue'), meta: { auth: true } },
  { path: '/leagues/new', name: 'host', component: () => import('./views/HostLeagueView.vue'), meta: { auth: true } },
  { path: '/join', name: 'join', component: () => import('./views/JoinLeagueView.vue'), meta: { auth: true } },
  {
    path: '/leagues/:id',
    component: () => import('./views/league/LeagueLayout.vue'),
    meta: { auth: true },
    children: [
      { path: '', name: 'league', component: () => import('./views/league/LeagueHomeView.vue') },
      { path: 'party', name: 'party', component: () => import('./views/league/PartyView.vue') },
      // The season schedule now lives in the Matchup week strip.
      { path: 'battles', redirect: to => `/leagues/${String(to.params.id)}/matchup` },
      { path: 'matchup/:week?', name: 'matchup', component: () => import('./views/league/MatchupView.vue') },
      // Older links: results and the preview now live on the matchup screen.
      { path: 'battles/upcoming', redirect: to => `/leagues/${String(to.params.id)}/matchup` },
      { path: 'battles/:week', redirect: to => `/leagues/${String(to.params.id)}/matchup/${String(to.params.week)}` },
      { path: 'heroes', name: 'heroes', component: () => import('./views/league/HeroesView.vue') },
      { path: 'heroes/:heroId', name: 'hero', component: () => import('./views/league/HeroDetailView.vue') },
      { path: 'finale', name: 'finale', component: () => import('./views/league/FinaleView.vue') },
      { path: 'draft', name: 'draft', component: () => import('./views/league/DraftRecapView.vue') },
      { path: 'chat', name: 'chat', component: () => import('./views/league/ChatView.vue') },
      { path: 'keepers', name: 'keepers', component: () => import('./views/league/KeepersView.vue') },
      { path: 'dynasty', name: 'dynasty', component: () => import('./views/league/DynastyView.vue') }
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
