import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { getConfirmationSchedule } from '../src/domain/confirmation-schedule.js';
import { createConfirmationService } from '../src/services/confirmation-service.js';

const validInput = {
  mode: 'unchanged',
  confirmedCount: 128,
  confirmationSlot: '09:00',
  occurredAt: '2026-08-14T09:05:00+09:00',
  updatedBy: 'demo-user-01'
};

describe('confirmation schedule', () => {
  it('uses the previous 18:00 slot before 09:00 in Japan', () => {
    assert.deepEqual(
      getConfirmationSchedule(new Date('2026-08-14T08:30:00+09:00')),
      { currentSlot: '18:00', nextSlot: '09:00', nextDay: false }
    );
  });

  it('selects the 09:00 slot from 09:00 through 12:59', () => {
    assert.deepEqual(
      getConfirmationSchedule(new Date('2026-08-14T10:30:00+09:00')),
      { currentSlot: '09:00', nextSlot: '13:00', nextDay: false }
    );
  });

  it('selects the 13:00 slot from 13:00 through 17:59', () => {
    assert.deepEqual(
      getConfirmationSchedule(new Date('2026-08-14T14:20:00+09:00')),
      { currentSlot: '13:00', nextSlot: '18:00', nextDay: false }
    );
  });

  it('selects the 18:00 slot and next-day 09:00 after 18:00', () => {
    assert.deepEqual(
      getConfirmationSchedule(new Date('2026-08-14T18:30:00+09:00')),
      { currentSlot: '18:00', nextSlot: '09:00', nextDay: true }
    );
  });
});

describe('confirmation validation', () => {
  const service = createConfirmationService({
    repository: {
      record: async () => ({
        outcome: 'recorded',
        confirmationId: '1',
        currentCount: 128,
        confirmedCount: 128,
        confirmedAt: '2026-08-14T00:05:00.000Z',
        confirmationSlot: '09:00',
        confidence: 'confirmed',
        updatedAt: '2026-08-14T00:05:00.000Z',
        updatedBy: 'demo-user-01'
      })
    }
  });

  for (const mode of ['', 'other', null]) {
    it(`rejects invalid mode: ${String(mode)}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, mode }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  for (const confirmedCount of [-1, 1.5, '128', null]) {
    it(`rejects invalid confirmedCount: ${String(confirmedCount)}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, confirmedCount }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  it('rejects a confirmation slot that does not match occurredAt', async () => {
    await assert.rejects(
      service.record('shelter-001', { ...validInput, confirmationSlot: '13:00' }),
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

describe('POST /api/shelters/{id}/confirmations', () => {
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
      if (input.mode === 'unchanged' && input.confirmedCount !== 128) {
        return { outcome: 'mode_count_mismatch' };
      }
      if (input.mode === 'delta' && ![-10, -5, -1, 1, 5, 10].includes(input.confirmedCount - 128)) {
        return { outcome: 'mode_count_mismatch' };
      }
      return {
        outcome: 'recorded',
        confirmationId: '42',
        currentCount: input.confirmedCount,
        confirmedCount: input.confirmedCount,
        confirmedAt: input.occurredAt,
        confirmationSlot: input.confirmationSlot,
        confidence: 'confirmed',
        updatedAt: input.occurredAt,
        updatedBy: input.updatedBy
      };
    }
  };

  before(async () => {
    server = createServer(createRequestHandler({
      logger: (level, category, fields) => logRecords.push({ level, category, ...fields }),
      confirmationService: createConfirmationService({ repository })
    }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  async function post(shelterId, body, requestId = 'confirmation-test') {
    return fetch(`${baseUrl}/api/shelters/${shelterId}/confirmations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId
      },
      body: JSON.stringify(body)
    });
  }

  it('records a formal confirmation', async () => {
    const response = await post('shelter-001', validInput);
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-request-id'), 'confirmation-test');
    assert.equal(body.confirmationId, '42');
    assert.equal(body.eventType, 'confirmation');
    assert.equal(body.currentCount, 128);
    assert.equal(body.confirmedCount, 128);
    assert.equal(body.confirmationSlot, '09:00');
    assert.equal(body.confidence, 'confirmed');
    assert.deepEqual(logRecords.at(-1), {
      level: 'INFO',
      category: 'api',
      requestId: 'confirmation-test',
      shelterId: 'shelter-001',
      eventType: 'confirmation',
      userId: 'demo-user-01',
      result: 'success'
    });
  });

  it('rejects unchanged mode when the count differs', async () => {
    const response = await post('shelter-001', {
      ...validInput,
      confirmedCount: 130
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects delta mode outside the fixed increment choices', async () => {
    const response = await post('shelter-001', {
      ...validInput,
      mode: 'delta',
      confirmedCount: 130
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
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
