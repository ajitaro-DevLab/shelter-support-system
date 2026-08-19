import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, pool } from '../src/db/pool.js';
import { noticeRepository } from '../src/repositories/notice-repository.js';
import { createNoticeService } from '../src/services/notice-service.js';

describe('notice PostgreSQL transaction and publication filter', () => {
  const targetShelterId = 'shelter-002';
  const otherShelterId = 'shelter-005';
  const service = createNoticeService({ repository: noticeRepository });
  const eventIds = [];
  const noticeIds = [];
  let originalTarget;

  before(async () => {
    const result = await pool.query(`
      SELECT shelter_id, current_count, status, confidence, updated_at, updated_by
      FROM shelter_status
      WHERE shelter_id = $1
    `, [targetShelterId]);
    originalTarget = result.rows[0];
  });

  after(async () => {
    for (const eventId of eventIds) {
      await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
    }
    for (const noticeId of noticeIds) {
      await pool.query('DELETE FROM notices WHERE id = $1', [noticeId]);
    }
    if (originalTarget) {
      await pool.query(`
        UPDATE shelter_status
        SET updated_at = $2, updated_by = $3
        WHERE shelter_id = $1
      `, [originalTarget.shelter_id, originalTarget.updated_at, originalTarget.updated_by]);
    }
    await closePool();
  });

  async function record({ title, isPublic, occurredAt }) {
    const result = await service.record(targetShelterId, {
      title,
      startTime: '14:00',
      location: '体育館東側',
      body: `${title}の案内です`,
      isPublic,
      occurredAt,
      updatedBy: 'demo-user-01'
    });
    eventIds.push(result.eventId);
    noticeIds.push(result.noticeId);
    return result;
  }

  it('stores public and private notices atomically and filters public output', async () => {
    await record({
      title: '内部確認中',
      isPublic: false,
      occurredAt: '2026-08-14T13:50:00+09:00'
    });
    await record({
      title: '給水',
      isPublic: true,
      occurredAt: '2026-08-14T13:55:00+09:00'
    });

    const allNotices = await service.list(targetShelterId);
    const publicNotices = await service.list(targetShelterId, { publicOnly: true });
    const otherShelterNotices = await service.list(otherShelterId);

    assert.equal(allNotices.length, 2);
    assert.equal(publicNotices.length, 1);
    assert.equal(publicNotices[0].title, '給水');
    assert.equal(publicNotices[0].isPublic, true);
    assert.equal(otherShelterNotices.length, 0);

    const events = await pool.query(`
      SELECT event_type, shelter_id, payload, status
      FROM events
      WHERE id = ANY($1::text[])
      ORDER BY occurred_at
    `, [eventIds]);
    assert.equal(events.rowCount, 2);
    assert.ok(events.rows.every((row) => row.event_type === 'notice_update'));
    assert.ok(events.rows.every((row) => row.shelter_id === targetShelterId));
    assert.ok(events.rows.every((row) => row.status === 'accepted'));
    assert.equal(events.rows[0].payload.isPublic, false);
    assert.equal(events.rows[1].payload.isPublic, true);

    const targetAfter = await pool.query(`
      SELECT current_count, status, confidence, updated_at, updated_by
      FROM shelter_status WHERE shelter_id = $1
    `, [targetShelterId]);
    assert.deepEqual(targetAfter.rows[0], {
      current_count: originalTarget.current_count,
      status: originalTarget.status,
      confidence: originalTarget.confidence,
      updated_at: new Date('2026-08-14T04:55:00.000Z'),
      updated_by: 'demo-user-01'
    });
  });
});
