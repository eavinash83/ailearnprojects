// Postgres persistence on Neon via the official serverless driver.
// The Pool speaks the Postgres protocol over WebSockets, so it supports interactive transactions.
import crypto from 'node:crypto';
import { Pool } from '@neondatabase/serverless';
import { CABINS, DOMAIN, quote } from '../shared/domain.js';
import { HttpError } from './errors.js';
import { buildFlightRows } from './seed-flights.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and paste your Neon connection string.');
  process.exit(1);
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (err) => console.error('Idle database client error:', err.message));

// Seat inventory is per cabin on the flight row. createBooking locks the flight row (FOR UPDATE) and checks
// confirmed passengers against it, so concurrent bookings of the last seats serialise and cannot oversell.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS flights (
    id             text PRIMARY KEY,
    flight_no      text NOT NULL,
    airline        text NOT NULL,
    origin         text NOT NULL,
    destination    text NOT NULL,
    origin_tz      text NOT NULL,
    dest_tz        text NOT NULL,
    departs_at     timestamptz NOT NULL,
    arrives_at     timestamptz NOT NULL,
    aircraft       text NOT NULL,
    economy_price  numeric(10,2) NOT NULL CHECK (economy_price >= 0),
    business_price numeric(10,2) NOT NULL CHECK (business_price >= 0),
    economy_seats  integer NOT NULL CHECK (economy_seats >= 0),
    business_seats integer NOT NULL CHECK (business_seats >= 0),
    CHECK (arrives_at > departs_at),
    CHECK (origin <> destination)
  );
  CREATE INDEX IF NOT EXISTS flights_route_idx ON flights (origin, destination, departs_at);

  CREATE TABLE IF NOT EXISTS bookings (
    id             text PRIMARY KEY,
    user_id        text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, -- Better Auth user (migrateAuth() runs first)
    flight_id      text NOT NULL REFERENCES flights(id),
    flight_no      text NOT NULL,
    airline        text NOT NULL,
    origin         text NOT NULL,
    destination    text NOT NULL,
    origin_tz      text NOT NULL,
    dest_tz        text NOT NULL,
    departs_at     timestamptz NOT NULL,
    arrives_at     timestamptz NOT NULL,
    cabin          text NOT NULL CHECK (cabin IN ('economy', 'business')),
    passengers     jsonb NOT NULL,
    pax            integer NOT NULL CHECK (pax > 0),
    contact        jsonb NOT NULL,
    fare           numeric(10,2) NOT NULL,
    subtotal       numeric(10,2) NOT NULL,
    tax            numeric(10,2) NOT NULL,
    total          numeric(10,2) NOT NULL,
    status         text NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Confirmed', 'Cancelled')),
    created_at     timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (user_id, departs_at DESC);
  CREATE INDEX IF NOT EXISTS bookings_flight_idx ON bookings (flight_id) WHERE status = 'Confirmed';
`;

// numeric columns come back as strings from Postgres; cast to float8 so the API returns numbers.
// Seats left = capacity minus confirmed passengers in that cabin.
const FLIGHT_SELECT = `
  SELECT f.id, f.flight_no AS "flightNo", f.airline, f.origin, f.destination,
         f.origin_tz AS "originTz", f.dest_tz AS "destTz",
         f.departs_at AS "departsAt", f.arrives_at AS "arrivesAt",
         (extract(epoch FROM f.arrives_at - f.departs_at) / 60)::int AS minutes, f.aircraft,
         f.economy_price::float8 AS "economyPrice", f.business_price::float8 AS "businessPrice",
         (f.economy_seats - coalesce(u.economy, 0))::int AS "economyLeft",
         (f.business_seats - coalesce(u.business, 0))::int AS "businessLeft",
         (f.departs_at > now() + make_interval(hours => ${DOMAIN.closeBookingHours})) AS bookable
  FROM flights f
  LEFT JOIN (
    SELECT flight_id,
           sum(pax) FILTER (WHERE cabin = 'economy') AS economy,
           sum(pax) FILTER (WHERE cabin = 'business') AS business
    FROM bookings WHERE status = 'Confirmed' GROUP BY flight_id
  ) u ON u.flight_id = f.id`;

const BOOKING_SELECT = `
  SELECT id, flight_id AS "flightId", flight_no AS "flightNo", airline, origin, destination,
         origin_tz AS "originTz", dest_tz AS "destTz", departs_at AS "departsAt", arrives_at AS "arrivesAt",
         cabin, passengers, pax, contact, fare::float8 AS fare, subtotal::float8 AS subtotal,
         tax::float8 AS tax, total::float8 AS total, status, created_at AS "createdAt",
         (status = 'Confirmed' AND departs_at > now() + make_interval(hours => ${DOMAIN.cancelBeforeHours})) AS cancellable
  FROM bookings`;

const SORTS = {
  price: (cabin) => `"${cabin}Price" ASC, "departsAt"`,
  departure: () => '"departsAt" ASC',
  duration: () => 'minutes ASC, "departsAt"',
};

// Call migrateAuth() (server/auth.js) first: bookings reference the auth user table.
// Creates tables if needed and makes sure the schedule covers the sales window. Safe to run on every start.
export async function initDb() {
  await pool.query(SCHEMA);
  const rows = buildFlightRows();
  const col = (key) => rows.map((r) => r[key]);
  const { rowCount } = await pool.query(
    `INSERT INTO flights (id, flight_no, airline, origin, destination, origin_tz, dest_tz, departs_at, arrives_at,
                          aircraft, economy_price, business_price, economy_seats, business_seats)
     SELECT t.id, t.flight_no, t.airline, t.origin, t.destination, t.origin_tz, t.dest_tz,
            (t.local_date::date + t.local_time::time) AT TIME ZONE t.origin_tz,
            (t.local_date::date + t.local_time::time) AT TIME ZONE t.origin_tz + make_interval(mins => t.minutes),
            t.aircraft, t.economy_price, t.business_price, t.economy_seats, t.business_seats
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
                 $9::text[], $10::int[], $11::text[], $12::numeric[], $13::numeric[], $14::int[], $15::int[])
          AS t(id, flight_no, airline, origin, destination, origin_tz, dest_tz, local_date, local_time, minutes,
               aircraft, economy_price, business_price, economy_seats, business_seats)
     ON CONFLICT (id) DO NOTHING`,
    [col('id'), col('flightNo'), col('airline'), col('origin'), col('destination'), col('originTz'), col('destTz'),
     col('localDate'), col('localTime'), col('minutes'), col('aircraft'), col('economyPrice'), col('businessPrice'),
     col('economySeats'), col('businessSeats')],
  );
  if (rowCount) console.log(`Added ${rowCount} scheduled ${DOMAIN.resources}`);
}

// Bookable flights from `origin` to `destination` departing on a local calendar day at the origin airport.
// Only flights that still have `passengers` seats in `cabin` are marked `available`; sold-out ones are still listed.
export async function searchFlights({ origin, destination, date, cabin, passengers, sort }) {
  const { rows } = await pool.query(
    `SELECT * FROM (${FLIGHT_SELECT}) s
     WHERE origin = $1 AND destination = $2
       AND ("departsAt" AT TIME ZONE "originTz")::date = $3::date
       AND bookable
     ORDER BY ${(SORTS[sort] ?? SORTS.departure)(cabin)}`,
    [origin, destination, date],
  );
  return rows.map((f) => ({ ...f, available: f[`${cabin}Left`] >= passengers }));
}

export async function getFlight(id, db = pool) {
  const { rows } = await db.query(`${FLIGHT_SELECT} WHERE f.id = $1`, [id]);
  return rows[0] ?? null;
}

// Records a booking atomically. The fare comes from the flights table, never from the client, and seat
// availability is re-checked under a row lock on the flight.
export async function createBooking({ userId, flightId, cabin, passengers, contact }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: locked } = await client.query('SELECT id FROM flights WHERE id = $1 FOR UPDATE', [flightId]);
    if (!locked[0]) throw new HttpError(404, 'Flight not found');
    const flight = await getFlight(flightId, client); // seat counts are consistent now: concurrent bookers wait on the lock

    if (!flight.bookable) throw new HttpError(409, 'This flight is no longer open for booking');
    const left = flight[`${cabin}Left`];
    if (left < passengers.length) {
      throw new HttpError(409, left > 0 ? `Only ${left} ${CABINS[cabin].label} seat${left === 1 ? '' : 's'} left on this flight` : `${CABINS[cabin].label} is sold out on this flight`);
    }

    const fare = flight[`${cabin}Price`];
    const price = quote(fare, passengers.length);
    const id = `SB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    await client.query(
      `INSERT INTO bookings (id, user_id, flight_id, flight_no, airline, origin, destination, origin_tz, dest_tz,
                             departs_at, arrives_at, cabin, passengers, pax, contact, fare, subtotal, tax, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [id, userId, flight.id, flight.flightNo, flight.airline, flight.origin, flight.destination, flight.originTz,
       flight.destTz, flight.departsAt, flight.arrivesAt, cabin, JSON.stringify(passengers), passengers.length,
       JSON.stringify(contact), fare, price.subtotal, price.tax, price.total],
    );

    await client.query('COMMIT');
    return getBooking(id, userId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function listBookings(userId) {
  const { rows } = await pool.query(`${BOOKING_SELECT} WHERE user_id = $1 ORDER BY departs_at DESC`, [userId]);
  return rows;
}

export async function getBooking(id, userId) {
  const { rows } = await pool.query(`${BOOKING_SELECT} WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] ?? null;
}

export async function cancelBooking(id, userId) {
  const { rowCount } = await pool.query(
    `UPDATE bookings SET status = 'Cancelled'
     WHERE id = $1 AND user_id = $2 AND status = 'Confirmed'
       AND departs_at > now() + make_interval(hours => ${DOMAIN.cancelBeforeHours})`,
    [id, userId],
  );
  if (rowCount === 0) {
    const existing = await getBooking(id, userId);
    if (!existing) throw new HttpError(404, 'Booking not found');
    if (existing.status === 'Cancelled') throw new HttpError(409, 'This booking is already cancelled');
    throw new HttpError(409, `This booking can no longer be cancelled (changes close ${DOMAIN.cancelBeforeHours} hours before departure)`);
  }
  return getBooking(id, userId);
}
