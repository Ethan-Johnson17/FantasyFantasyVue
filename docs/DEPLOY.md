# Deploying FantasyFantasy (free)

The web app and the API each run as a Vercel project on the free Hobby plan; the data lives in a free MongoDB
Atlas cluster; sign-in stays on the free Auth0 tenant. Nothing here needs a credit card.

| Piece | Where | Notes |
| --- | --- | --- |
| Web app (`app/`) | Vercel project #1 | Static files on Vercel's CDN; `app/vercel.json` |
| API (`api/`) | Vercel project #2 | One serverless function; `api/vercel.json`, entry `api/index.js` → `src/vercel.ts` |
| Database | MongoDB Atlas, a **separate project and free cluster** for production | Never share it with development |
| Sign-in | Auth0 (`dev-pamf5-jc.us.auth0.com`) | Add the production URLs |

Vercel's Hobby plan is for **non-commercial, personal use**: no ads or payments. Donations are allowed. If the app
ever makes money, move to Vercel Pro or another host.

Do the steps in order: the API's address is needed by the app, and the app's address by the API and Auth0.

## 1. Production database (MongoDB Atlas)

1. In Atlas, **create a new project** (e.g. "FantasyFantasy Production") and in it a **free cluster**. Pick
   **AWS, N. Virginia (us-east-1)**: the API runs in Vercel's Washington, D.C. region (`iad1`), right next to it.
   If you choose another region, change `regions` in `api/vercel.json` to the closest Vercel region.
2. **Database Access → Add New Database User**:
   - Authentication: password. Use **Autogenerate Secure Password** and save it in your password manager.
   - Privileges: **Specific Privileges → `readWrite` on database `fantasyfantasy`** (not an admin role). This user
     can touch the game's database and nothing else.
3. **Network Access → Add IP Address → Allow access from anywhere (`0.0.0.0/0`)**. Vercel's addresses change, and
   the free tier can't pin them, so the strong, limited user from step 2 is what protects the data.
4. **Connect → Drivers** and copy the connection string. Put your user and password in it and add the database name
   before the `?`: `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/fantasyfantasy?retryWrites=true&w=majority`.
   Keep it secret: it's the key to the database.

## 2. Load the historical stats into production (once)

Leagues need the nflverse stats. From your computer:

1. Create `api/.env.production` (git-ignored; never commit it) with:
   ```
   NODE_ENV=production
   MONGODB_URI=<the production connection string>
   AUTH0_DOMAIN=dev-pamf5-jc.us.auth0.com
   AUTH0_AUDIENCE=https://api.fantasyfantasy.dev
   ```
2. In `api/`, run:
   ```bash
   npx tsx --env-file=.env.production src/scripts/import-stats.ts --seasons 2011-2025
   ```
   It downloads the seasons from nflverse and takes a few minutes. Re-running it is safe.

## 3. API on Vercel

1. Sign in to [vercel.com](https://vercel.com) with GitHub. **Add New → Project** and import
   `Ethan-Johnson17/FantasyFantasyVue`.
2. **Root Directory: `api`**. Leave the framework as detected (Express) or "Other"; the build command comes from
   `api/vercel.json`.
3. **Environment Variables** (Production only; see step 6 about previews):

   | Name | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | the production connection string |
   | `MONGODB_MAX_POOL_SIZE` | `5` |
   | `AUTH0_DOMAIN` | `dev-pamf5-jc.us.auth0.com` |
   | `AUTH0_AUDIENCE` | `https://api.fantasyfantasy.dev` |
   | `CORS_ORIGINS` | `https://example.invalid` for now (set in step 5) |
   | `TRUST_PROXY_HOPS` | `1` |
   | `LOG_LEVEL` | `info` |

4. **Deploy.** Note the address, e.g. `https://fantasyfantasy-api.vercel.app`, and open `/health` on it. You should
   see `{"status":"ok","db":"up"}`. A `503` means the API can't reach the database: check the connection string,
   the user's password, and the Network Access entry.

## 4. Web app on Vercel

1. **Add New → Project**, the same repository, **Root Directory: `app`** (framework: Vite).
2. **Environment Variables** (Production only):

   | Name | Value |
   | --- | --- |
   | `VITE_API_URL` | the API address from step 3, no trailing slash |
   | `VITE_AUTH0_DOMAIN` | `dev-pamf5-jc.us.auth0.com` |
   | `VITE_AUTH0_CLIENT_ID` | the SPA client ID (as in `app/.env.local`) |
   | `VITE_AUTH0_AUDIENCE` | `https://api.fantasyfantasy.dev` |

3. **Deploy** and note the address, e.g. `https://fantasyfantasy.vercel.app`.

## 5. Connect the pieces

1. **API project → Settings → Environment Variables:** set `CORS_ORIGINS` to the app address (no trailing slash),
   then **Deployments → Redeploy** the latest production deployment.
2. **Auth0 → Applications → (the SPA) → Settings**, add the app address to **Allowed Callback URLs**,
   **Allowed Logout URLs**, and **Allowed Web Origins** (keep `http://localhost:8080` for development). Save.

## 6. Preview deployments

Vercel builds a preview for every branch. Leave the environment variables **Production-only**, as above: previews
then stop with "Missing app settings" (app) or "Invalid environment configuration" (API) instead of reaching real
players' data. To test a branch end to end later, give previews their own database and Auth0 settings.

## 7. Check it

- Open the app, sign in, create a league, and join it from a second account.
- On an **iPhone** and an **Android phone**: install the app (Your leagues → Get the app), open it from the home
  screen, and sign in. Confirm sign-in returns to the installed app. iPhone keeps the installed app's storage
  separate from Safari, so players sign in once more after installing.
- Vercel → each project → **Usage** shows how much of the free allowance is used. Over a limit, Vercel pauses that
  feature (no bill).

Remaining launch items (Google sign-in keys, and so on) are in `ROADMAP.md` under "Before public launch".
