import { createAuth0 } from '@auth0/auth0-vue'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { createApiClient } from './api/client'
import { apiKey } from './api/inject'
import { loadConfig } from './config'
import { createAppRouter } from './router'
import './styles/base.css'

const config = loadConfig()
const app = createApp(App)

const auth0 = createAuth0({
  domain: config.auth0.domain,
  clientId: config.auth0.clientId,
  authorizationParams: { redirect_uri: window.location.origin, audience: config.auth0.audience },
  // Tokens stay in memory; refresh tokens avoid third-party-cookie silent auth where enabled.
  useRefreshTokens: true,
  useRefreshTokensFallback: true
})

app.use(createPinia())
// The router goes in before Auth0 so the login callback can return to the page the user wanted.
app.use(createAppRouter(auth0))
app.use(auth0)
app.provide(
  apiKey,
  createApiClient(config.apiUrl, async () => {
    const token = await auth0.getAccessTokenSilently()
    if (!token) throw new Error('Not signed in')
    return token
  })
)
app.mount('#app')
