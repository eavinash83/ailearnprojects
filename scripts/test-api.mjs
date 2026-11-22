// Runs the API test suite against an isolated server and the TEST database (.env.test).
//   npm run test:api                          -> all tests/api/**/*.test.js
//   npm run test:api -- tests/api/smoke.test.js
import { spawn } from 'node:child_process';
import { startTestServer } from './lib/test-server.mjs';

let ts;
let code = 1;
try {
  ts = await startTestServer();
  const files = process.argv.slice(2);
  const args = ['--test', '--test-concurrency=4', ...(files.length ? files : ['tests/api/**/*.test.js'])];
  code = await new Promise((resolve) => spawn(process.execPath, args, { env: ts.env, stdio: 'inherit' }).on('exit', (c) => resolve(c ?? 1)));
} catch (err) {
  console.error(err.message);
} finally {
  await ts?.stop();
}
process.exit(code);
