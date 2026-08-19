import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { createHqService } from '../src/services/hq-service.js';

const records = [
  {
    shelterId: 'shelter-001',
    name: '避難所1',
    status: 'green',
    currentCount: 50,
    confirmedCount: 50,
    confirmedAt: '2026-08-14T13:50:00+09:00',
    confirmationSlot: '13:00',
    confidence: 'confirmed',
    updatedAt: '2026-08-14T13:50:00+09:00',
    updatedBy: 'demo-user-01'
  },
  {
    shelterId: 'shelter-002',
    name: '避難所2',
    status: 'yellow',
    currentCount: 61,
    confirmedCount: 60,
    confirmedAt: '2026-08-14T13:00:00+09:00',
    confirmationSlot: '13:00',
    confidence: 'estimated',
    updatedAt: '2026-08-14T13:30:00+09:00',
    updatedBy: 'demo-user-02'
  },
  {
    shelterId: 'shelter-003',
    name: '避難所3',
    status: 'red',
    currentCount: 70,
    confirmedCount: 70,
    confirmedAt: '2026-08-14T09:00:00+09:00',
    confirmationSlot: '09:00',
    confidence: 'confirmed',
    updatedAt: '2026-08-14T09:00:00+09:00',
    updatedBy: 'demo-user-01'
  },
  {
    shelterId: 'shelter-004',
    name: '避難所4',
    status: 'gray',
    currentCount: 0,
    confirmedCount: null,
    confirmedAt: null,
    confirmationSlot: null,
    confidence: 'estimated',
    updatedAt: '2026-08-14T08:00:00+09:00',
    updatedBy: 'demo-user-01'
  }
];

describe('GET /api/hq/shelters', () => {
  let baseUrl;
  let server;
  const logRecords = [];

  before(async () => {
    server = createServer(createRequestHandler({
      logger: (level, category, fields) => logRecords.push({ level, category, ...fields }),
      hqService: createHqService({
        repository: { listForHq: async () => records },
        now: () => new Date('2026-08-14T14:00:00+09:00')
      })
    }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('returns all HQ fields with shared confidence and formal-confirmation freshness', async () => {
    const response = await fetch(`${baseUrl}/api/hq/shelters`, {
      headers: { 'X-Request-Id': 'hq-test' }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'hq-test');
    assert.equal(body.length, 4);
    assert.deepEqual(body.map((shelter) => shelter.confidence), [
      'confirmed',
      'estimated',
      'unconfirmed',
      'unconfirmed'
    ]);
    assert.deepEqual(body.map((shelter) => shelter.freshness.level), [
      'green',
      'yellow',
      'orange',
      'black'
    ]);
    assert.equal(body[1].freshness.elapsedMinutes, 60);
    assert.equal(body[1].freshness.display, '1時間前');
    assert.equal(body[1].freshness.delayed, true);
    assert.equal(body[3].freshness.display, '未確認');
    assert.equal('confirmationSlot' in body[0], false);
    assert.deepEqual(Object.keys(body[0]), [
      'shelterId',
      'name',
      'status',
      'currentCount',
      'confirmedCount',
      'confirmedAt',
      'confidence',
      'updatedAt',
      'updatedBy',
      'freshness'
    ]);
    assert.deepEqual(logRecords.at(-1), {
      level: 'INFO',
      category: 'api',
      requestId: 'hq-test',
      result: 'success'
    });
  });

  it('returns 503 without leaking database details', async () => {
    const failingServer = createServer(createRequestHandler({
      logger: () => {},
      hqService: createHqService({
        repository: {
          listForHq: async () => {
            throw new Error('Connection terminated due to connection timeout');
          }
        }
      })
    }));
    await new Promise((resolve) => failingServer.listen(0, '127.0.0.1', resolve));

    try {
      const response = await fetch(
        `http://127.0.0.1:${failingServer.address().port}/api/hq/shelters`
      );
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
      assert.doesNotMatch(JSON.stringify(body), /connection|timeout|stack/i);
    } finally {
      await new Promise((resolve) => failingServer.close(resolve));
    }
  });

  it('keeps unexpected HQ service errors classified as 500', async () => {
    const failingServer = createServer(createRequestHandler({
      logger: () => {},
      hqService: {
        list: async () => {
          throw new Error('Unexpected HQ calculation failure');
        }
      }
    }));
    await new Promise((resolve) => failingServer.listen(0, '127.0.0.1', resolve));

    try {
      const response = await fetch(
        `http://127.0.0.1:${failingServer.address().port}/api/hq/shelters`
      );
      const body = await response.json();

      assert.equal(response.status, 500);
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.doesNotMatch(JSON.stringify(body), /calculation|failure|stack/i);
    } finally {
      await new Promise((resolve) => failingServer.close(resolve));
    }
  });
});
