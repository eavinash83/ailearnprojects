import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookingBody, makeFlight, newUser } from './helpers/factory.js';

test("another user's booking is invisible (404) and cannot be cancelled", async () => {
  const [alice, bob] = [await newUser('Alice'), await newUser('Bob')];
  const flight = await makeFlight();
  const b = (await alice.post('/api/bookings', bookingBody(flight))).body;

  assert.equal((await bob.get(`/api/bookings/${b.id}`)).status, 404);
  const cancel = await bob.post(`/api/bookings/${b.id}/cancel`);
  assert.equal(cancel.status, 404);
  assert.equal((await alice.get(`/api/bookings/${b.id}`)).body.status, 'Confirmed', 'victim booking untouched');
});

test('booking lists only contain the signed-in user’s bookings', async () => {
  const [alice, bob] = [await newUser(), await newUser()];
  const flight = await makeFlight({ economySeats: 10 });
  const a = (await alice.post('/api/bookings', bookingBody(flight))).body;
  const b = (await bob.post('/api/bookings', bookingBody(flight))).body;
  assert.deepEqual((await alice.get('/api/bookings')).body.map((x) => x.id), [a.id]);
  assert.deepEqual((await bob.get('/api/bookings')).body.map((x) => x.id), [b.id]);
});

test('a user cannot book on behalf of another user', async () => {
  const [alice, bob] = [await newUser(), await newUser()];
  const flight = await makeFlight();
  const r = await alice.post('/api/bookings', { ...bookingBody(flight), userId: bob.userId });
  assert.equal(r.status, 201);
  assert.equal((await bob.get('/api/bookings')).body.length, 0);
  assert.equal((await alice.get('/api/bookings')).body.length, 1);
});

test('after sign-out the revoked session token is rejected server-side', async () => {
  const u = await newUser();
  const flight = await makeFlight();
  const b = (await u.post('/api/bookings', bookingBody(flight))).body;
  const token = [...u.cookies].filter(([k]) => k.endsWith('session_token'));
  assert.ok(token.length, 'expected a session_token cookie');
  await u.post('/api/auth/sign-out');
  u.cookies = new Map(token); // replay only the DB-backed token (not the signed session cache cookie)
  assert.equal((await u.get('/api/bookings/' + b.id)).status, 401);
});

// KNOWN BEHAVIOUR (reported, not yet decided): session.cookieCache (server/auth.js, 5 min) lets a replayed full cookie set
// keep working for up to 5 minutes after sign-out. Remove the todo flag once cookieCache is disabled or accepted as a trade-off.
test('after sign-out a replayed full cookie set is rejected immediately', { todo: 'cookieCache keeps it valid for up to 5 minutes' }, async () => {
  const u = await newUser();
  const saved = new Map(u.cookies);
  await u.post('/api/auth/sign-out');
  u.cookies = saved;
  assert.equal((await u.get('/api/bookings')).status, 401);
});

test('tampered session cookie is rejected', async () => {
  const u = await newUser();
  for (const k of u.cookies.keys()) u.cookies.set(k, 'x' + u.cookies.get(k));
  assert.equal((await u.get('/api/bookings')).status, 401);
});
