# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

SkyBook is an airline booking app (fictional airlines): search nonstop flights by origin, destination, date, cabin and
passenger count, enter passenger names, confirm, then view and cancel bookings. One Node process serves the JSON API under
`/api` (Express 5) and the React (Vite) app; all data is in Neon Postgres. It was scaffolded from the
`build-fullstack-app-react-node` skill (quantity-based "seats on a flight" variant), so that skill's `references/` explain
the original design choices.

## Commands
- `npm run dev`: API + Vite middleware on :3000 (`PORT=3100 npm run dev` if 3000 is taken). There is **no auto-restart**
  (`node --watch` loops on Windows because of Vite's `.vite/deps_temp_*` writes): restart after editing `server/` or `shared/`;
  `src/` hot-reloads.
- `npm run build` (Vite into `dist/`), `npm start` (serve API + `dist/`), `npm run prod` (both).
- `npm run db:reset`: drops `bookings` and `flights`, recreates and reseeds; auth tables survive. **Local `.env` points at the same
  Neon database as the deployed site, so this wipes live bookings.**
- No linter. Verify with `npm run build` and `node --check server/*.js shared/*.js`. Booking routes need a cookie jar from
  `POST /api/auth/sign-up/email` or `sign-in/email`, and an `Origin` header equal to the app's origin, or Better Auth returns 403.
- Tests (functional): `npm run test:api` (`node --test`, `tests/api/`) and `npm run test:e2e` (Playwright, `tests/e2e/` has its own
  `package.json`; run `npm install` there once, then `npx playwright install chromium`). Both start the app on :3200 against the Neon
  **test branch** from `.env.test` (gitignored; needs `DATABASE_URL` and `BETTER_AUTH_SECRET`) and refuse to run if that URL matches
  `.env`. Tests create their own users (`t-*@test.local`) and flights (`T-*`) and delete them afterwards. The test server runs with
  `NODE_ENV=development`, not `test`, because Better Auth skips its Origin/CSRF check when `NODE_ENV=test`.
- Windows: run `npm run build` from a shell whose path has an upper-case drive letter (`C:\dev\...`). From `c:\dev\...` Vite can bundle
  one module twice (two `ToastContext`s), so the built app breaks on confirming a booking while `npm run dev` looks fine.
  `test:e2e` builds from the canonical path itself.
- Needs Node 22+ (`--env-file-if-exists`); on this machine Node 24 is portable at `%USERPROFILE%\tools\node-v24.22.0-win-x64`.
  Do not run `npm ci` while the dev server is up (Windows file locks leave a half-installed `node_modules`).
- Required `.env`: `DATABASE_URL` (Neon) and `BETTER_AUTH_SECRET` (32+ chars); the server exits at startup without them.

## Architecture
Request path: `src/services/api.js` (only place the browser calls the backend) -> `server/api.js` (routing + request-shape
validation) -> `server/db.js` (all SQL). Rules shared by Node and Vite live in `shared/domain.js` (airports with timezones, cabins,
limits, `quote()`); plain ESM, no Node-only imports.

Startup order in `server/index.js` matters: `migrateAuth()` (Better Auth's tables) then `initDb()` (app tables, which reference
`"user"(id)`), then listen. `initDb()` also inserts any missing departures from `server/seed-flights.js` (deterministic ids,
`ON CONFLICT DO NOTHING`), so the 60-day schedule rolls forward on every start.

Auth is Better Auth (email + password, cookie sessions) in the same process: `app.all('/api/auth/*splat', toNodeHandler(auth))` is
mounted **before** `express.json()`. Flight search is public; `/api/bookings` is behind `requireUser` (401), every query is scoped by
`req.user.id`, and other people's bookings are 404. The auth base URL is `BETTER_AUTH_URL`, else Render's `RENDER_EXTERNAL_URL`,
else localhost outside production (required in production).

## Invariants
- Server-authoritative: the client sends flight id, cabin, passenger names and contact only. Fares come from `flights`; seats are
  re-checked in the transaction.
- Overselling is prevented by a row lock: `createBooking` runs `SELECT ... FOR UPDATE` on the flight, then counts Confirmed
  passengers per cabin (seats left = capacity - sum of `pax`), so cancelling frees seats. Sold out -> 409.
- All times are `timestamptz`; display uses the airport's zone (`originTz`/`destTz`), never the browser's, and the search day is the
  origin-local calendar day.
- Cast `numeric` to `float8` in every SELECT. Bookings snapshot flight number, airline, route, times and per-passenger fare.
- No bookings within `closeBookingHours` (2) of departure; cancellation until `cancelBeforeHours` (24). Both in `shared/domain.js`.
- Throw `HttpError(status, msg)` anywhere; the central handler masks 5xx messages. Express 5 forwards async throws.
- Search state (`?from=&to=&date=&cabin=&pax=&sort=`) and booking state (`?cabin=&pax=`) live in URL params.

## Gotchas
- Schema is `CREATE TABLE IF NOT EXISTS`: changing a column on an existing database needs a manual `ALTER` (or `db:reset`).
- Payments are not implemented; confirming just books. There is no email provider, so no email verification or password reset.

## Deployment
- Render web service `skybook` (Docker, free plan, Singapore): https://skybook-3faz.onrender.com, dashboard
  https://dashboard.render.com/web/srv-dbf396gae00c73ek7qpg. **Every push to `main` of `eavinash83/ailearnprojects` redeploys it.**
  Free instances sleep after 15 minutes idle (about 1 minute to wake).
- CI/CD: `.github/workflows/ci-cd.yml` runs verify (install, `node --check`, build, `docker build`) on every push/PR and, on `main`, runs
  `scripts/render.mjs deploy` (Render API: trigger, wait for live, read-only smoke checks). It needs GitHub secrets `RENDER_API_KEY` and
  `RENDER_SERVICE_ID`; until they are set the deploy job fails on purpose and Render's own auto-deploy is still what ships. After adding them run
  `npm run render:autodeploy -- off` (never before). Roll back: run the workflow manually with a commit SHA.
- `DATABASE_URL` and `BETTER_AUTH_SECRET` are Render env vars (never in git). The service was created through the Render API, so
  `render.yaml` is not what drives it; keep the two in sync by hand. Set `BETTER_AUTH_URL` when attaching a custom domain.
- Git pushes from this machine use a repo-scoped deploy key (`~/.ssh/id_ed25519_skybook`, via `core.sshCommand`); the repo-local
  commit email is eavinash1983@gmail.com. The default cached GitHub credential is a different (work) account.
