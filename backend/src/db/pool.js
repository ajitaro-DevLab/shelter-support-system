import pg from 'pg';
import { getSafeErrorDiagnostics, isDatabaseUnavailableError } from './errors.js';
import { writeLog } from '../logger.js';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on('error', (error) => {
  const isDatabaseUnavailable = isDatabaseUnavailableError(error);
  writeLog('ERROR', 'database/error', {
    result: 'connection_lost',
    errorCode: 'SERVICE_UNAVAILABLE',
    ...getSafeErrorDiagnostics(error, isDatabaseUnavailable)
  });
});

export async function verifyDatabaseConnection() {
  await pool.query('SELECT 1');
}

export async function closePool() {
  await pool.end();
}
