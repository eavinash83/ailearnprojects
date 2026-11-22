// Starts the app against the TEST database for API and E2E runs. Never reads .env, never touches production.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { checkTestDatabase } from '../../tests/api/helpers/guard.js';

export async function startTestServer() {
  const port = process.env.TEST_PORT || '3200';
  if (!fs.existsSync('.env.test')) {
    console.error('Missing .env.test (DATABASE_URL of the Neon test branch + BETTER_AUTH_SECRET).');
    process.exit(1);
  }
  if (!fs.existsSync('dist/index.html')) {
    console.error('No dist/ build. Run "npm run build" first (the server serves it).');
    process.exit(1);
  }
  const fileEnv = parseEnv(fs.readFileSync('.env.test', 'utf8'));
  checkTestDatabase(fileEnv.DATABASE_URL); // exits if it looks like production

  // Explicit env so nothing from the caller's shell or .env leaks in.
  const env = {
    ...process.env,
    ...fileEnv,
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
