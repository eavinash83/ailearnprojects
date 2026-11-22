// Builds the app, starts it against the TEST database and runs the Playwright suite in tests/e2e.
//   npm run test:e2e                      -> all specs
//   npm run test:e2e -- booking-flow      -> pass-through Playwright args
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { startTestServer } from './lib/test-server.mjs';

const run = (cmd, args, opts) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
// Build from the canonical path: on Windows, Vite builds started from "c:\..." (lower-case drive) can bundle one module twice
// (e.g. two ToastContext objects), which breaks the booking page in the bundle but not in dev.
const canonicalCwd = fs.realpathSync.native(process.cwd());
if (!process.argv.includes('--no-build') && run('npm', ['run', 'build'], { cwd: canonicalCwd }).status !== 0) process.exit(1);

let ts;
let code = 1;
try {
  ts = await startTestServer();
  const args = process.argv.slice(2).filter((a) => a !== '--no-build');
  code = await new Promise((resolve) =>
    spawn('npx', ['playwright', 'test', ...args], { cwd: 'tests/e2e', env: ts.env, stdio: 'inherit', shell: process.platform === 'win32' }).on('exit', (c) => resolve(c ?? 1)),
  );
} catch (err) {
  console.error(err.message);
} finally {
  if (code !== 0 && ts) {
    const errs = ts.errorLog();
    if (errs) console.error(`\n--- app server error log (this run) ---\n${errs.slice(-6000)}`);
  }
  await ts?.stop();
}
process.exit(code);
