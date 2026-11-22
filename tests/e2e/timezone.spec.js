import { makeFlight } from '../api/helpers/factory.js';
import { card, dayOffset, expect, searchUrl, test } from './fixtures.js';

// The browser is deliberately in UTC+14. Times must still show in each airport's own zone, and the search day is
// the origin-local calendar day.
test.use({ timezoneId: 'Pacific/Kiritimati' });

test('times show in airport zones and search uses the origin-local day', async ({ page, account }) => {
  const date = dayOffset(5);
  const flightNo = `E2E${Math.floor(Math.random() * 9000 + 1000)}`;
  // 23:30 in New York, 6h flight: lands 02:30 Pacific on the same Pacific calendar day (05:30 New York next day).
  const id = await makeFlight({ origin: 'JFK', destination: 'LAX', flightNo, departsAtLocal: `${date} 23:30`, minutes: 360 });

  // Sanity: the browser really is in another zone (04:30 UTC is 18:30 in Kiritimati).
  const browserLocal = await page.evaluate(() => new Date('2030-01-01T04:30:00Z').getHours());
  expect(browserLocal).toBe(18);

  await page.goto(searchUrl({ from: 'JFK', to: 'LAX', date }));
  const result = card(page, flightNo);
  await expect(result).toBeVisible();
  await expect(result).toContainText('11:30 PM');
  await expect(result).toContainText('2:30 AM');
  await expect(result).toContainText('6h 00m');

  // The previous / next origin-local days do not contain it.
  for (const other of [dayOffset(4), dayOffset(6)]) {
    await page.goto(searchUrl({ from: 'JFK', to: 'LAX', date: other }));
    await expect(page.getByRole('heading', { name: 'New York → Los Angeles' })).toBeVisible();
    await expect(page.locator('.skeleton')).toHaveCount(0);
    await expect(card(page, flightNo)).toHaveCount(0);
  }

  // Booking summary and the confirmed booking use the same airport times.
  await page.goto(`/book/${id}?cabin=economy&pax=1`);
  await expect(page.locator('.summary')).toContainText('11:30 PM → 2:30 AM');
  await page.getByRole('button', { name: /^Confirm/ }).click();
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
  await expect(page.getByText('11:30 PM JFK')).toBeVisible();
  await expect(page.getByText(/2:30 AM LAX/)).toBeVisible();
  await expect(page.getByText(/times are local to each airport/)).toBeVisible();

  await page.goto('/bookings');
  await expect(page.locator('.order-row').filter({ hasText: flightNo })).toContainText('11:30 PM');
});
