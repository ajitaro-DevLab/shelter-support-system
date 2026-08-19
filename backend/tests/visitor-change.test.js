import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { createVisitorChangeService } from '../src/services/visitor-change-service.js';

const validInput = {
  delta: 10,
  occurredAt: '2026-08-14T09:15:00+09:00',
  updatedBy: 'demo-user-01'
};

describe('visitor change validation', () => {
  const repository = {
    record: async () => ({
      outcome: 'recorded',
      currentCount: 96,
      confidence: 'estimated',
      updatedAt: '2026-08-14T00:15:00.000Z',
      updatedBy: 'demo-user-01'
    })
  };
  const service = createVisitorChangeService({ repository });

  for (const delta of [0, 1.5, '1', null]) {
    it(`rejects invalid delta: ${String(delta)}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, delta }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  it('rejects an invalid occurredAt value', async () => {
    await assert.rejects(
      service.record('shelter-001', { ...validInput, occurredAt: 'not-a-date' }),
      (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
    );
  });
});

describe('POST /api/shelters/{id}/events/visitor-change', () => {
  let baseUrl;
  let server;
  const logRecords = [];
  const repository = {
    async record(input) {
      if (input.shelterId === 'missing-shelter') {
        return { outcome: 'shelter_not_found' };
      }
      if (input.updatedBy === 'missing-user') {
        return { outcome: 'user_not_found' };
      }
      if (input.delta === -200) {
        return { outcome: 'negative_count' };
      }
      return {
        outcome: 'recorded',
        currentCount: 96,
        confidence: 'estimated',
        updatedAt: input.occurredAt,
        updatedBy: input.updatedBy
      };
    }
  };

  before(async () => {
    server = createServer(createRequestHandler({
      logger: (level, category, fields) => logRecords.push({ level, category, ...fields }),
      visitorChangeService: createVisitorChangeService({ repository })
    }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  async function post(shelterId, body, requestId = 'visitor-change-test') {
    return fetch(`${baseUrl}/api/shelters/${shelterId}/events/visitor-change`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId
      },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });
  }

  it('records a visitor change and returns the updated count', async () => {
    const response = await post('shelter-001', validInput);
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-request-id'), 'visitor-change-test');
    assert.equal(body.eventType, 'visitor_change');
    assert.equal(body.shelterId, 'shelter-001');
    assert.equal(body.delta, 10);
    assert.equal(body.currentCount, 96);
    assert.equal(body.confidence, 'estimated');
    assert.equal(body.updatedBy, 'demo-user-01');
    assert.match(body.eventId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(logRecords.at(-1), {
      level: 'INFO',
      category: 'api',
      requestId: 'visitor-change-test',
      shelterId: 'shelter-001',
      eventType: 'visitor_change',
      userId: 'demo-user-01',
      result: 'success'
    });
  });

  it('rejects a change that would make the count negative', async () => {
    const response = await post('shelter-001', { ...validInput, delta: -200 });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      error: {
        code: 'VALIDATION_ERROR',
        message: '入力内容を確認してください。'
      }
    });
  });

  it('returns 404 for a missing shelter', async () => {
    const response = await post('missing-shelter', validInput);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('rejects a missing update user', async () => {
    const response = await post('shelter-001', {
      ...validInput,
      updatedBy: 'missing-user'
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects malformed JSON without exposing parser details', async () => {
    const response = await post('shelter-001', '{invalid-json');
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.doesNotMatch(JSON.stringify(body), /SyntaxError|JSON/i);
  });
});
