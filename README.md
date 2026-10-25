# SkyBook

Find and book flights in seconds. A React + Vite frontend served by a Node.js + Express backend as **one application**: a single
Node process serves the JSON API under `/api` and the React app on every other URL.

## Run it

Requires Node.js 22+ and a [Neon](https://neon.tech) Postgres database (the free tier is enough).

```bash
npm install
cp .env.example .env   # then set DATABASE_URL (Neon) and BETTER_AUTH_SECRET (command is in the file)
npm run dev            # http://localhost:3000, with hot reload
```

On first start the server creates its tables and schedules about 5,000 fictional flights for the next 60 days (topped up on every start). After changing files under `server/`
or `shared/`, stop and restart `npm run dev` (there is deliberately no auto-restart).

```bash
npm run build   # compile the React app into dist/
npm start       # serve API + dist/ on PORT (default 3000)
npm run db:reset  # DROPS all tables (all bookings) and re-seeds - dev only
```

| Env var        | Default    | Purpose                         |
| -------------- | ---------- | ------------------------------- |
| `DATABASE_URL` | (required) | Neon Postgres connection string |
| `BETTER_AUTH_SECRET` | (required) | 32+ char random string for signing sessions |
| `BETTER_AUTH_URL` | `http://localhost:PORT` (required in production) | Public origin of the app |
| `PORT`         | `3000`     | HTTP port                       |

## API

| Method | Path                      | Notes |
| ------ | ------------------------- | ----- |
| GET    | `/api/health`             | `{ ok: true, db: 'up' }` |
| POST   | `/api/auth/sign-up/email`, `/api/auth/sign-in/email`, `/api/auth/sign-out` | [Better Auth](https://www.better-auth.com) endpoints (cookie session) |
| GET    | `/api/airports`           | Airport list (code, city, tz) |
| GET    | `/api/flights`            | Query: `from`, `to` (IATA), `date=YYYY-MM-DD` (origin-local day), `cabin`, `passengers`, `sort=departure|price|duration`. Each flight has seats left per cabin and `available`. |
| GET    | `/api/flights/:id`        | 404 if missing |
| POST   | `/api/bookings`           | `{ flightId, cabin, passengers:[{firstName,lastName}], contact:{email,phone} }`. Server prices it and checks seats; 409 if sold out. |
| GET    | `/api/bookings`           | The signed-in user's bookings (401 if signed out) |
| GET    | `/api/bookings/:id`       | 404 if not the caller's |
| POST   | `/api/bookings/:id/cancel` | 409 within 24 h of departure |

## Deploy

```bash
docker build -t skybook .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://..." \
  -e BETTER_AUTH_SECRET="..." -e BETTER_AUTH_URL="https://your-domain" skybook
```

Business rules (passenger limit, booking/cancel windows, taxes, airports) live in `shared/domain.js`. Overselling is
prevented by locking the flight row inside the booking transaction, so concurrent requests can never exceed capacity.
