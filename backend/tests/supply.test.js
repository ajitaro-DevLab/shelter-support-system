import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { createSupplyService } from '../src/services/supply-service.js';

const validInput = {
  supplyType: 'blanket',
  quantity: 20,
  unit: '枚',
  occurredAt: '2026-08-14T16:00:00+09:00',
  updatedBy: 'demo-user-01'
};

describe('supply validation', () => {
  const service = createSupplyService({
    repository: {
      record: async (input) => ({
        outcome: 'recorded',
        supplyId: '1',
        updatedAt: input.occurredAt,
        updatedBy: input.updatedBy
      })
    }
  });

  for (const supplyType of ['', 'medicine', null]) {
    it(`rejects invalid supplyType: ${String(supplyType)}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, supplyType }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  for (const quantity of [0, -1, 1.5, '20', null]) {
    it(`rejects invalid quantity: ${String(quantity)}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, quantity }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  it('accepts each specified supply type and unit', async () => {
    const cases = [
      ['water', 'ケース'],
      ['food', '箱'],
      ['blanket', '枚'],
      ['hygiene', 'セット'],
      ['portable_toilet', '台']
    ];

    for (const [supplyType, unit] of cases) {
      const result = await service.record('shelter-001', {
        ...validInput,
        supplyType,
        unit
      });
      assert.equal(result.supplyType, supplyType);
      assert.equal(result.unit, unit);
    }
  });

  it('rejects a unit outside the fixed choices', async () => {
    await assert.rejects(
      service.record('shelter-001', { ...validInput, unit: 'リットル' }),
      (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
    );
  });

  it('rejects occurredAt without a time and timezone', async () => {
    await assert.rejects(
      service.record('shelter-001', { ...validInput, occurredAt: '2026-08-14' }),
      (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
    );
  });
});

describe('POST /api/shelters/{id}/supplies', () => {
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
      return {
        outcome: 'recorded',
        supplyId: '42',
        updatedAt: input.occurredAt,
        updatedBy: input.updatedBy
      };
    }
  };

  before(async () => {
    server = createServer(createRequestHandler({
      logger: (level, category, fields) => logRecords.push({ level, category, ...fields }),
      supplyService: createSupplyService({ repository })
    }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  async function post(shelterId, body, requestId = 'supply-test') {
    return fetch(`${baseUrl}/api/shelters/${shelterId}/supplies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId
      },
      body: JSON.stringify(body)
    });
  }

  it('records a supply receipt without calculating inventory', async () => {
    const response = await post('shelter-001', validInput);
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-request-id'), 'supply-test');
    assert.equal(body.supplyId, '42');
    assert.equal(body.eventType, 'supply_received');
    assert.equal(body.shelterId, 'shelter-001');
    assert.equal(body.supplyType, 'blanket');
    assert.equal(body.quantity, 20);
    assert.equal(body.unit, '枚');
    assert.equal(body.updatedBy, 'demo-user-01');
    assert.equal('inventory' in body, false);
    assert.deepEqual(logRecords.at(-1), {
      level: 'INFO',
      category: 'api',
      requestId: 'supply-test',
      shelterId: 'shelter-001',
      eventType: 'supply_received',
      userId: 'demo-user-01',
      result: 'success'
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
});
