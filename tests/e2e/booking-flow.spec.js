import { confirmedPax, makeFlight, originDate } from '../api/helpers/factory.js';
import { airportSelect, card, expect, priceText, test } from './fixtures.js';

test('full journey: search, select, enter passengers, confirm, view, cancel', async ({ page, account }) => {
  test.slow();
  const flightNo = `E2E${Math.floor(Math.random() * 9000 + 1000)}`;
  const id = await makeFlight({ flightNo, economyPrice: 150, economySeats: 4 });
  const date = await originDate(id);

  // Search through the form.
  await page.goto('/');
  await airportSelect(page, 'From').selectOption('JFK');
  await airportSelect(page, 'To').selectOption('LAX');
  await page.getByLabel('Departure').fill(date);
  await page.getByLabel('Passengers').selectOption('2');
  await page.getByRole('button', { name: 'Search flights' }).click();

  await expect(page).toHaveURL(new RegExp(`from=JFK.*to=LAX.*date=${date}.*cabin=economy.*pax=2`));
  const result = card(page, flightNo);
  await expect(result).toBeVisible();
  await expect(result).toContainText('$150.00');
  await expect(result).toContainText('Test Air');
  await result.getByRole('link', { name: 'Select' }).click();

  // Passenger form: first passenger prefilled from the account, the rest empty.
  await expect(page.getByRole('heading', { name: 'Confirm your booking' })).toBeVisible();
  const p1 = page.getByRole('group', { name: 'Passenger 1' });
  const p2 = page.getByRole('group', { name: 'Passenger 2' });
  await expect(p1.getByLabel('First name')).toHaveValue('Ada');
  await expect(p1.getByLabel('Last name')).toHaveValue('Lovelace');
  await expect(page.getByLabel('Email')).toHaveValue(account.email);
  await p2.getByLabel('First name').fill('Charles');
  await p2.getByLabel('Last name').fill('Babbage');
  await page.getByLabel('Phone (optional)').fill('555-0101');

  // The summary shows the server-quoted total.
  const total = priceText(150, 2);
  await expect(page.locator('.summary')).toContainText(total);
  await page.getByRole('button', { name: `Confirm · ${total}` }).click();

  // Confirmation.
  await expect(page).toHaveURL(/\/bookings\/SB-.*placed=1/);
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
  const code = (await page.url().match(/\/bookings\/(SB-[^?]+)/))[1];
  await expect(page.getByText(`Confirmation code ${code}`)).toBeVisible();
  await expect(page.locator('.pax-list').getByText('Ada Lovelace')).toBeVisible();
  await expect(page.locator('.pax-list').getByText('Charles Babbage')).toBeVisible();
  await expect(page.locator('.status')).toHaveText('Confirmed');
  await expect.poll(() => confirmedPax(id, 'economy')).toBe(2);

  // It shows up in My Bookings.
  await page.getByRole('link', { name: 'My Bookings' }).first().click();
  const row = page.locator('.order-row').filter({ hasText: flightNo });
  await expect(row).toContainText('JFK → LAX');
  await expect(row).toContainText('Confirmed');
  await expect(row).toContainText(total);

  // The seats left on the flight went down by two.
  await page.goto(`/?from=JFK&to=LAX&date=${date}&cabin=economy&pax=1`);
  await expect(card(page, flightNo)).toContainText('2 seats left');

  // Cancel it.
  await page.goto('/bookings');
  await row.click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.locator('.status')).toHaveText('Cancelled');
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0);
  await expect.poll(() => confirmedPax(id, 'economy')).toBe(0);

  await page.goto('/bookings');
  await expect(page.locator('.order-row').filter({ hasText: flightNo })).toContainText('Cancelled');
});

test('declining the cancel confirmation keeps the booking', async ({ page, account }) => {
  const id = await makeFlight({ flightNo: `E2E${Math.floor(Math.random() * 9000 + 1000)}` });
  await page.goto(`/book/${id}?cabin=economy&pax=1`);
  await page.getByLabel('Phone (optional)').fill('1');
  await page.getByRole('button', { name: /^Confirm/ }).click();
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.locator('.status')).toHaveText('Confirmed');
  await expect.poll(() => confirmedPax(id, 'economy')).toBe(1);
});

test('business cabin journey uses the business fare', async ({ page, account }) => {
  const flightNo = `E2E${Math.floor(Math.random() * 9000 + 1000)}`;
  const id = await makeFlight({ flightNo, businessPrice: 410 });
  const date = await originDate(id);
  await page.goto(`/?from=JFK&to=LAX&date=${date}&cabin=business&pax=1`);
  const result = card(page, flightNo);
  await expect(result).toContainText('$410.00');
  await expect(result).toContainText('Business');
  await result.getByRole('link', { name: 'Select' }).click();
  await expect(page.locator('.summary')).toContainText(priceText(410, 1));
  await page.getByRole('button', { name: /^Confirm/ }).click();
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
  await expect(page.getByText(/Business/).first()).toBeVisible();
  await expect.poll(() => confirmedPax(id, 'business')).toBe(1);
});

test('the Search results link on the booking page returns to the same search', async ({ page, account }) => {
  const id = await makeFlight();
  const date = await originDate(id);
  await page.goto(`/book/${id}?cabin=economy&pax=2`);
  await page.getByRole('link', { name: 'Search results' }).click();
  await expect(page).toHaveURL(new RegExp(`from=JFK&to=LAX&date=${date}&cabin=economy&pax=2`));
});
