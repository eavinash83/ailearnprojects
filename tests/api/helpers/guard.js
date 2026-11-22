// Refuses to run tests against anything that could be production.
import fs from 'node:fs';
import { parseEnv } from 'node:util';

const hostOf = (url) => new URL(url).host.replace('-pooler', '');

export function checkTestDatabase(url) {
  if (!url) fail('DATABASE_URL is missing (expected from .env.test)');
  if (fs.existsSync('.env')) {
    const prod = parseEnv(fs.readFileSync('.env', 'utf8')).DATABASE_URL;
    if (prod && hostOf(prod) === hostOf(url)) fail(`.env.test points at the same Neon endpoint as .env (${hostOf(url)})`);
  }
  if (/ep-tiny-bonus/.test(url)) fail('DATABASE_URL points at the production endpoint');
}

function fail(msg) {
  console.error(`REFUSING TO RUN TESTS: ${msg}`);
  process.exit(1);
}
