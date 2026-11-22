import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookingBody, makeFlight, newUser, pool } from './helpers/factory.js';

const book = async (user, opts) => (await user.post('/api/bookings', bookingBody(await makeFlight(opts)))).body;

test('cancelling more than 24h before departure works', async () => {
  const u = await newUser();
  const b = await book(u, { hoursFromNow: 48 });
  assert.equal(b.cancellable, true);
  const r = await u.post(`/api/bookings/${b.id}/cancel`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'Cancelled');
  assert.equal(r.body.cancellable, false);
  assert.equal((await u.get(`/api/bookings/${b.id}`)).body.status, 'Cancelled');
});

test('cancelled bookings stay in the list with status Cancelled', async () => {
  const u = await newUser();
  const b = await book(u, { hoursFromNow: 48 });
  await u.post(`/api/bookings/${b.id}/cancel`);
  const row = (await u.get('/api/bookings')).body.find((x) => x.id === b.id);
  assert.equal(row.status, 'Cancelled');
});

test('cancelling within 24h of departure is rejected', async () => {
  const u = await newUser();
  const b = await book(u, { hoursFromNow: 12 });
  assert.equal(b.cancellable, false);
  const r = await u.post(`/api/bookings/${b.id}/cancel`);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /can no longer be cancelled/);
  assert.equal((await u.get(`/api/bookings/${b.id}`)).body.status, 'Confirmed');
});

test('cancelling twice returns 409 the second time', async () => {
  const u = await newUser();
  const b = await book(u, { hoursFromNow: 48 });
  assert.equal((await u.post(`/api/bookings/${b.id}/cancel`)).status, 200);
  const again = await u.post(`/api/bookings/${b.id}/cancel`);
  assert.equal(again.status, 409);
  assert.match(again.body.error, /already cancelled/);
});

test('cancelling an unknown booking is 404', async () => {
  assert.equal((await (await newUser()).post('/api/bookings/SB-NOPE/cancel')).status, 404);
});

test('concurrent cancels: exactly one succeeds', async () => {
  const u = await newUser();
  const b = await book(u, { hoursFromNow: 48 });
  const rs = await Promise.all([1, 2, 3].map(() => u.post(`/api/bookings/${b.id}/cancel`)));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 2);
});

test('boundary: cancellable flag flips at 24h', async () => {
  const u = await newUser();
  const justOver = await book(u, { hoursFromNow: 24.5 });
  const justUnder = await book(u, { hoursFromNow: 23.5 });
  assert.equal(justOver.cancellable, true);
  assert.equal(justUnder.cancellable, false);
});

test('a booking that was cancellable becomes un-cancellable as departure approaches', async () => {
  const u = await newUser();
  const b = await book(u, { hoursFromNow: 48 });
  await pool.query(`UPDATE flights SET departs_at = now() + interval '10 hours', arrives_at = now() + interval '16 hours' WHERE id = $1`, [b.flightId]);
  await pool.query(`UPDATE bookings SET departs_at = now() + interval '10 hours' WHERE id = $1`, [b.id]);
  assert.equal((await u.post(`/api/bookings/${b.id}/cancel`)).status, 409);
});
