import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { createShelterDetailService } from '../src/services/shelter-detail-service.js';

const detail = {
  id: 'shelter-002',
  name: 'I市立Alpha中学校',
  latitude: 35.6820,
  longitude: 139.9780,
  status: 'yellow',
  currentCount: 86,
  confirmedCount: 84,
  confirmedAt: '2026-08-14T04:02:00.000Z',
  confirmationSlot: '13:00',
  confidence: 'confirmed',
  updatedAt: '2026-08-14T04:02:00.000Z',
  updatedBy: 'demo-user-01',
  latestSupply: {
    supplyId: '12',
    supplyType: 'water',
    quantity: 10,
    unit: 'ケース',
    occurredAt: '2026-08-14T03:30:00.000Z',
    updatedBy: 'demo-user-01'
  },
  latestIssue: {
    issueId: '8',
    category: 'power',
    severity: 'caution',
    occurredAt: '2026-08-14T03:45:00.000Z',
    updatedBy: 'demo-user-01'
  },
  history: [
    {
      eventId: 'event-3',
      eventType: 'confirmation',
      occurredAt: '2026-08-14T04:02:00.000Z',
      updatedBy: 'demo-user-01',
      payload: { total: 84, confirmationSlot: '13:00' },
      status: 'accepted'
    }
  ]
};

describe('GET /api/shelters/{id}', () => {
  let baseUrl;
  let server;
  const logRecords = [];

  before(async () => {
    const repository = {
      getDetail: async (shelterId) => shelterId === detail.id ? detail : null
    };
    server = createServer(createRequestHandler({
      logger: (level, category, fields) => logRecords.push({ level, category, ...fields }),
      shelterDetailService: createShelterDetailService({
        repository,
        now: () => new Date('2026-08-14T14:00:00+09:00')
      })
    }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('returns the Home and HQ detail contract', async () => {
    const response = await fetch(`${baseUrl}/api/shelters/shelter-002`, {
      headers: { 'X-Request-Id': 'shelter-detail-test' }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'shelter-detail-test');
    assert.deepEqual(body, detail);
    assert.equal(body.history.length, 1);
    assert.deepEqual(logRecords.at(-1), {
      level: 'INFO',
      category: 'api',
      requestId: 'shelter-detail-test',
      shelterId: 'shelter-002',
      result: 'success'
    });
  });

  it('returns 404 for a missing shelter', async () => {
    const response = await fetch(`${baseUrl}/api/shelters/missing-shelter`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('returns 503 without leaking database details', async () => {
    const failingServer = createServer(createRequestHandler({
      logger: () => {},
      shelterDetailService: createShelterDetailService({
        repository: {
          getDetail: async () => {
            throw new Error('Connection terminated due to connection timeout');
          }
        }
      })
    }));
    await new Promise((resolve) => failingServer.listen(0, '127.0.0.1', resolve));

    try {
      const response = await fetch(
        `http://127.0.0.1:${failingServer.address().port}/api/shelters/shelter-002`
      );
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
      assert.doesNotMatch(JSON.stringify(body), /connection|timeout|stack/i);
    } finally {
      await new Promise((resolve) => failingServer.close(resolve));
    }
  });
});
