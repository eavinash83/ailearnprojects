import { Router } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { AIRPORTS, CABINS, DOMAIN, isCabin } from '../shared/domain.js';
import { auth } from './auth.js';
import * as db from './db.js';
import { HttpError } from './errors.js';

const router = Router();

// Every booking route needs a signed-in user (Better Auth session cookie). Flight search stays public.
async function requireUser(req, res, next) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) throw new HttpError(401, 'Please sign in');
  req.user = session.user;
  next();
}

const isAirport = (code) => AIRPORTS.some((a) => a.code === code);

router.get('/health', async (req, res) => {
  await db.pool.query('SELECT 1');
  res.json({ ok: true, db: 'up' });
});

router.get('/airports', (req, res) => res.json(AIRPORTS));

router.get('/flights', async (req, res) => {
  const origin = String(req.query.from ?? '').toUpperCase();
  const destination = String(req.query.to ?? '').toUpperCase();
  const date = String(req.query.date ?? '');
  const cabin = String(req.query.cabin ?? 'economy');
  const passengers = Number(req.query.passengers ?? 1);
  if (!isAirport(origin) || !isAirport(destination)) throw new HttpError(400, 'Choose a valid origin and destination');
  if (origin === destination) throw new HttpError(400, 'Origin and destination must differ');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new HttpError(400, 'date must be YYYY-MM-DD');
  if (!isCabin(cabin)) throw new HttpError(400, 'Unknown cabin');
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > DOMAIN.maxPassengers) {
    throw new HttpError(400, `Passengers must be between 1 and ${DOMAIN.maxPassengers}`);
  }
  res.json(await db.searchFlights({ origin, destination, date, cabin, passengers, sort: String(req.query.sort ?? '') }));
});

router.get('/flights/:id', async (req, res) => {
  const flight = await db.getFlight(req.params.id);
  if (!flight) throw new HttpError(404, 'Flight not found');
  res.json(flight);
});

// Shape checks only; price and seat availability are resolved inside the database transaction.
function validateBooking(body) {
  const { flightId, cabin, passengers: list, contact: c } = body ?? {};
  if (typeof flightId !== 'string' || !flightId) throw new HttpError(400, 'Flight is required');
  if (typeof cabin !== 'string' || !isCabin(cabin)) throw new HttpError(400, `Cabin must be one of: ${Object.keys(CABINS).join(', ')}`);
  if (!Array.isArray(list) || list.length < 1 || list.length > DOMAIN.maxPassengers) {
    throw new HttpError(400, `Between 1 and ${DOMAIN.maxPassengers} passengers are required`);
  }
  const passengers = list.map((p, i) => {
    const firstName = String(p?.firstName ?? '').trim().slice(0, 60);
    const lastName = String(p?.lastName ?? '').trim().slice(0, 60);
    if (!firstName || !lastName) throw new HttpError(400, `Passenger ${i + 1}: first and last name are required`);
    return { firstName, lastName };
  });
  if (!c || typeof c !== 'object') throw new HttpError(400, 'Contact details are required');
  const email = String(c.email ?? '').trim().slice(0, 200);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'A valid email address is required');
  const contact = { email, phone: String(c.phone ?? '').trim().slice(0, 40) };
  return { flightId, cabin, passengers, contact };
}

router.use('/bookings', requireUser);

router.post('/bookings', async (req, res) => {
  const booking = await db.createBooking({ userId: req.user.id, ...validateBooking(req.body) });
  res.status(201).json(booking);
});

router.get('/bookings', async (req, res) => {
  res.json(await db.listBookings(req.user.id));
});

router.get('/bookings/:id', async (req, res) => {
  const booking = await db.getBooking(req.params.id, req.user.id);
  if (!booking) throw new HttpError(404, 'Booking not found');
  res.json(booking);
});

router.post('/bookings/:id/cancel', async (req, res) => {
  res.json(await db.cancelBooking(req.params.id, req.user.id));
});

router.use((req, res) => res.status(404).json({ error: 'Not found' }));

export default router;
