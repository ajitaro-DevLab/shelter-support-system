import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createRequestHandler } from '../src/app.js';

describe('GET /api/shelters', () => {
  let baseUrl;
  let server;

  before(async () => {
    server = createServer(createRequestHandler({
      logger: () => {},
      shelterRepository: {
        listActive: async () => [{
          id: 'shelter-002',
          name: 'I市立Alpha中学校',
          status: 'yellow',
          currentCount: 86,
          updatedAt: '2026-08-07T14:05:00.000Z'
        }]
      }
    }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('returns active shelters in the API contract shape', async () => {
    const response = await fetch(`${baseUrl}/api/shelters`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.length, 1);
    assert.deepEqual(body[0], {
      id: 'shelter-002',
      name: 'I市立Alpha中学校',
      status: 'yellow',
      currentCount: 86,
      updatedAt: '2026-08-07T14:05:00.000Z'
    });
  });

  it('returns 503 without leaking details when the database is unavailable', async () => {
    const logRecords = [];
    const failingServer = createServer(createRequestHandler({
      logger: (level, category, fields) => logRecords.push({ level, category, ...fields }),
      shelterRepository: {
        listActive: async () => {
          const error = new Error('connect ECONNREFUSED private-password@internal-db');
          error.code = 'ECONNREFUSED';
          throw error;
        }
      }
    }));
    await new Promise((resolve) => failingServer.listen(0, '127.0.0.1', resolve));
    const address = failingServer.address();

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/shelters`, {
        headers: { 'X-Request-Id': 'shelters-db-down-test' }
      });
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.equal(response.headers.get('x-request-id'), 'shelters-db-down-test');
      assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
      assert.doesNotMatch(JSON.stringify(body), /connection|timeout|stack/i);
      assert.deepEqual(logRecords.at(-1), {
        level: 'ERROR',
        category: 'database/error',
        requestId: 'shelters-db-down-test',
        result: 'failed',
        errorCode: 'SERVICE_UNAVAILABLE',
        errorClass: 'DatabaseConnectionError',
        sourceErrorCode: 'ECONNREFUSED',
        safeErrorMessage: 'PostgreSQL connection refused'
      });
      assert.doesNotMatch(JSON.stringify(logRecords.at(-1)), /private-password|internal-db/i);
    } finally {
      await new Promise((resolve) => failingServer.close(resolve));
    }
  });

  it('keeps unexpected repository errors classified as 500', async () => {
    const logRecords = [];
    const failingServer = createServer(createRequestHandler({
      logger: (level, category, fields) => logRecords.push({ level, category, ...fields }),
      shelterRepository: {
        listActive: async () => {
          const error = new Error(
            'unexpected repository failure postgresql://private-user:private-password@db/internal'
          );
          error.stack = 'secret stack trace';
          throw error;
        }
      }
    }));
    await new Promise((resolve) => failingServer.listen(0, '127.0.0.1', resolve));
    const address = failingServer.address();

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/shelters`);
      const body = await response.json();

      assert.equal(response.status, 500);
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.doesNotMatch(JSON.stringify(body), /unexpected repository failure/);
      assert.deepEqual(logRecords.at(-1), {
        level: 'ERROR',
        category: 'database/error',
        requestId: response.headers.get('x-request-id'),
        result: 'failed',
        errorCode: 'INTERNAL_ERROR',
        errorClass: 'Error',
        sourceErrorCode: null,
        safeErrorMessage: 'Unexpected application error'
      });
      assert.doesNotMatch(
        JSON.stringify(logRecords.at(-1)),
        /private-user|private-password|postgresql:\/\/|secret stack|unexpected repository failure/i
      );
    } finally {
      await new Promise((resolve) => failingServer.close(resolve));
    }
  });
});
