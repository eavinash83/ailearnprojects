import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from './helpers/client.js';
import { PASSWORD, newUser } from './helpers/factory.js';

const email = () => `t-${Math.random().toString(16).slice(2)}@test.local`;

test('sign-up creates an account and a session cookie', async () => {
  const c = new Client();
  const e = email();
  const r = await c.post('/api/auth/sign-up/email', { email: e, password: PASSWORD, name: 'Ann Auth' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.email, e);
  assert.equal((await c.get('/api/bookings')).status, 200, 'session cookie should authorise booking routes');
});

test('duplicate email is rejected', async () => {
  const u = await newUser();
  const r = await new Client().post('/api/auth/sign-up/email', { email: u.email, password: PASSWORD, name: 'Dup' });
  assert.equal(r.status, 422);
});

test('invalid sign-up input is rejected', async () => {
  const cases = [
    { email: email(), password: 'short', name: 'x' }, // below minPasswordLength 8
    { email: 'not-an-email', password: PASSWORD, name: 'x' },
    { password: PASSWORD, name: 'x' },
  ];
  for (const body of cases) {
    const r = await new Client().post('/api/auth/sign-up/email', body);
    assert.ok(r.status >= 400 && r.status < 500, `expected 4xx for ${JSON.stringify(body)}, got ${r.status}`);
  }
});

test('sign-in works with the right password and fails with a wrong one', async () => {
  const u = await newUser();
  const ok = new Client();
  const good = await ok.post('/api/auth/sign-in/email', { email: u.email, password: PASSWORD });
  assert.equal(good.status, 200);
  assert.equal((await ok.get('/api/bookings')).status, 200);

  const bad = new Client();
  const r = await bad.post('/api/auth/sign-in/email', { email: u.email, password: 'Wrong-Password-1' });
  assert.equal(r.status, 401);
  assert.equal((await bad.get('/api/bookings')).status, 401);
});

test('sign-in with an unknown email fails', async () => {
  const r = await new Client().post('/api/auth/sign-in/email', { email: email(), password: PASSWORD });
  assert.equal(r.status, 401);
});

test('sign-out ends the session', async () => {
  const u = await newUser();
  assert.equal((await u.get('/api/bookings')).status, 200);
  assert.equal((await u.post('/api/auth/sign-out')).status, 200);
  assert.equal((await u.get('/api/bookings')).status, 401);
});

test('booking routes return 401 without a session', async () => {
  const c = new Client();
  assert.equal((await c.get('/api/bookings')).status, 401);
  assert.equal((await c.get('/api/bookings/anything')).status, 401);
  assert.equal((await c.post('/api/bookings', {})).status, 401);
  assert.equal((await c.post('/api/bookings/anything/cancel')).status, 401);
});

test('a signed-in state-changing request with a foreign Origin is refused (CSRF)', async () => {
  const u = await newUser();
  const r = await u.post('/api/auth/sign-out', {}, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal((await u.get('/api/bookings')).status, 200, 'session must survive the blocked request');
});

test('flight search and airports are public', async () => {
  const c = new Client();
  assert.equal((await c.get('/api/airports')).status, 200);
  assert.equal((await c.get('/api/flights?from=JFK&to=LAX&date=2030-01-01')).status, 200);
});
