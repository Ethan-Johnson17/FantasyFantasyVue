# Trades

Trades between parties, decided 2026-11-12. Before this, free agency was the only way to change a roster after the
draft (docs/CLASSIC_SCORING.md, "Free agency"); the 2026-10-16 design had two parties agree and the trade happen
immediately, with no trades after week 10.

## Decisions (2026-11-12)

- **Modes:** every mode with more than one party: Classic, Crossover, Dynasty and Co-op. Solo never has trades.
- **Offers:** 1–3 of the other party's heroes for 1–3 of yours, in any mix (2-for-1 is allowed).
- **Answering:** offers wait in the league's Trades inbox, with a badge for offers waiting on you. The other party
  accepts or declines; the sender can withdraw. No counter-offers: decline and send your own.
- **Deadline:** trades close when 4 regular-season weeks are left (after week 10 of a 14-week season). A season of 4
  regular weeks or fewer has no trades.
- **Uneven trades:** whoever ends up over the roster size picks who to release to free agency: the sender when making
  the offer, the other party when accepting. The party left short has an open roster spot, and claims a free agent
  into it without dropping anyone.

## Rules

- **When:** while the league is active and the trade window is open (`resolvedWeeks < regular weeks - 4`). Playoff
  weeks never have trades. A trade never changes a week that is due: as with claims, due weeks are resolved first,
  and a trade during a battle's resolution is refused with "try again in a moment". It counts from the next week.
- **What can be traded:** heroes on the two parties, each at most once in an offer. In Crossover a player whose game
  this week has kicked off can't be traded or released until the week ends.
- **Releases:** exactly as many as it takes to bring a roster back to its size, never more. A party already short
  releases fewer (or none).
- **Checks, at offer and again at accept:** no class limit broken and every lineup still fillable, for both parties;
  every hero still where the offer says. An offer that can no longer happen (a hero moved, the window closed, the
  league ended) expires. Accepting re-checks everything inside one transaction, so two offers that share a hero can't
  both go through.
- **After a trade:** an arriving hero takes a departing starter's slot when the slot allows it (Classic rebuilds the
  lineup otherwise; Crossover refills the slot from the bench, players yet to play only). Crossover's Quest party
  replaces departing members the same way. A departing Champion is withdrawn. Dynasty XP stays with the party that
  earned it: a traded hero starts again, as with claims.
- **Limits:** up to 10 open offers sent per party, and never the same offer twice while one is open.
- **Who sees what:** an offer is visible only to the two parties. An accepted trade is listed in the league's recent
  moves, with any releases.

## Claims into an open spot

A party under its roster size claims a free agent without dropping anyone (dropping one is still allowed). A party at
its roster size must drop one, as before.

## API

- `GET /api/leagues/:id/trades`: my party's offers, both ways: open ones, then the latest answered (20), each with
  its heroes, the releases, and whether it's waiting on me. Also the trade window: open or not, and the last week to
  trade.
- `POST /api/leagues/:id/trades` `{ toPartyId, offered, requested, releases }`: makes an offer.
- `POST /api/leagues/:id/trades/:tradeId/accept` `{ releases }`, `/decline`, `/withdraw`.
- `POST /api/leagues/:id/claims` takes `dropHeroId: null` for an open spot.
- `GET /api/leagues/mine` and the league detail report `tradeOffers`: open offers waiting on me.

## App

- Every party has a roster page (from the standings, the league home and the matchup).
- A hero on another party's roster has **Trade for**, which opens the offer with that hero picked: add up to two more
  of theirs, pick 1–3 of yours, and the releases if they're needed.
- The Trades inbox: offers waiting on me (accept or decline, picking releases if needed), offers I sent (withdraw),
  and the latest answered. The league's tabs show a badge for offers waiting on me.
