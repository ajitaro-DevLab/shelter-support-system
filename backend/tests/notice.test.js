import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { createNoticeService } from '../src/services/notice-service.js';

const validInput = {
  title: '給水',
  startTime: '14:00',
  location: '体育館東側',
  body: '14:00より給水を開始します',
  isPublic: true,
  occurredAt: '2026-08-14T13:55:00+09:00',
  updatedBy: 'demo-user-01'
};

function createValidationService() {
  return createNoticeService({
    repository: {
      record: async (input) => ({
        outcome: 'recorded',
        noticeId: '1',
        updatedAt: input.occurredAt,
        updatedBy: input.updatedBy
      })
    }
  });
}

describe('notice validation', () => {
  const service = createValidationService();

  for (const title of ['', 'あ'.repeat(31), null]) {
    it(`rejects invalid title length: ${String(title).length}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, title }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  for (const location of ['', 'あ'.repeat(41), null]) {
    it(`rejects invalid location length: ${String(location).length}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, location }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  for (const body of ['', 'あ'.repeat(101), null]) {
    it(`rejects invalid body length: ${String(body).length}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, body }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  for (const startTime of ['', '9:00', '24:00', '14:60', null]) {
    it(`rejects invalid startTime: ${String(startTime)}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, startTime }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  for (const isPublic of ['', 'true', null, undefined]) {
    it(`rejects non-boolean isPublic: ${String(isPublic)}`, async () => {
      await assert.rejects(
        service.record('shelter-001', { ...validInput, isPublic }),
        (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
      );
    });
  }

  it('accepts boundary text lengths and private visibility', async () => {
    const result = await service.record('shelter-001', {
      ...validInput,
      title: 'あ'.repeat(30),
      location: 'い'.repeat(40),
      body: 'う'.repeat(100),
      isPublic: false
    });

    assert.equal(result.title.length, 30);
    assert.equal(result.location.length, 40);
    assert.equal(result.body.length, 100);
    assert.equal(result.isPublic, false);
  });

  it('rejects occurredAt without a time and timezone', async () => {
    await assert.rejects(
      service.record('shelter-001', { ...validInput, occurredAt: '2026-08-14' }),
      (error) => error.statusCode === 400 && error.errorCode === 'VALIDATION_ERROR'
    );
  });
});

describe('GET and POST /api/shelters/{id}/notices', () => {
  let baseUrl;
  let server;
  const logRecords = [];
  const storedNotices = [
    {
      id: '10',
      shelterId: 'shelter-001',
      title: '非公開連絡',
      startTime: '13:00',
      location: '運営本部',
      body: '内部確認中です',
      isPublic: false,
      occurredAt: new Date('2026-08-14T03:00:00.000Z'),
      updatedBy: 'demo-user-01',
      createdAt: new Date('2026-08-14T03:00:01.000Z')
    },
    {
      id: '11',
      shelterId: 'shelter-001',
      title: '給水',
      startTime: '14:00',
      location: '体育館東側',
      body: '14:00より給水を開始します',
      isPublic: true,
      occurredAt: new Date('2026-08-14T04:55:00.000Z'),
      updatedBy: 'demo-user-01',
      createdAt: new Date('2026-08-14T04:55:01.000Z')
    }
  ];
  const repository = {
    async list({ shelterId, publicOnly }) {
      if (shelterId === 'missing-shelter') return { outcome: 'shelter_not_found' };
      return {
        outcome: 'listed',
        notices: storedNotices.filter((notice) => !publicOnly || notice.isPublic)
      };
    },
    async record(input) {
      if (input.shelterId === 'missing-shelter') return { outcome: 'shelter_not_found' };
      if (input.updatedBy === 'missing-user') return { outcome: 'user_not_found' };
      return {
        outcome: 'recorded',
        noticeId: '42',
        updatedAt: input.occurredAt,
        updatedBy: input.updatedBy
      };
    }
  };

  before(async () => {
    server = createServer(createRequestHandler({
      logger: (level, category, fields) => logRecords.push({ level, category, ...fields }),
      noticeService: createNoticeService({ repository })
    }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('returns all notices for internal use', async () => {
    const response = await fetch(`${baseUrl}/api/shelters/shelter-001/notices`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.length, 2);
    assert.equal(body.some((notice) => notice.isPublic === false), true);
  });

  it('returns only public notices when public=true', async () => {
    const response = await fetch(`${baseUrl}/api/shelters/shelter-001/notices?public=true`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].noticeId, '11');
    assert.equal(body[0].isPublic, true);
    assert.equal('id' in body[0], false);
  });

  it('records a public notice and its event context', async () => {
    const response = await fetch(`${baseUrl}/api/shelters/shelter-001/notices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': 'notice-test'
      },
      body: JSON.stringify(validInput)
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.noticeId, '42');
    assert.equal(body.eventType, 'notice_update');
    assert.equal(body.isPublic, true);
    assert.deepEqual(logRecords.at(-1), {
      level: 'INFO',
      category: 'api',
      requestId: 'notice-test',
      shelterId: 'shelter-001',
      eventType: 'notice_update',
      userId: 'demo-user-01',
      result: 'success'
    });
  });

  it('returns 404 for a missing shelter', async () => {
    const response = await fetch(`${baseUrl}/api/shelters/missing-shelter/notices?public=true`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('returns 404 when posting to a missing shelter', async () => {
    const response = await fetch(`${baseUrl}/api/shelters/missing-shelter/notices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validInput)
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('rejects a missing update user', async () => {
    const response = await fetch(`${baseUrl}/api/shelters/shelter-001/notices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validInput, updatedBy: 'missing-user' })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });
});
