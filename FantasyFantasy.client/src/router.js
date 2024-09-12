import { createRouter, createWebHashHistory } from 'vue-router'
import { authGuard, authSettled } from '@bcwdev/auth0provider-client'

function loadPage(page) {
  return () => import(`./pages/${page}.vue`)
}

const routes = [
  {
    path: '/',
    name: 'Home',
    component: loadPage('HomePage')
  },
  {
    path: '/about',
    name: 'About',
    component: loadPage('AboutPage')
  },
  {
    path: '/team',
    name: 'Team',
    component: loadPage('TeamPage'),
    beforeEnter: authGuard
  },
  {
    path: '/leagues',
    name: 'Leagues',
    component: loadPage('LeaguePage'),
    beforeEnter: authGuard
  },
  {
    path: '/leagueDetails/:id',
    name: 'LeagueDetails',
    component: loadPage('LeagueDetails'),
    beforeEnter: authSettled
  },
  {
    path: '/teambuilder',
    name: 'TeamBuilder',
    component: loadPage('TeamBuilderPage')
  },
  {
    path: '/party',
    name: 'Party',
    component: loadPage('PartyPage'),
    beforeEnter: authGuard
  },
  {
    path: '/account',
    name: 'Account',
    component: loadPage('AccountPage'),
    beforeEnter: authGuard
  },
  {
    path: '/players',
    name: 'Player',
    component: loadPage('PlayerPage')
  },
  {
    path: '/faceoff/:id',
    name: 'Faceoff',
    component: loadPage('FaceoffPage'),
    beforeEnter: authGuard
  },
]

export const router = createRouter({
  linkActiveClass: 'router-link-active',
  linkExactActiveClass: 'router-link-exact-active',
  history: createWebHashHistory(),
  routes
})
