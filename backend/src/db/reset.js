import { closePool, pool } from './pool.js';
import { migrateDatabase } from './migrate.js';
import { seedDatabase } from './seed.js';

try {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await migrateDatabase();
  await seedDatabase();
} finally {
  await closePool();
}
