import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, pool } from '../src/db/pool.js';
import { confirmationRepository } from '../src/repositories/confirmation-repository.js';
import { shelterRepository } from '../src/repositories/shelter-repository.js';
import { visitorChangeRepository } from '../src/repositories/visitor-change-repository.js';
import { createConfirmationService } from '../src/services/confirmation-service.js';
import { createShelterDetailService } from '../src/services/shelter-detail-service.js';
import { createVisitorChangeService } from '../src/services/visitor-change-service.js';

describe('shelter detail PostgreSQL aggregation', () => {
  const targetShelterId = 'shelter-003';
  const otherShelterId = 'shelter-005';
  const eventIds = [
    'detail-test-event-1',
    'detail-test-event-2',
    'detail-test-event-3',
    'detail-test-event-4'
  ];
  const supplyIds = [];
  const issueIds = [];
  const confirmationService = createConfirmationService({ repository: confirmationRepository });
  const visitorChangeService = createVisitorChangeService({ repository: visitorChangeRepository });
  let currentTime = '2026-08-14T14:00:00+09:00';
  const detailService = createShelterDetailService({
    repository: shelterRepository,
    now: () => new Date(currentTime)
  });
  let confirmationId;
  let originalTarget;
  let originalOther;

  before(async () => {
    const statusResult = await pool.query(`
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
    originalTarget = statusResult.rows.find((row) => row.shelter_id === targetShelterId);
    originalOther = statusResult.rows.find((row) => row.shelter_id === otherShelterId);

    const supplyResult = await pool.query(`
      INSERT INTO supplies (
        shelter_id, supply_type, quantity, unit, occurred_at, updated_by
      ) VALUES
        ($1, 'water', 5, 'ケース', '2026-08-14T10:00:00+09:00', 'demo-user-01'),
        ($1, 'blanket', 20, '枚', '2026-08-14T14:00:00+09:00', 'demo-user-01')
      RETURNING id
    `, [targetShelterId]);
    supplyIds.push(...supplyResult.rows.map((row) => String(row.id)));

    const issueResult = await pool.query(`
      INSERT INTO issues (
        shelter_id, category, severity, occurred_at, updated_by
      ) VALUES
        ($1, 'water', 'caution', '2026-08-14T11:00:00+09:00', 'demo-user-01'),
        ($1, 'power', 'urgent', '2026-08-14T15:00:00+09:00', 'demo-user-01')
      RETURNING id
    `, [targetShelterId]);
    issueIds.push(...issueResult.rows.map((row) => String(row.id)));

    await pool.query(`
      INSERT INTO events (
        id, event_type, shelter_id, occurred_at, updated_by, payload, status
      ) VALUES
        ($1, 'visitor_change', $5, '2026-08-14T09:00:00+09:00', 'demo-user-01', '{"delta": 1}', 'accepted'),
        ($2, 'supply_received', $5, '2026-08-14T10:00:00+09:00', 'demo-user-01', '{"supplyType": "water"}', 'accepted'),
        ($3, 'issue_update', $5, '2026-08-14T11:00:00+09:00', 'demo-user-01', '{"category": "water"}', 'accepted'),
        ($4, 'notice_update', $5, '2026-08-14T12:00:00+09:00', 'demo-user-01', '{"title": "給水"}', 'accepted')
    `, [...eventIds, targetShelterId]);
  });

  after(async () => {
    await pool.query('DELETE FROM events WHERE id = ANY($1::text[])', [eventIds]);
    if (confirmationId) {
      await pool.query('DELETE FROM confirmations WHERE id = $1', [confirmationId]);
    }
    for (const supplyId of supplyIds) {
      await pool.query('DELETE FROM supplies WHERE id = $1', [supplyId]);
    }
    for (const issueId of issueIds) {
      await pool.query('DELETE FROM issues WHERE id = $1', [issueId]);
    }
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

  it('returns only the target shelter with latest records and three events', async () => {
    const detail = await shelterRepository.getDetail(targetShelterId);
    const other = await shelterRepository.getDetail(otherShelterId);
    const missing = await shelterRepository.getDetail('missing-shelter');

    assert.equal(detail.id, targetShelterId);
    assert.equal(detail.name, 'I市立Beta小学校');
    assert.equal(detail.currentCount, 174);
    assert.equal(detail.status, 'red');
    assert.equal(detail.confidence, 'estimated');
    assert.equal(detail.updatedBy, 'demo-user-01');
    assert.equal(detail.confirmedCount, null);
    assert.equal(detail.confirmedAt, null);
    assert.equal(detail.confirmationSlot, null);

    assert.equal(detail.latestSupply.supplyType, 'blanket');
    assert.equal(detail.latestSupply.quantity, 20);
    assert.equal(detail.latestSupply.unit, '枚');
    assert.equal(detail.latestIssue.category, 'power');
    assert.equal(detail.latestIssue.severity, 'urgent');

    assert.equal(detail.history.length, 3);
    assert.deepEqual(
      detail.history.map((event) => event.eventId),
      eventIds.slice(1).reverse()
    );
    assert.equal(detail.history.some((event) => event.eventId === eventIds[0]), false);

    assert.equal(other.id, otherShelterId);
    assert.equal(other.latestSupply, null);
    assert.equal(other.latestIssue, null);
    assert.deepEqual(other.history, []);
    assert.equal(missing, null);
  });

  it('derives display confidence without changing DB confidence or another shelter', async () => {
    const confirmation = await confirmationService.record(targetShelterId, {
      mode: 'unchanged',
      confirmedCount: originalTarget.current_count,
      confirmationSlot: '13:00',
      occurredAt: '2026-08-14T13:02:00+09:00',
      updatedBy: 'demo-user-01'
    });
    confirmationId = confirmation.confirmationId;
    eventIds.push(confirmation.eventId);

    currentTime = '2026-08-14T14:00:00+09:00';
    const confirmedDetail = await detailService.get(targetShelterId);
    assert.equal(confirmedDetail.confidence, 'confirmed');

    const visitorChange = await visitorChangeService.record(targetShelterId, {
      delta: 1,
      occurredAt: '2026-08-14T14:10:00+09:00',
      updatedBy: 'demo-user-01'
    });
    eventIds.push(visitorChange.eventId);

    currentTime = '2026-08-14T14:20:00+09:00';
    const estimatedDetail = await detailService.get(targetShelterId);
    assert.equal(estimatedDetail.confidence, 'estimated');

    currentTime = '2026-08-14T18:30:00+09:00';
    const unconfirmedDetail = await detailService.get(targetShelterId);
    assert.equal(unconfirmedDetail.confidence, 'unconfirmed');

    const storedTarget = await pool.query(`
      SELECT confidence, to_char(confirmation_slot, 'HH24:MI') AS confirmation_slot, confirmed_at
      FROM shelter_status WHERE shelter_id = $1
    `, [targetShelterId]);
    assert.equal(storedTarget.rows[0].confidence, 'estimated');
    assert.equal(storedTarget.rows[0].confirmation_slot, '13:00');
    assert.equal(storedTarget.rows[0].confirmed_at.toISOString(), '2026-08-14T04:02:00.000Z');

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
      FROM shelter_status WHERE shelter_id = $1
    `, [otherShelterId]);
    assert.deepEqual(otherAfter.rows[0], originalOther);
  });
});
