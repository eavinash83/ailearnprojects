// Starts the app against the TEST database for API and E2E runs. Never reads .env, never touches production.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { checkTestDatabase } from '../../tests/api/helpers/guard.js';

// Neon suspends an idle compute and the first connections after that can fail for a few seconds. Wake it, and prove it
// accepts several parallel connections, before the app and the tests start (otherwise early tests fail on a cold database).
async function warmDatabase(url) {
  const { Pool } = await import('@neondatabase/serverless');
  const pool = new Pool({ connectionString: url, max: 8 });
  pool.on('error', () => {});
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      await Promise.all(Array.from({ length: 8 }, () => pool.query('SELECT 1')));
      break;
    } catch (e) {
      if (Date.now() > deadline) {
        await pool.end().catch(() => {});
        throw new Error(`Test database did not wake up within 90s: ${e?.message ?? 'connection error'}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await pool.end().catch(() => {});
}

export async function startTestServer() {
  const port = process.env.TEST_PORT || '3200';
  if (!fs.existsSync('dist/index.html')) {
    console.error('No dist/ build. Run "npm run build" first (the server serves it).');
    process.exit(1);
  }
  // Locally: .env.test. In CI there is no file; the same values come from TEST_DATABASE_URL / TEST_BETTER_AUTH_SECRET.
  const fileEnv = fs.existsSync('.env.test')
    ? parseEnv(fs.readFileSync('.env.test', 'utf8'))
    : { DATABASE_URL: process.env.TEST_DATABASE_URL, BETTER_AUTH_SECRET: process.env.TEST_BETTER_AUTH_SECRET || crypto.randomBytes(24).toString('hex') };
  if (!fileEnv.DATABASE_URL) {
    console.error('No test database: create .env.test (DATABASE_URL + BETTER_AUTH_SECRET) or set TEST_DATABASE_URL.');
    process.exit(1);
  }
  checkTestDatabase(fileEnv.DATABASE_URL); // exits if it looks like production
  await warmDatabase(fileEnv.DATABASE_URL);

  // Explicit env so nothing from the caller's shell or .env leaks in.
  const env = {
    ...process.env,
    ...fileEnv,
    RUN_ID: process.env.RUN_ID || crypto.randomBytes(3).toString('hex'), // tags this run's test data (see tests/api/helpers/run.js)
    NODE_ENV: 'development', // not 'test': Better Auth disables its Origin/CSRF check when NODE_ENV=test
    PORT: port,
    BETTER_AUTH_URL: `http://localhost:${port}`,
    BASE_URL: `http://localhost:${port}`,
    GRAFANA_LOKI_URL: '', // never ship test logs to Grafana
    GRAFANA_LOKI_USER: '',
    GRAFANA_LOKI_TOKEN: '',
  };

  const server = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  let exited = false;
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  let stopping = false;
  server.on('exit', () => {
    exited = true;
    if (!stopping) console.error(`\n!!! Test server exited unexpectedly. Last output:\n${log.slice(-3000)}`);
  });

  for (let i = 0; ; i++) {
    if (exited) throw new Error('Server exited during startup:\n' + log);
    if (i >= 90) throw new Error('Server did not become healthy in 90s:\n' + log);
    try {
      if ((await fetch(`${env.BASE_URL}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }

  return {
    env,
    /** Error/warn lines the app logged (for diagnosing a failed run). */
    errorLog: () => log.split(/\r?\n/).filter((l) => /"level":"error"/.test(l)).join('\n'),
    // Deletes everything the tests created, then stops the server.
    async stop() {
      Object.assign(process.env, env);
      const { cleanup } = await import('../../tests/api/helpers/factory.js');
      await cleanup().catch((e) => console.error('cleanup failed:', e.message));
      stopping = true;
      server.kill();
    },
  };
}
