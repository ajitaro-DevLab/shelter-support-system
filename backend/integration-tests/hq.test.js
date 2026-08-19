import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, pool } from '../src/db/pool.js';
import { confirmationRepository } from '../src/repositories/confirmation-repository.js';
import { shelterRepository } from '../src/repositories/shelter-repository.js';
import { visitorChangeRepository } from '../src/repositories/visitor-change-repository.js';
import { createConfirmationService } from '../src/services/confirmation-service.js';
import { createHqService } from '../src/services/hq-service.js';
import { createVisitorChangeService } from '../src/services/visitor-change-service.js';

describe('HQ shelter list PostgreSQL aggregation', () => {
  const confirmedShelterId = 'shelter-001';
  const estimatedShelterId = 'shelter-002';
  const untouchedShelterId = 'shelter-003';
  const eventIds = [];
  const confirmationIds = [];
  const confirmationService = createConfirmationService({ repository: confirmationRepository });
  const visitorChangeService = createVisitorChangeService({ repository: visitorChangeRepository });
  let currentTime = '2026-08-14T14:20:00+09:00';
  const hqService = createHqService({
    repository: shelterRepository,
    now: () => new Date(currentTime)
  });
  let originalConfirmed;
  let originalEstimated;
  let originalUntouched;

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
      WHERE shelter_id = ANY($1::text[])
      ORDER BY shelter_id
    `, [[confirmedShelterId, estimatedShelterId, untouchedShelterId]]);
    originalConfirmed = result.rows.find((row) => row.shelter_id === confirmedShelterId);
    originalEstimated = result.rows.find((row) => row.shelter_id === estimatedShelterId);
    originalUntouched = result.rows.find((row) => row.shelter_id === untouchedShelterId);

    const confirmed = await confirmationService.record(confirmedShelterId, {
      mode: 'unchanged',
      confirmedCount: originalConfirmed.current_count,
      confirmationSlot: '13:00',
      occurredAt: '2026-08-14T13:02:00+09:00',
      updatedBy: 'demo-user-01'
    });
    eventIds.push(confirmed.eventId);
    confirmationIds.push(confirmed.confirmationId);

    const estimatedConfirmation = await confirmationService.record(estimatedShelterId, {
      mode: 'unchanged',
      confirmedCount: originalEstimated.current_count,
      confirmationSlot: '13:00',
      occurredAt: '2026-08-14T13:03:00+09:00',
      updatedBy: 'demo-user-01'
    });
    eventIds.push(estimatedConfirmation.eventId);
    confirmationIds.push(estimatedConfirmation.confirmationId);

    const visitorChange = await visitorChangeService.record(estimatedShelterId, {
      delta: 1,
      occurredAt: '2026-08-14T14:10:00+09:00',
      updatedBy: 'demo-hq-01'
    });
    eventIds.push(visitorChange.eventId);
  });

  after(async () => {
    if (eventIds.length > 0) {
      await pool.query('DELETE FROM events WHERE id = ANY($1::text[])', [eventIds]);
    }
    for (const confirmationId of confirmationIds) {
      await pool.query('DELETE FROM confirmations WHERE id = $1', [confirmationId]);
    }

    for (const original of [originalConfirmed, originalEstimated]) {
      if (!original) continue;
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
        original.shelter_id,
        original.current_count,
        original.confirmed_count,
        original.confirmed_at,
        original.confirmation_slot,
        original.status,
        original.confidence,
        original.updated_at,
        original.updated_by
      ]);
    }
    await closePool();
  });

  it('returns five shelters with confidence and freshness derived per shelter', async () => {
    const shelters = await hqService.list();
    const confirmed = shelters.find((shelter) => shelter.shelterId === confirmedShelterId);
    const estimated = shelters.find((shelter) => shelter.shelterId === estimatedShelterId);
    const untouched = shelters.find((shelter) => shelter.shelterId === untouchedShelterId);

    assert.equal(shelters.length, 5);
    assert.equal(confirmed.currentCount, originalConfirmed.current_count);
    assert.equal(confirmed.confirmedCount, originalConfirmed.current_count);
    assert.equal(confirmed.confidence, 'confirmed');
    assert.deepEqual(confirmed.freshness, {
      level: 'yellow',
      elapsedMinutes: 78,
      display: '1時間前',
      delayed: true
    });

    assert.equal(estimated.currentCount, originalEstimated.current_count + 1);
    assert.equal(estimated.confirmedCount, originalEstimated.current_count);
    assert.equal(estimated.confidence, 'estimated');
    assert.equal(estimated.freshness.elapsedMinutes, 77);
    assert.equal(estimated.freshness.level, 'yellow');
    assert.equal(estimated.updatedBy, 'demo-hq-01');

    assert.equal(untouched.confidence, 'unconfirmed');
    assert.equal(untouched.freshness.level, 'black');
    assert.equal(untouched.freshness.elapsedMinutes, null);
    assert.equal('confirmationSlot' in confirmed, false);
  });

  it('shows a missed new slot without changing stored confidence or another shelter', async () => {
    currentTime = '2026-08-14T18:30:00+09:00';
    const shelters = await hqService.list();

    assert.equal(
      shelters.find((shelter) => shelter.shelterId === confirmedShelterId).confidence,
      'unconfirmed'
    );
    assert.equal(
      shelters.find((shelter) => shelter.shelterId === estimatedShelterId).confidence,
      'unconfirmed'
    );

    const stored = await pool.query(`
      SELECT shelter_id, confidence
      FROM shelter_status
      WHERE shelter_id = ANY($1::text[])
      ORDER BY shelter_id
    `, [[confirmedShelterId, estimatedShelterId]]);
    assert.deepEqual(stored.rows, [
      { shelter_id: confirmedShelterId, confidence: 'confirmed' },
      { shelter_id: estimatedShelterId, confidence: 'estimated' }
    ]);

    const untouchedAfter = await pool.query(`
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
    `, [untouchedShelterId]);
    assert.deepEqual(untouchedAfter.rows[0], originalUntouched);
  });
});
