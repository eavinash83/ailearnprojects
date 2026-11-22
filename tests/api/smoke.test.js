import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from './helpers/client.js';
import { newUser } from './helpers/factory.js';

test('server is healthy and connected to the test database', async () => {
  const r = await new Client().get('/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, db: 'up' });
});

test('bookings need a session; a new user can sign up and then list bookings', async () => {
  assert.equal((await new Client().get('/api/bookings')).status, 401);
  const user = await newUser();
  const r = await user.get('/api/bookings');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, []);
});
