import { bookingBody, confirmedPax, makeFlight, newUser, PASSWORD } from '../api/helpers/factory.js';
import { expect, test } from './fixtures.js';

test('someone else takes the last seat while you fill in the form: clear error, nothing booked', async ({ page, account }) => {
  const id = await makeFlight({ economySeats: 1 });
  await page.goto(`/book/${id}?cabin=economy&pax=1`);
  await expect(page.getByRole('group', { name: 'Passenger 1' }).getByLabel('First name')).toHaveValue('Ada');

  const rival = await newUser();
  expect((await rival.post('/api/bookings', bookingBody(id))).status).toBe(201);

  await page.getByRole('button', { name: /^Confirm/ }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/sold out/i);
  await expect(alert.getByRole('link', { name: 'Back to results' })).toBeVisible();
  await expect(page).toHaveURL(/\/book\//);
  expect(await confirmedPax(id, 'economy')).toBe(1); // only the rival's booking
  await expect(page.getByRole('button', { name: /^Confirm/ })).toBeEnabled(); // form usable again
});

test('booking page validates names and email before submitting', async ({ page, account }) => {
  const id = await makeFlight();
  await page.goto(`/book/${id}?cabin=economy&pax=2`);
  const p1 = page.getByRole('group', { name: 'Passenger 1' });
  await expect(p1.getByLabel('First name')).toHaveValue('Ada');

  await p1.getByLabel('First name').fill('');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByRole('button', { name: /^Confirm/ }).click();

  await expect(page.getByText('First name is required')).toHaveCount(2); // passenger 1 (cleared) and passenger 2
  await expect(page.getByText('Last name is required')).toHaveCount(1); // passenger 2 only
  await expect(page.getByText('Enter a valid email')).toBeVisible();
  await expect(page).toHaveURL(/\/book\//);
  expect(await confirmedPax(id, 'economy')).toBe(0);
});

test('flights inside the 2-hour window cannot be booked even with a direct link', async ({ page, account }) => {
  const id = await makeFlight({ hoursFromNow: 1 });
  await page.goto(`/book/${id}?cabin=economy&pax=1`);
  await page.getByRole('button', { name: /^Confirm/ }).click();
  await expect(page.getByRole('alert')).toContainText(/no longer open for booking/i);
  expect(await confirmedPax(id, 'economy')).toBe(0);
});

test('invalid booking links send the user back home', async ({ page, account }) => {
  const id = await makeFlight();
  for (const url of [
    `/book/${id}?cabin=first&pax=1`,
    `/book/${id}?cabin=economy&pax=9`,
    `/book/${id}?cabin=economy&pax=0`,
    `/book/${id}`, // no cabin / pax at all
    '/book/does-not-exist?cabin=economy&pax=1',
  ]) {
    await page.goto(url);
    await expect(page, url).toHaveURL(/\/$/);
  }
});

test('a booking link opened while signed out goes through sign-in and lands on the booking page', async ({ page }) => {
  const id = await makeFlight();
  const u = await newUser();
  await page.goto(`/book/${id}?cabin=economy&pax=1`);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/book/${id}\\?cabin=economy&pax=1`));
  await expect(page.getByRole('heading', { name: 'Confirm your booking' })).toBeVisible();
});

test('unknown routes show the not-found page', async ({ page }) => {
  await page.goto('/this/does/not/exist');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go home' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("another user's booking page says 'Booking not found'", async ({ page, account }) => {
  const owner = await newUser();
  const flight = await makeFlight();
  const b = (await owner.post('/api/bookings', bookingBody(flight))).body;
  await page.goto(`/bookings/${b.id}`);
  await expect(page.getByRole('heading', { name: 'Booking not found' })).toBeVisible();
});

test('bookings inside 24h of departure show no cancel button', async ({ page, account }) => {
  const flight = await makeFlight({ hoursFromNow: 12 });
  await page.goto(`/book/${flight}?cabin=economy&pax=1`);
  await page.getByRole('button', { name: /^Confirm/ }).click();
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0);
  await expect(page.getByText('Changes close 24 hours before departure.')).toBeVisible();
});

test('My Bookings starts empty for a new account', async ({ page, account }) => {
  await page.goto('/bookings');
  await expect(page.getByRole('heading', { name: 'No bookings yet' })).toBeVisible();
  await page.getByRole('link', { name: 'Search flights' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('the API failing during search shows an error state, not a blank page', async ({ page }) => {
  await page.route('**/api/flights?*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal server error"}' }));
  await page.goto('/?from=JFK&to=LAX&date=2030-01-01&cabin=economy&pax=1');
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
});

test('the previous user’s contact details are cleared on sign out', async ({ page, account }) => {
  const id = await makeFlight();
  await page.goto(`/book/${id}?cabin=economy&pax=1`);
  await page.getByLabel('Phone (optional)').fill('555-7777');
  await page.getByRole('button', { name: /^Confirm/ }).click();
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

  const second = await newUser('Second Person');
  await page.goto('/login');
  await page.getByLabel('Email').fill(second.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Second Person')).toBeVisible();
  await page.goto(`/book/${id}?cabin=economy&pax=1`);
  await expect(page.getByLabel('Email')).toHaveValue(second.email);
  await expect(page.getByLabel('Phone (optional)')).toHaveValue('');
});
