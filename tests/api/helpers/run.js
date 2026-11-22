// Every test run tags the data it creates with RUN_ID, so concurrent runs (CI jobs, a teammate, local) sharing one
// test database never delete each other's users or flights. The runner sets RUN_ID; 'local' is the fallback.
import crypto from 'node:crypto';

export const RUN_ID = process.env.RUN_ID || 'local';
const rand = () => crypto.randomBytes(5).toString('hex');

export const userEmail = () => `t-${RUN_ID}-${rand()}@test.local`;
export const newFlightId = () => `T-${RUN_ID}-${rand()}`;
