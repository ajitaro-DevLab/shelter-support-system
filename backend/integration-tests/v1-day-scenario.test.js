import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, pool } from '../src/db/pool.js';
import { confirmationRepository } from '../src/repositories/confirmation-repository.js';
import { issueRepository } from '../src/repositories/issue-repository.js';
import { noticeRepository } from '../src/repositories/notice-repository.js';
import { shelterRepository } from '../src/repositories/shelter-repository.js';
import { supplyRepository } from '../src/repositories/supply-repository.js';
import { visitorChangeRepository } from '../src/repositories/visitor-change-repository.js';
import { createConfirmationService } from '../src/services/confirmation-service.js';
import { createIssueService } from '../src/services/issue-service.js';
import { createNoticeService } from '../src/services/notice-service.js';
import { createShelterDetailService } from '../src/services/shelter-detail-service.js';
import { createSupplyService } from '../src/services/supply-service.js';
import { createVisitorChangeService } from '../src/services/visitor-change-service.js';

describe('V1 nine-event PostgreSQL day scenario', () => {
  const targetShelterId = 'shelter-002';
  const otherShelterId = 'shelter-004';
  const updatedBy = 'demo-user-01';
  const eventIds = [];
  const confirmationIds = [];
  const supplyIds = [];
  const issueIds = [];
  const noticeIds = [];
  const confirmationService = createConfirmationService({ repository: confirmationRepository });
  const issueService = createIssueService({ repository: issueRepository });
  const noticeService = createNoticeService({ repository: noticeRepository });
  const supplyService = createSupplyService({ repository: supplyRepository });
  const visitorService = createVisitorChangeService({ repository: visitorChangeRepository });
  const detailService = createShelterDetailService({
    repository: shelterRepository,
    now: () => new Date('2026-08-14T18:01:00+09:00')
  });
  let originalTarget;
  let originalOther;

  before(async () => {
    const result = await pool.query(`
      SELECT
        shelter_id,
        current_count,
        confirmed_count,
        confirmed_at,
        confirmation_slot,
        status,
        confidence,
        updated_at,
        updated_by
      FROM shelter_status
      WHERE shelter_id IN ($1, $2)
      ORDER BY shelter_id
    `, [targetShelterId, otherShelterId]);
    originalTarget = result.rows.find((row) => row.shelter_id === targetShelterId);
    originalOther = result.rows.find((row) => row.shelter_id === otherShelterId);
  });

  after(async () => {
    for (const eventId of eventIds) await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
    for (const id of confirmationIds) await pool.query('DELETE FROM confirmations WHERE id = $1', [id]);
    for (const id of supplyIds) await pool.query('DELETE FROM supplies WHERE id = $1', [id]);
    for (const id of issueIds) await pool.query('DELETE FROM issues WHERE id = $1', [id]);
    for (const id of noticeIds) await pool.query('DELETE FROM notices WHERE id = $1', [id]);
    if (originalTarget) {
      await pool.query(`
        UPDATE shelter_status
        SET
          current_count = $2,
          confirmed_count = $3,
          confirmed_at = $4,
          confirmation_slot = $5,
          status = $6,
          confidence = $7,
          updated_at = $8,
          updated_by = $9
        WHERE shelter_id = $1
      `, [
        originalTarget.shelter_id,
        originalTarget.current_count,
        originalTarget.confirmed_count,
        originalTarget.confirmed_at,
        originalTarget.confirmation_slot,
        originalTarget.status,
        originalTarget.confidence,
        originalTarget.updated_at,
        originalTarget.updated_by
      ]);
    }
    await closePool();
  });

  function remember(result) {
    eventIds.push(result.eventId);
    if (result.confirmationId) confirmationIds.push(result.confirmationId);
    if (result.supplyId) supplyIds.push(result.supplyId);
    if (result.issueId) issueIds.push(result.issueId);
    if (result.noticeId) noticeIds.push(result.noticeId);
    return result;
  }

  it('reaches the fixed V1 final state without changing another shelter', async () => {
    remember(await confirmationService.record(targetShelterId, {
      mode: 'correction', confirmedCount: 93, confirmationSlot: '09:00',
      occurredAt: '2026-08-14T09:00:00+09:00', updatedBy
    }));
    remember(await visitorService.record(targetShelterId, {
      delta: 5, occurredAt: '2026-08-14T09:40:00+09:00', updatedBy
    }));
    remember(await supplyService.record(targetShelterId, {
      supplyType: 'water', quantity: 10, unit: 'ケース',
      occurredAt: '2026-08-14T10:20:00+09:00', updatedBy
    }));
    remember(await issueService.record(targetShelterId, {
      category: 'toilet', severity: 'caution',
      occurredAt: '2026-08-14T11:15:00+09:00', updatedBy
    }));
    remember(await noticeService.record(targetShelterId, {
      title: '給水', startTime: '14:00', location: '体育館東側',
      body: '14:00より給水を開始します', isPublic: true,
      occurredAt: '2026-08-14T12:00:00+09:00', updatedBy
    }));
    remember(await confirmationService.record(targetShelterId, {
      mode: 'unchanged', confirmedCount: 98, confirmationSlot: '13:00',
      occurredAt: '2026-08-14T13:00:00+09:00', updatedBy
    }));
    remember(await issueService.record(targetShelterId, {
      category: 'hygiene', severity: 'urgent',
      occurredAt: '2026-08-14T15:30:00+09:00', updatedBy
    }));
    remember(await supplyService.record(targetShelterId, {
      supplyType: 'blanket', quantity: 20, unit: '枚',
      occurredAt: '2026-08-14T17:20:00+09:00', updatedBy
    }));
    remember(await confirmationService.record(targetShelterId, {
      mode: 'correction', confirmedCount: 96, confirmationSlot: '18:00',
      occurredAt: '2026-08-14T18:00:00+09:00', updatedBy
    }));

    const statusResult = await pool.query(`
      SELECT
        current_count,
        confirmed_count,
        confirmed_at,
        to_char(confirmation_slot, 'HH24:MI') AS confirmation_slot,
        status,
        confidence,
        updated_by
      FROM shelter_status
      WHERE shelter_id = $1
    `, [targetShelterId]);
    assert.deepEqual(statusResult.rows[0], {
      current_count: 96,
      confirmed_count: 96,
      confirmed_at: new Date('2026-08-14T09:00:00.000Z'),
      confirmation_slot: '18:00',
      status: 'red',
      confidence: 'confirmed',
      updated_by: updatedBy
    });

    const detail = await detailService.get(targetShelterId);
    assert.equal(detail.currentCount, 96);
    assert.equal(detail.confirmedCount, 96);
    assert.equal(detail.confirmationSlot, '18:00');
    assert.equal(detail.confidence, 'confirmed');
    const { occurredAt: latestSupplyOccurredAt, ...latestSupply } = detail.latestSupply;
    assert.deepEqual(latestSupply, {
      supplyId: String(supplyIds.at(-1)),
      supplyType: 'blanket',
      quantity: 20,
      unit: '枚',
      updatedBy
    });
    assert.equal(new Date(latestSupplyOccurredAt).toISOString(), '2026-08-14T08:20:00.000Z');
    assert.equal(detail.latestIssue.category, 'hygiene');
    assert.equal(detail.latestIssue.severity, 'urgent');
    assert.equal(detail.history.length, 3);

    const publicNotices = await noticeService.list(targetShelterId, { publicOnly: true });
    assert.equal(publicNotices.length, 1);
    assert.equal(publicNotices[0].title, '給水');
    assert.equal(publicNotices[0].isPublic, true);

    const events = await pool.query(`
      SELECT event_type
      FROM events
      WHERE id = ANY($1::text[])
      ORDER BY occurred_at
    `, [eventIds]);
    assert.equal(events.rowCount, 9);
    assert.deepEqual(events.rows.map((row) => row.event_type), [
      'confirmation',
      'visitor_change',
      'supply_received',
      'issue_update',
      'notice_update',
      'confirmation',
      'issue_update',
      'supply_received',
      'confirmation'
    ]);

    const otherAfter = await pool.query(`
      SELECT
        shelter_id,
        current_count,
        confirmed_count,
        confirmed_at,
        confirmation_slot,
        status,
        confidence,
        updated_at,
        updated_by
      FROM shelter_status
      WHERE shelter_id = $1
    `, [otherShelterId]);
    assert.deepEqual(otherAfter.rows[0], originalOther);
  });
});
