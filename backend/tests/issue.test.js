import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { evaluateIssueStatus } from '../src/domain/issue-status.js';
import { createIssueService } from '../src/services/issue-service.js';

const validInput = {
  category: 'power',
  severity: 'urgent',
  occurredAt: '2026-08-14T15:30:00+09:00',
  updatedBy: 'demo-user-01'
};

describe('issue status evaluation', () => {
  it('uses red when any latest category is urgent', () => {
    assert.equal(evaluateIssueStatus(['normal', 'urgent', 'caution'], 'gray'), 'red');
  });

  it('uses yellow when caution exists without urgent', () => {
    assert.equal(evaluateIssueStatus(['normal', 'caution'], 'green'), 'yellow');
  });

  it('restores the initial status when all latest categories are normal', () => {
    assert.equal(evaluateIssueStatus(['normal', 'normal'], 'gray'), 'gray');
  });
});

describe('issue validation', () => {
  const service = createIssueService({
    repository: {
      record: async (input) => ({
        outcome: 'recorded',
        issueId: '1',
        status: input.severity === 'urgent' ? 'red' : 'yellow',
        updatedAt: input.occurredAt,
        updatedBy: input.updatedBy
      })
    }
  });

  for (const category of ['', 'medical', null]) {
    it(`rejects invalid category: ${String(category)}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, category }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  for (const severity of ['', 'critical', null]) {
    it(`rejects invalid severity: ${String(severity)}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, severity }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  it('accepts every specified category and severity', async () => {
    const categories = [
      'toilet',
      'hygiene',
      'power',
      'water',
      'air_conditioning',
      'building',
      'other'
    ];
    const severities = ['normal', 'caution', 'urgent'];

    for (const category of categories) {
      for (const severity of severities) {
        const result = await service.record('shelter-001', {
          ...validInput,
          category,
          severity
        });
        assert.equal(result.category, category);
        assert.equal(result.severity, severity);
      }
    }
  });

  it('rejects occurredAt without a time and timezone', async () => {
    await assert.rejects(
      service.record('shelter-001', { ...validInput, occurredAt: '2026-08-14' }),
      (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
    );
  });
});

describe('POST /api/shelters/{id}/issues', () => {
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
        issueId: '42',
        status: 'red',
        updatedAt: input.occurredAt,
        updatedBy: input.updatedBy
      };
    }
  };

  before(async () => {
    server = createServer(createRequestHandler({
      logger: (level, category, fields) => logRecords.push({ level, category, ...fields }),
      issueService: createIssueService({ repository })
    }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  async function post(shelterId, body, requestId = 'issue-test') {
    return fetch(`${baseUrl}/api/shelters/${shelterId}/issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId
      },
      body: JSON.stringify(body)
    });
  }

  it('records an internal issue and returns the updated shelter status', async () => {
    const response = await post('shelter-001', validInput);
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-request-id'), 'issue-test');
    assert.equal(body.issueId, '42');
    assert.equal(body.eventType, 'issue_update');
    assert.equal(body.shelterId, 'shelter-001');
    assert.equal(body.category, 'power');
    assert.equal(body.severity, 'urgent');
    assert.equal(body.shelterStatus, 'red');
    assert.equal(body.updatedBy, 'demo-user-01');
    assert.equal('isPublic' in body, false);
    assert.deepEqual(logRecords.at(-1), {
      level: 'INFO',
      category: 'api',
      requestId: 'issue-test',
      shelterId: 'shelter-001',
      eventType: 'issue_update',
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
