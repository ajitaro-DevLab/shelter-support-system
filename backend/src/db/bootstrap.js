import { closePool } from './pool.js';
import { getSafeErrorDiagnostics, isDatabaseUnavailableError } from './errors.js';
import { migrateDatabase } from './migrate.js';
import { seedDatabase } from './seed.js';
import { writeLog } from '../logger.js';

try {
  await migrateDatabase();
  await seedDatabase();
} catch (error) {
  const isDatabaseUnavailable = isDatabaseUnavailableError(error);
  writeLog('ERROR', 'database/error', {
    result: 'bootstrap_failed',
    errorCode: isDatabaseUnavailable ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR',
    ...getSafeErrorDiagnostics(error, isDatabaseUnavailable)
  });
  process.exitCode = 1;
} finally {
  await closePool();
}
