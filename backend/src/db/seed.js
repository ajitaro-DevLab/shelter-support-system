import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseDirectory } from './paths.js';
import { closePool, pool } from './pool.js';

export async function seedDatabase() {
  const sql = await readFile(path.join(databaseDirectory, 'seed', '001_demo_data.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await seedDatabase();
  } finally {
    await closePool();
  }
}
