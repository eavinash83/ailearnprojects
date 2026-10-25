# SkyBook

Airline booking app: search nonstop flights (origin, destination, date, cabin, passengers), pick one, enter
passenger names, confirm, view and cancel bookings. One Node process serves `/api` (Express 5) and the React
(Vite) app. Data lives in Neon Postgres. Airlines and flights are fictional.

## Commands
- `npm run dev` : server + Vite middleware on :3000. **No auto-restart** (`node --watch` loops on Windows because
  of Vite's `.vite/deps_temp_*` writes); restart manually after editing `server/` or `shared/`.
- `npm run build` / `npm start` / `npm run prod`
- `npm run db:reset` : DROPS `bookings` and `flights`, recreates and re-seeds. Dev only.
- No tests or linter. Verify with `npm run build`, `node --check server/*.js shared/*.js`, curl against `/api`.
- Needs Node 22+ (`--env-file-if-exists`). Here Node 24 is portable at `%USERPROFILE%\tools\node-v24.22.0-win-x64`.

## Architecture
`src/services/api.js` -> `server/api.js` (routing + request-shape validation) -> `server/db.js` (all SQL).
Rules shared by both sides live in `shared/domain.js` (airports, cabins, limits, `quote()`).
`server/seed-flights.js` generates the schedule; `initDb()` inserts missing departures at every start
(deterministic ids, `ON CONFLICT DO NOTHING`), so the 60-day window rolls forward.

## Invariants
- Server-authoritative: client sends flight id, cabin, passenger names, contact. Fare comes from `flights`;
  seats are re-checked inside the transaction.
- **Overselling is prevented by a row lock**: `createBooking` does `SELECT ... FOR UPDATE` on the flight, then
  counts confirmed passengers per cabin. Seats left = capacity - sum(pax) of Confirmed bookings, so cancelling
  frees seats automatically. Sold out -> 409.
- Times are `timestamptz`. Display uses the **airport's** zone (`originTz`/`destTz` on flights and bookings), never
  the browser's. Search day = origin-local calendar day (`departs_at AT TIME ZONE origin_tz`).
- `numeric` is cast to `float8` in every SELECT.
- Bookings snapshot flight number, airline, route, times and per-passenger fare.
- Windows: no new bookings within `closeBookingHours` (2) of departure; cancellation until `cancelBeforeHours` (24).
- Auth is Better Auth (email + password, cookie sessions, tables in the same Postgres). `server/auth.js` exports
  `auth` and `migrateAuth()`; `migrateAuth()` runs before `initDb()` on every start because `bookings.user_id`
  references the auth `"user"(id)`. `/api/auth/*splat` is mounted in `server/index.js` before `express.json()`.
  Flight search is public; all `/api/bookings` routes need a session (`requireUser`, 401 otherwise) and are scoped
  by `req.user.id`. Other people's bookings return 404. Never take a user id from the client.
- `HttpError(status, msg)` anywhere; the central handler masks 5xx.
- Client: `authClient.useSession()`, `RequireAuth` route guard (redirects to `/login?next=`), `AuthPage`. Sign-out clears
  remembered contact details. The booking form pre-fills email and passenger 1 from the account.
- Search state (`?from=&to=&date=&cabin=&pax=&sort=`) and booking state (`?cabin=&pax=`) live in the URL.

## Gotchas
- Schema is `CREATE TABLE IF NOT EXISTS`; changing a column on an existing DB needs a manual `ALTER` or `db:reset`.
- Payments are not implemented; the confirm step just books. Do not add card fields without a provider.
- `.env` needs `DATABASE_URL` and `BETTER_AUTH_SECRET` (32+ chars; `BETTER_AUTH_URL` is required in production). Auth
  tables survive `db:reset`. No email provider yet: no verification or password reset.
- `.env` holds the real Neon string; it is git-ignored and docker-ignored. Never commit it.

## Next steps
Email verification + password reset (needs an email provider), migrations (node-pg-migrate/Drizzle),
payments + email confirmations (after COMMIT, never inside the transaction), seat maps, round trips.
