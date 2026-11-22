import { test as base, expect } from '@playwright/test';
import { DOMAIN, quote } from '../../shared/domain.js';
import { userEmail } from '../api/helpers/run.js';

export { expect };
export const PASSWORD = 'Test-Password-123';

export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: DOMAIN.currency });
export const priceText = (fare, pax) => money.format(quote(fare, pax).total);

/** 'YYYY-MM-DD' for today + n days (UTC; used to build fixed local departure dates). */
export const dayOffset = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export const searchUrl = ({ from = 'JFK', to = 'LAX', date, cabin = 'economy', pax = 1, sort } = {}) =>
  `/?${new URLSearchParams({ from, to, date, cabin, pax: String(pax), ...(sort ? { sort } : {}) })}`;

export const test = base.extend({
  /** A new account, already signed in in this browser (sign-up through the real API; cookies land in the page's context). */
  account: async ({ page, baseURL }, use) => {
    const account = { name: 'Ada Lovelace', email: userEmail(), password: PASSWORD };
    const res = await page.request.post('/api/auth/sign-up/email', {
      data: account,
      headers: { origin: baseURL },
    });
    expect(res.ok(), 'sign-up via API').toBeTruthy();
    await use(account);
  },
});

/** A flight card in the results list, found by its (unique) flight number. */
export const card = (page, flightNo) => page.locator('article.flight-card').filter({ hasText: flightNo });

/** The From / To airport <select> on the search form (their label text also contains every city name, so getByLabel is ambiguous). */
export const airportSelect = (page, label) => page.locator('label.field').filter({ has: page.getByText(label, { exact: true }) }).locator('select');
