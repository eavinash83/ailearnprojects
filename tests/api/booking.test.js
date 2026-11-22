import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOMAIN, quote } from '../../shared/domain.js';
import { bookingBody, makeFlight, newUser, pool } from './helpers/factory.js';

test('happy path: books, computes the price on the server and snapshots the flight', async () => {
  const id = await makeFlight({ economyPrice: 120.5, economySeats: 5 });
  const u = await newUser();
  const r = await u.post('/api/bookings', bookingBody(id, { pax: 3 }));
  assert.equal(r.status, 201);
  const b = r.body;
  assert.match(b.id, /^SB-/);
  assert.equal(b.status, 'Confirmed');
  assert.equal(b.pax, 3);
  assert.equal(b.fare, 120.5);
  const q = quote(120.5, 3);
  assert.deepEqual([b.subtotal, b.tax, b.total], [q.subtotal, q.tax, q.total]);
  assert.equal(b.cancellable, true);
  assert.equal(b.origin, 'JFK');
  assert.equal(b.destination, 'LAX');
  assert.equal(b.originTz, 'America/New_York');
  assert.equal(b.destTz, 'America/Los_Angeles');
  assert.equal(b.airline, 'Test Air');
  assert.deepEqual(b.passengers.map((p) => p.firstName), ['Pat1', 'Pat2', 'Pat3']);

  const got = await u.get(`/api/bookings/${b.id}`);
  assert.equal(got.status, 200);
  assert.equal(got.body.id, b.id);
  assert.ok((await u.get('/api/bookings')).body.some((x) => x.id === b.id));
});

test('business cabin uses the business fare', async () => {
  const id = await makeFlight({ businessPrice: 410 });
  const r = await (await newUser()).post('/api/bookings', bookingBody(id, { cabin: 'business', pax: 2 }));
  assert.equal(r.status, 201);
  assert.equal(r.body.fare, 410);
  assert.equal(r.body.total, quote(410, 2).total);
});

test('snapshot: later fare changes do not alter an existing booking', async () => {
  const id = await makeFlight({ economyPrice: 100 });
  const u = await newUser();
  const b = (await u.post('/api/bookings', bookingBody(id))).body;
  await pool.query('UPDATE flights SET economy_price = 999 WHERE id = $1', [id]);
  const again = (await u.get(`/api/bookings/${b.id}`)).body;
  assert.equal(again.fare, 100);
  assert.equal(again.total, b.total);
});

test('client-supplied prices are ignored', async () => {
  const id = await makeFlight({ economyPrice: 100 });
  const body = { ...bookingBody(id), fare: 1, total: 1, subtotal: 1, tax: 0, status: 'Cancelled', userId: 'someone-else', passengers: bookingBody(id).passengers.map((p) => ({ ...p, fare: 0 })) };
  const r = await (await newUser()).post('/api/bookings', body);
  assert.equal(r.status, 201);
  assert.equal(r.body.fare, 100);
  assert.equal(r.body.total, quote(100, 1).total);
  assert.equal(r.body.status, 'Confirmed');
});

test('passenger count limits: 1..max accepted, 0 and max+1 rejected', async () => {
  const id = await makeFlight({ economySeats: 20 });
  const u = await newUser();
  assert.equal((await u.post('/api/bookings', bookingBody(id, { pax: DOMAIN.maxPassengers }))).status, 201);
  assert.equal((await u.post('/api/bookings', bookingBody(id, { pax: DOMAIN.maxPassengers + 1 }))).status, 400);
  assert.equal((await u.post('/api/bookings', bookingBody(id, { pax: 0 }))).status, 400);
});

test('validation: malformed bookings return 400 and create nothing', async () => {
  const id = await makeFlight();
  const u = await newUser();
  const ok = bookingBody(id);
  const cases = {
    'no flightId': { ...ok, flightId: undefined },
    'numeric flightId': { ...ok, flightId: 5 },
    'unknown cabin': { ...ok, cabin: 'first' },
    'passengers not an array': { ...ok, passengers: 'Pat' },
    'blank first name': { ...ok, passengers: [{ firstName: '  ', lastName: 'X' }] },
    'blank last name': { ...ok, passengers: [{ firstName: 'X', lastName: '' }] },
    'passenger null': { ...ok, passengers: [null] },
    'no contact': { ...ok, contact: undefined },
    'bad contact email': { ...ok, contact: { email: 'nope' } },
    'empty body': {},
  };
  for (const [name, body] of Object.entries(cases)) {
    assert.equal((await u.post('/api/bookings', body)).status, 400, name);
  }
  assert.deepEqual((await u.get('/api/bookings')).body, []);
});

test('names are trimmed and phone is optional', async () => {
  const id = await makeFlight();
  const r = await (await newUser()).post('/api/bookings', {
    flightId: id, cabin: 'economy',
    passengers: [{ firstName: '  Ada ', lastName: ' Lovelace  ' }],
    contact: { email: 'ada@test.local' },
  });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.passengers[0], { firstName: 'Ada', lastName: 'Lovelace' });
});

test('unknown flight is 404', async () => {
  const r = await (await newUser()).post('/api/bookings', bookingBody('does-not-exist'));
  assert.equal(r.status, 404);
});

test('flights close for booking 2h before departure', async () => {
  const closed = await makeFlight({ hoursFromNow: 1 });
  const open = await makeFlight({ hoursFromNow: 3 });
  const u = await newUser();
  assert.equal((await u.post('/api/bookings', bookingBody(closed))).status, 409);
  assert.equal((await u.post('/api/bookings', bookingBody(open))).status, 201);
});

test('GET /flights/:id returns the flight, 404 for unknown', async () => {
  const id = await makeFlight();
  const u = await newUser();
  const r = await u.get(`/api/flights/${id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.economyLeft, 4);
  assert.equal(r.body.businessLeft, 2);
  assert.equal((await u.get('/api/flights/nope')).status, 404);
});

test('server errors never leak internals (unknown API route is a clean 404)', async () => {
  const r = await (await newUser()).get('/api/does-not-exist');
  assert.equal(r.status, 404);
  assert.deepEqual(r.body, { error: 'Not found' });
});
