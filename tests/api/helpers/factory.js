// Test data: users via the real sign-up endpoint, flights via SQL (so tests control seats and departure times).
import crypto from 'node:crypto';
import { Pool } from '@neondatabase/serverless';
import { airport } from '../../../shared/domain.js';
import { Client } from './client.js';
import { checkTestDatabase } from './guard.js';

checkTestDatabase(process.env.DATABASE_URL);
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Neon closes idle sockets; an unhandled 'error' event would crash the test process.
pool.on('error', () => {});
export const PASSWORD = 'Test-Password-123';
const uid = () => crypto.randomBytes(5).toString('hex');

/** A signed-in Client with its own brand-new account. */
export async function newUser(name = 'Test User') {
  const email = `t-${uid()}@test.local`;
  const c = new Client();
  const res = await c.post('/api/auth/sign-up/email', { email, password: PASSWORD, name });
  if (res.status !== 200) throw new Error(`sign-up failed ${res.status}: ${res.text}`);
  c.email = email;
  c.userId = res.body.user.id;
  return c;
}

/**
 * Inserts a private flight (id prefix T- so cleanup finds it).
 * Defaults: JFK->LAX, departs in 72h, 4 economy / 2 business seats, $100 / $300.
 * Use `hoursFromNow` to exercise the booking (2h) and cancellation (24h) cutoffs.
 */
export async function makeFlight({
  origin = 'JFK', destination = 'LAX', hoursFromNow = 72, economySeats = 4, businessSeats = 2,
  economyPrice = 100, businessPrice = 300, minutes = 360, departsAtLocal = null,
  flightNo = `TT${Math.floor(Math.random() * 900 + 100)}`,
} = {}) {
  const id = `T-${uid()}`;
  const [o, d] = [airport(origin), airport(destination)];
  // departsAtLocal: 'YYYY-MM-DD HH:MM' in the origin airport's zone (fixed departure); otherwise relative to now.
  const dep = departsAtLocal ? '($7::timestamp AT TIME ZONE $5)' : "(now() + $7::float8 * interval '1 hour')";
  await pool.query(
    `INSERT INTO flights (id, flight_no, airline, origin, destination, origin_tz, dest_tz, departs_at, arrives_at, aircraft,
                          economy_price, business_price, economy_seats, business_seats)
     VALUES ($1, $2, 'Test Air', $3, $4, $5, $6,
             ${dep},
             ${dep} + $8::float8 * interval '1 minute',
             'B737', $9, $10, $11, $12)`,
    [id, flightNo, origin, destination, o.tz, d.tz, departsAtLocal ?? hoursFromNow, minutes,
      economyPrice, businessPrice, economySeats, businessSeats],
  );
  return id;
}

/** departs_at / arrives_at (ISO strings) of a flight row. */
export async function flightTimes(flightId) {
  const { rows } = await pool.query(`SELECT departs_at, arrives_at FROM flights WHERE id = $1`, [flightId]);
  return { departsAt: rows[0].departs_at.toISOString(), arrivesAt: rows[0].arrives_at.toISOString() };
}

/** Local calendar date (YYYY-MM-DD) at the origin airport, for search tests. */
export async function originDate(flightId) {
  const { rows } = await pool.query(
    `SELECT to_char(departs_at AT TIME ZONE origin_tz, 'YYYY-MM-DD') AS d FROM flights WHERE id = $1`, [flightId]);
  return rows[0].d;
}

export const passengers = (n = 1) => Array.from({ length: n }, (_, i) => ({ firstName: `Pat${i + 1}`, lastName: 'Tester' }));
export const bookingBody = (flightId, { cabin = 'economy', pax = 1, ...rest } = {}) => ({
  flightId, cabin, passengers: passengers(pax), contact: { email: 'pat@test.local', phone: '555-0100' }, ...rest,
});

/** Confirmed passengers on a flight/cabin straight from the DB (ground truth for capacity tests). */
export async function confirmedPax(flightId, cabin) {
  const { rows } = await pool.query(
    `SELECT coalesce(sum(pax), 0)::int AS n FROM bookings WHERE flight_id = $1 AND cabin = $2 AND status = 'Confirmed'`,
    [flightId, cabin]);
  return rows[0].n;
}

/** Removes everything the tests created (users cascade to their bookings; then test flights). */
export async function cleanup() {
  await pool.query(`DELETE FROM "user" WHERE email LIKE 't-%@test.local'`);
  await pool.query(`DELETE FROM flights WHERE id LIKE 'T-%'`);
  await pool.end();
}
