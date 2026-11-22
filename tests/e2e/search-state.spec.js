import { bookingBody, makeFlight, newUser, originDate } from '../api/helpers/factory.js';
import { airportSelect, card, dayOffset, expect, searchUrl, test } from './fixtures.js';

const uniq = () => `E2E${Math.floor(Math.random() * 9000 + 1000)}`;

test('submitting the form writes the search into the URL, and a reload restores it', async ({ page }) => {
  const flightNo = uniq();
  const id = await makeFlight({ origin: 'SEA', destination: 'DEN', flightNo });
  const date = await originDate(id);

  await page.goto('/');
  await airportSelect(page, 'From').selectOption('SEA');
  await airportSelect(page, 'To').selectOption('DEN');
  await page.getByLabel('Departure').fill(date);
  await page.getByLabel('Cabin').selectOption('business');
  await page.getByLabel('Passengers').selectOption('3');
  await page.getByRole('button', { name: 'Search flights' }).click();
  await expect(page).toHaveURL(new RegExp(`from=SEA&to=DEN&date=${date}&cabin=business&pax=3`));
  await expect(card(page, flightNo)).toBeVisible();

  await page.reload();
  await expect(card(page, flightNo)).toBeVisible();
  await expect(airportSelect(page, 'From')).toHaveValue('SEA');
  await expect(airportSelect(page, 'To')).toHaveValue('DEN');
  await expect(page.getByLabel('Departure', { exact: false }).first()).toHaveValue(date);
  await expect(page.getByLabel('Cabin')).toHaveValue('business');
  await expect(page.getByLabel('Passengers')).toHaveValue('3');
});

test('a shared search URL works in a fresh browser session', async ({ page }) => {
  const flightNo = uniq();
  const id = await makeFlight({ origin: 'BOS', destination: 'ATL', flightNo });
  await page.goto(searchUrl({ from: 'BOS', to: 'ATL', date: await originDate(id) }));
  await expect(page.getByRole('heading', { name: 'Boston → Atlanta' })).toBeVisible();
  await expect(card(page, flightNo)).toBeVisible();
});

test('back and forward move between the home page and results', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Popular routes' })).toBeVisible();
  await page.getByRole('button', { name: 'New York → Los Angeles' }).click();
  await expect(page).toHaveURL(/from=JFK&to=LAX/);
  await expect(page.getByRole('heading', { name: 'New York → Los Angeles' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Popular routes' })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/from=JFK&to=LAX/);
  await expect(page.getByRole('heading', { name: 'New York → Los Angeles' })).toBeVisible();
});

test('sorting updates the URL and the order of results', async ({ page }) => {
  const date = dayOffset(6);
  const [a, b, c] = [uniq() + 'a', uniq() + 'b', uniq() + 'c'];
  // Departures 08:00, 09:00, 10:00; prices 300, 100, 200; durations 200, 400, 300 minutes.
  await makeFlight({ origin: 'LAS', destination: 'DFW', flightNo: a, departsAtLocal: `${date} 08:00`, economyPrice: 300, minutes: 200 });
  await makeFlight({ origin: 'LAS', destination: 'DFW', flightNo: b, departsAtLocal: `${date} 09:00`, economyPrice: 100, minutes: 400 });
  await makeFlight({ origin: 'LAS', destination: 'DFW', flightNo: c, departsAtLocal: `${date} 10:00`, economyPrice: 200, minutes: 300 });

  const order = async () => {
    const texts = await page.locator('article.flight-card').allInnerTexts();
    return [a, b, c].map((n) => [n, texts.findIndex((t) => t.includes(n))]).sort((x, y) => x[1] - y[1]).map(([n]) => n);
  };

  await page.goto(searchUrl({ from: 'LAS', to: 'DFW', date }));
  await expect(page.locator('article.flight-card').filter({ hasText: a })).toBeVisible();
  expect(await order()).toEqual([a, b, c]); // earliest departure by default

  await page.getByLabel('Sort').selectOption('price');
  await expect(page).toHaveURL(/sort=price/);
  await expect.poll(order).toEqual([b, c, a]);

  await page.getByLabel('Sort').selectOption('duration');
  await expect(page).toHaveURL(/sort=duration/);
  await expect.poll(order).toEqual([a, c, b]);
});

test('same origin and destination is blocked with a message', async ({ page }) => {
  await page.goto('/');
  await airportSelect(page, 'From').selectOption('JFK');
  await airportSelect(page, 'To').selectOption('JFK');
  await expect(page.getByText('Origin and destination must differ.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search flights' })).toBeDisabled();
});

test('search button stays disabled until both airports are chosen; swap exchanges them', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Search flights' })).toBeDisabled();
  await airportSelect(page, 'From').selectOption('ATL');
  await airportSelect(page, 'To').selectOption('MIA');
  await expect(page.getByRole('button', { name: 'Search flights' })).toBeEnabled();
  await page.getByRole('button', { name: 'Swap origin and destination' }).click();
  await expect(airportSelect(page, 'From')).toHaveValue('MIA');
  await expect(airportSelect(page, 'To')).toHaveValue('ATL');
});

test('departure date is limited to the sales window', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Departure');
  await expect(input).toHaveAttribute('min', /^\d{4}-\d{2}-\d{2}$/);
  await expect(input).toHaveAttribute('max', /^\d{4}-\d{2}-\d{2}$/);
});

test('a day without flights shows the empty state', async ({ page }) => {
  await page.goto(searchUrl({ from: 'JFK', to: 'LAX', date: '2020-01-01' }));
  await expect(page.getByRole('heading', { name: 'No flights found' })).toBeVisible();
});

test('sold-out and short-on-seats flights are shown but cannot be selected', async ({ page }) => {
  const flightNo = uniq();
  const id = await makeFlight({ origin: 'DEN', destination: 'SFO', economySeats: 1, flightNo });
  const date = await originDate(id);

  // 2 passengers, 1 seat: "Only 1 left".
  await page.goto(searchUrl({ from: 'DEN', to: 'SFO', date, pax: 2 }));
  const result = card(page, flightNo);
  await expect(result.getByRole('button', { name: 'Only 1 left' })).toBeDisabled();
  await expect(result.getByRole('link', { name: 'Select' })).toHaveCount(0);

  // 1 passenger can still book it ...
  await page.goto(searchUrl({ from: 'DEN', to: 'SFO', date, pax: 1 }));
  await expect(card(page, flightNo).getByRole('link', { name: 'Select' })).toBeVisible();

  // ... until someone else takes the seat.
  const other = await newUser();
  expect((await other.post('/api/bookings', bookingBody(id))).status).toBe(201);
  await page.goto(searchUrl({ from: 'DEN', to: 'SFO', date, pax: 1 }));
  await expect(card(page, flightNo).getByRole('button', { name: 'Sold out' })).toBeDisabled();
});

test('"N seats left" is shown when 9 or fewer remain', async ({ page }) => {
  const flightNo = uniq();
  const id = await makeFlight({ origin: 'DFW', destination: 'ORD', economySeats: 1, flightNo });
  await page.goto(searchUrl({ from: 'DFW', to: 'ORD', date: await originDate(id) }));
  await expect(card(page, flightNo)).toContainText('1 seat left');
});

test('switching cabin in the URL shows that cabin’s fare', async ({ page }) => {
  const flightNo = uniq();
  const id = await makeFlight({ origin: 'MIA', destination: 'JFK', economyPrice: 111, businessPrice: 999, flightNo });
  const date = await originDate(id);
  await page.goto(searchUrl({ from: 'MIA', to: 'JFK', date, cabin: 'economy' }));
  await expect(card(page, flightNo)).toContainText('$111.00');
  await page.goto(searchUrl({ from: 'MIA', to: 'JFK', date, cabin: 'business' }));
  await expect(card(page, flightNo)).toContainText('$999.00');
});
