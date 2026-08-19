import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, pool } from '../src/db/pool.js';
import { confirmationRepository } from '../src/repositories/confirmation-repository.js';
import { createConfirmationService } from '../src/services/confirmation-service.js';

describe('confirmation PostgreSQL transaction', () => {
  const targetShelterId = 'shelter-003';
  const otherShelterId = 'shelter-002';
  const service = createConfirmationService({ repository: confirmationRepository });
  let eventId;
  let confirmationId;
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
    if (eventId) {
      await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
    }
    if (confirmationId) {
      await pool.query('DELETE FROM confirmations WHERE id = $1', [confirmationId]);
    }
    if (originalTarget) {
      await pool.query(`
        UPDATE shelter_status
        SET
          current_count = $2,
          confirmed_count = $3,
          confirmed_at = $4,
          confirmation_slot = $5,
          confidence = $6,
          updated_at = $7,
          updated_by = $8
        WHERE shelter_id = $1
      `, [
        originalTarget.shelter_id,
        originalTarget.current_count,
        originalTarget.confirmed_count,
        originalTarget.confirmed_at,
        originalTarget.confirmation_slot,
        originalTarget.confidence,
        originalTarget.updated_at,
        originalTarget.updated_by
      ]);
    }
    await closePool();
  });

  it('writes confirmation, event, and status while leaving another shelter unchanged', async () => {
    const confirmedCount = originalTarget.current_count + 2;
    const result = await service.record(targetShelterId, {
      mode: 'correction',
      confirmedCount,
      confirmationSlot: '09:00',
      occurredAt: '2026-08-14T09:05:00+09:00',
      updatedBy: 'demo-user-01'
    });
    eventId = result.eventId;
    confirmationId = result.confirmationId;

    assert.equal(result.currentCount, confirmedCount);
    assert.equal(result.confirmedCount, confirmedCount);
    assert.equal(result.confirmationSlot, '09:00');
    assert.equal(result.confidence, 'confirmed');

    const targetAfter = await pool.query(`
      SELECT
        current_count,
        confirmed_count,
        confirmed_at,
        to_char(confirmation_slot, 'HH24:MI') AS confirmation_slot,
        confidence,
        updated_at,
        updated_by
      FROM shelter_status WHERE shelter_id = $1
    `, [targetShelterId]);
    assert.equal(targetAfter.rows[0].current_count, confirmedCount);
    assert.equal(targetAfter.rows[0].confirmed_count, confirmedCount);
    assert.equal(targetAfter.rows[0].confirmed_at.toISOString(), '2026-08-14T00:05:00.000Z');
    assert.equal(targetAfter.rows[0].confirmation_slot, '09:00');
    assert.equal(targetAfter.rows[0].confidence, 'confirmed');
    assert.equal(targetAfter.rows[0].updated_at.toISOString(), '2026-08-14T00:05:00.000Z');
    assert.equal(targetAfter.rows[0].updated_by, 'demo-user-01');

    const confirmation = await pool.query(`
      SELECT
        shelter_id,
        to_char(confirmation_slot, 'HH24:MI') AS confirmation_slot,
        confirmed_count,
        confirmed_at,
        updated_by
      FROM confirmations WHERE id = $1
    `, [confirmationId]);
    assert.equal(confirmation.rowCount, 1);
    assert.equal(confirmation.rows[0].shelter_id, targetShelterId);
    assert.equal(confirmation.rows[0].confirmation_slot, '09:00');
    assert.equal(confirmation.rows[0].confirmed_count, confirmedCount);
    assert.equal(confirmation.rows[0].confirmed_at.toISOString(), '2026-08-14T00:05:00.000Z');
    assert.equal(confirmation.rows[0].updated_by, 'demo-user-01');

    const event = await pool.query(`
      SELECT event_type, shelter_id, payload, status
      FROM events WHERE id = $1
    `, [eventId]);
    assert.equal(event.rowCount, 1);
    assert.equal(event.rows[0].event_type, 'confirmation');
    assert.equal(event.rows[0].shelter_id, targetShelterId);
    assert.deepEqual(event.rows[0].payload, {
      mode: 'correction',
      total: confirmedCount,
      confirmationSlot: '09:00'
    });
    assert.equal(event.rows[0].status, 'accepted');

    const otherAfter = await pool.query(`
      SELECT
        current_count,
        confirmed_count,
        confirmed_at,
        confirmation_slot,
        confidence,
        updated_at,
        updated_by
      FROM shelter_status WHERE shelter_id = $1
    `, [otherShelterId]);
    assert.deepEqual(otherAfter.rows[0], {
      current_count: originalOther.current_count,
      confirmed_count: originalOther.confirmed_count,
      confirmed_at: originalOther.confirmed_at,
      confirmation_slot: originalOther.confirmation_slot,
      confidence: originalOther.confidence,
      updated_at: originalOther.updated_at,
      updated_by: originalOther.updated_by
    });
  });
});
