import { createServer } from 'node:http';
import { createRequestHandler } from './app.js';
import { closePool, verifyDatabaseConnection } from './db/pool.js';
import { writeLog } from './logger.js';
import { confirmationRepository } from './repositories/confirmation-repository.js';
import { issueRepository } from './repositories/issue-repository.js';
import { noticeRepository } from './repositories/notice-repository.js';
import { shelterRepository } from './repositories/shelter-repository.js';
import { supplyRepository } from './repositories/supply-repository.js';
import { visitorChangeRepository } from './repositories/visitor-change-repository.js';
import { createConfirmationService } from './services/confirmation-service.js';
import { createIssueService } from './services/issue-service.js';
import { createHqService } from './services/hq-service.js';
import { createNoticeService } from './services/notice-service.js';
import { createShelterDetailService } from './services/shelter-detail-service.js';
import { createSupplyService } from './services/supply-service.js';
import { createVisitorChangeService } from './services/visitor-change-service.js';

function readPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer from 1 to 65535');
  }
  return port;
}

try {
  const port = readPort(process.env.API_PORT);
  const host = process.env.API_HOST || '127.0.0.1';
  const visitorChangeService = createVisitorChangeService({
    repository: visitorChangeRepository
  });
  const confirmationService = createConfirmationService({
    repository: confirmationRepository
  });
  const supplyService = createSupplyService({ repository: supplyRepository });
  const issueService = createIssueService({ repository: issueRepository });
  const noticeService = createNoticeService({ repository: noticeRepository });
  const shelterDetailService = createShelterDetailService({ repository: shelterRepository });
  const hqService = createHqService({ repository: shelterRepository });
  const server = createServer(createRequestHandler({
    healthCheck: verifyDatabaseConnection,
    shelterRepository,
    shelterDetailService,
    hqService,
    visitorChangeService,
    confirmationService,
    supplyService,
    issueService,
    noticeService
  }));

  server.listen(port, host, () => {
    writeLog('INFO', 'application', { result: 'started' });
  });

  server.on('error', (error) => {
    writeLog('ERROR', 'application', {
      result: 'startup_failed',
      errorCode: error.code || 'SERVER_ERROR'
    });
    process.exitCode = 1;
  });

  const shutdown = () => {
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  writeLog('ERROR', 'application', {
    result: 'configuration_error',
    errorCode: 'INVALID_API_PORT'
  });
  process.exitCode = 1;
}
