// Drops all tables and re-seeds. Deletes every booking — dev use only. Auth tables (users, sessions) are kept.
import { migrateAuth } from './auth.js';
import { initDb, pool } from './db.js';

await pool.query('DROP TABLE IF EXISTS bookings, flights');
await migrateAuth();
await initDb();
console.log('Database reset: tables recreated and re-seeded.');
await pool.end();
