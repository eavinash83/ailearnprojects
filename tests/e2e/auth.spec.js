import { newUser, PASSWORD } from '../api/helpers/factory.js';
import { expect, test } from './fixtures.js';

test('sign up through the form signs the user in', async ({ page }) => {
  const email = `t-${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}@test.local`;
  await page.goto('/login?mode=signup');
  await expect(page.getByRole('heading', { name: /Create your SkyBook account/ })).toBeVisible();
  await page.getByLabel('Name').fill('Grace Hopper');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByText('Grace Hopper')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('sign in with an existing account', async ({ page }) => {
  const u = await newUser('Linus T');
  await page.goto('/login');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Linus T')).toBeVisible();
});

test('wrong password shows an error and stays on the form', async ({ page }) => {
  const u = await newUser();
  await page.goto('/login');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill('Wrong-Password-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('client-side validation: short password and missing name', async ({ page }) => {
  await page.goto('/login?mode=signup');
  await page.getByLabel('Email').fill('x@test.local');
  await page.getByLabel('Password').fill('abcdefgh');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter your name');

  await page.getByLabel('Name').fill('X');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('Password must be at least 8 characters');
});

test('duplicate email on sign-up shows an error', async ({ page }) => {
  const u = await newUser();
  await page.goto('/login?mode=signup');
  await page.getByLabel('Name').fill('Dup');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('switching between sign in and create account', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/mode=signup/);
  await expect(page.getByLabel('Name')).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page.getByLabel('Name')).toHaveCount(0);
});

test('protected page redirects to login and returns after sign-in', async ({ page }) => {
  const u = await newUser();
  await page.goto('/bookings');
  await expect(page).toHaveURL(/\/login\?next=%2Fbookings/);
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/bookings');
  await expect(page.getByRole('heading', { name: 'My Bookings' })).toBeVisible();
});

test('an off-site ?next= is ignored after sign-in', async ({ page }) => {
  const u = await newUser();
  await page.goto('/login?next=//evil.example');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/');
});

test('sign out returns to the home page and re-protects pages', async ({ page, account }) => {
  await page.goto('/');
  await expect(page.getByText(account.name)).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await page.goto('/bookings');
  await expect(page).toHaveURL(/\/login/);
});

test('a signed-in user visiting /login is sent away', async ({ page, account }) => {
  await page.goto('/login');
  await expect(page).toHaveURL('/');
});
