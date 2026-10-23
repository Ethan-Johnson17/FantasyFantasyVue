<script setup lang="ts">
import { useRouter } from 'vue-router'
import { MINIMUM_AGE, PRIVACY_CONTACT, PRIVACY_EFFECTIVE } from '../privacy'

/*
 * The privacy policy, readable before signing in. Keep it in step with what the app actually stores:
 * the account model, league and chat data, chat retention (api/src/modules/chat), and account deletion
 * (api/src/modules/accounts/deletion.service.ts).
 */

const router = useRouter()
const mailto = `mailto:${PRIVACY_CONTACT}?subject=${encodeURIComponent('FantasyFantasy privacy request')}`

function back() {
  // Return where the reader came from; a direct visit goes home (or to sign-in when signed out).
  if (window.history.state && (window.history.state as { back?: unknown }).back) router.back()
  else void router.push('/')
}
</script>

<template>
  <main class="page privacy">
    <header class="page-header">
      <button type="button" class="back-link back-button" @click="back">‹ Back</button>
      <div class="eyebrow">FantasyFantasy</div>
      <h1 class="title">Privacy policy</h1>
      <div class="muted small">Effective {{ PRIVACY_EFFECTIVE }}</div>
    </header>

    <section class="card lead">
      <p>
        FantasyFantasy is a free, non-commercial game. We collect only what it needs to run. No ads, no tracking or
        analytics, no selling your data, and no wagering, ever.
      </p>
    </section>

    <section class="section">
      <h2 class="section-title">What we collect</h2>
      <ul>
        <li>
          <strong>Sign-in.</strong> Auth0 runs sign-in for us. Auth0 keeps your email address and login details (or, if
          you sign in with Google, what Google shares with it). We receive a unique sign-in ID, never your password, and
          we don't store your email address.
        </li>
        <li><strong>Your profile.</strong> The display name you choose (“Adventurer” until you pick one), and a picture link if one is set.</li>
        <li>
          <strong>Your game.</strong> Leagues you host or join, your party's name and crest, hero rankings, lineups,
          Champions, free-agent claims, and battle results.
        </li>
        <li>
          <strong>League chat.</strong> Messages you send, after strong profanity is masked (only the masked text is
          saved), and messages you report.
        </li>
        <li>
          <strong>Technical data.</strong> Your IP address is used briefly to limit how fast requests can be made; those
          counters expire within a minute. Our hosting provider may keep standard request logs, including IP addresses,
          for a short time. Our own logs record only the kind of request, the page, and the result, with league PINs
          hidden.
        </li>
        <li>
          <strong>On your device.</strong> Your browser stores sign-in tokens so you stay signed in, and remembers if you
          dismissed the “install the app” card. We use no advertising or tracking cookies. Auth0 sets its own cookies on
          its sign-in pages.
        </li>
      </ul>
      <p class="muted">
        Heroes are powered by public NFL statistics from nflverse. Those contain nothing about you.
      </p>
    </section>

    <section class="section">
      <h2 class="section-title">How we use it</h2>
      <p>
        To run the game: your leagues, drafts, and battles; to show your name and party to the people you play with; to
        keep things fair and safe (request limits, the chat filter, and reports); and to fix problems.
      </p>
    </section>

    <section class="section">
      <h2 class="section-title">Who can see what</h2>
      <ul>
        <li>Members of a league see your display name, party name and crest, lineup, results, and league chat.</li>
        <li>
          In a public league, anyone signed in can also see the league, its parties and their display names, standings,
          and results. Chat is always members only.
        </li>
        <li>The host sees how many members reported a chat message, not who reported it.</li>
      </ul>
    </section>

    <section class="section">
      <h2 class="section-title">Services we rely on</h2>
      <p>These providers handle data for us, only to run the game:</p>
      <ul>
        <li><strong>Auth0</strong> (by Okta): sign-in.</li>
        <li><strong>Vercel</strong>: hosting for the app and its server.</li>
        <li><strong>MongoDB Atlas</strong>: the game's database.</li>
        <li><strong>Google Fonts</strong>: the app's fonts load from Google, which receives your IP address and browser details when they do.</li>
      </ul>
      <p>
        Your data may be processed in the United States and other countries where these providers operate. We don't
        share it with anyone else unless the law requires it.
      </p>
    </section>

    <section class="section">
      <h2 class="section-title">How long we keep it</h2>
      <ul>
        <li>Your account and game data: until you delete your account.</li>
        <li>League chat: deleted 30 days after the season ends or the league is canceled.</li>
        <li>Request-limit counters: under a minute.</li>
      </ul>
    </section>

    <section class="section">
      <h2 class="section-title">Your choices</h2>
      <ul>
        <li>Change your display name any time on your Account page.</li>
        <li>
          <strong>Delete your account</strong> on your Account page. This removes your profile and your chat messages, and
          your parties leave leagues that haven't drafted yet. In leagues that already drafted, your party keeps playing
          for the other members as “Former adventurer”, with no name attached. If you host a league that's still
          running, cancel it first.
        </li>
        <li>
          Your sign-in record at Auth0 is separate. To have it removed too, or to ask for a copy of your data or a
          correction, email <a :href="mailto">{{ PRIVACY_CONTACT }}</a>.
        </li>
      </ul>
      <p>If the laws where you live give you other privacy rights, contact us and we'll help.</p>
    </section>

    <section class="section">
      <h2 class="section-title">Children</h2>
      <p>
        You must be {{ MINIMUM_AGE }} or older to play. FantasyFantasy isn't meant for children under {{ MINIMUM_AGE }},
        and we don't knowingly collect their data. If you believe a child under {{ MINIMUM_AGE }} has an account, email us
        and we'll delete it.
      </p>
    </section>

    <section class="section">
      <h2 class="section-title">Security</h2>
      <p>
        Connections are encrypted, and every request is checked against your sign-in. No system is perfectly secure, but
        we keep what we collect small so there's less to protect.
      </p>
    </section>

    <section class="section">
      <h2 class="section-title">Changes</h2>
      <p>If this policy changes, we'll update the date above, and point out significant changes in the app.</p>
    </section>

    <section class="section">
      <h2 class="section-title">Contact</h2>
      <p>Questions or requests: <a :href="mailto">{{ PRIVACY_CONTACT }}</a></p>
    </section>
  </main>
</template>

<style scoped>
.back-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gold);
  font-family: inherit;
  cursor: pointer;
}
.small {
  font-size: 13px;
}
.lead p {
  margin: 0;
  line-height: 1.55;
}
.section {
  margin-top: 20px;
}
.section p {
  margin: 8px 0 0;
  line-height: 1.55;
}
.section ul {
  margin: 8px 0 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  line-height: 1.55;
}
.section-title {
  font-size: 22px;
}
a {
  overflow-wrap: anywhere;
}
</style>
