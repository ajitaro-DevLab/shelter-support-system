import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createRequestHandler } from '../src/app.js';

describe('GET /api/health', () => {
  let baseUrl;
  let server;
  const logRecords = [];

  before(async () => {
    server = createServer(createRequestHandler({
      logger: (level, category, fields) => logRecords.push({ level, category, ...fields })
    }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it('returns the required health response and request ID', async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { 'X-Request-Id': 'health-test-request' }
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.equal(response.headers.get('x-request-id'), 'health-test-request');
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.deepEqual(logRecords.at(-1), {
      level: 'INFO',
      category: 'api',
      requestId: 'health-test-request',
      result: 'success'
    });
  });

  it('returns the common error shape for an unknown route', async () => {
    const response = await fetch(`${baseUrl}/api/not-found`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(typeof body.error.message, 'string');
    assert.ok(response.headers.get('x-request-id'));
  });

  it('returns 503 when the database health check fails', async () => {
    const failingServer = createServer(createRequestHandler({
      logger: () => {},
      healthCheck: async () => {
        const error = new Error('database unavailable');
        error.code = 'ECONNREFUSED';
        throw error;
      }
    }));
    await new Promise((resolve) => failingServer.listen(0, '127.0.0.1', resolve));
    const address = failingServer.address();

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'サービスを利用できません。'
        }
      });
    } finally {
      await new Promise((resolve) => failingServer.close(resolve));
    }
  });

  it('keeps unexpected application errors classified as 500', async () => {
    const failingServer = createServer(createRequestHandler({
      logger: () => {},
      healthCheck: async () => { throw new Error('unexpected failure'); }
    }));
    await new Promise((resolve) => failingServer.listen(0, '127.0.0.1', resolve));
    const address = failingServer.address();

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      const body = await response.json();

      assert.equal(response.status, 500);
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.doesNotMatch(JSON.stringify(body), /unexpected failure/);
    } finally {
      await new Promise((resolve) => failingServer.close(resolve));
    }
  });
});
