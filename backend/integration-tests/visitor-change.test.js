import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, pool } from '../src/db/pool.js';
import { visitorChangeRepository } from '../src/repositories/visitor-change-repository.js';
import { createVisitorChangeService } from '../src/services/visitor-change-service.js';

describe('visitor-change PostgreSQL transaction', () => {
  const targetShelterId = 'shelter-001';
  const otherShelterId = 'shelter-002';
  const service = createVisitorChangeService({ repository: visitorChangeRepository });
  let eventId;
  let originalTarget;
  let originalOther;

  before(async () => {
    const result = await pool.query(`
      SELECT shelter_id, current_count, confidence, updated_at, updated_by
      FROM shelter_status
      WHERE shelter_id IN ($1, $2)
      ORDER BY shelter_id
    `, [targetShelterId, otherShelterId]);
    [originalTarget, originalOther] = result.rows;
  });

  after(async () => {
    if (eventId) {
      await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
    }
    if (originalTarget) {
      await pool.query(`
        UPDATE shelter_status
        SET current_count = $2, confidence = $3, updated_at = $4, updated_by = $5
        WHERE shelter_id = $1
      `, [
        originalTarget.shelter_id,
        originalTarget.current_count,
        originalTarget.confidence,
        originalTarget.updated_at,
        originalTarget.updated_by
      ]);
    }
    await closePool();
  });

  it('updates one shelter and writes its event in the same operation', async () => {
    const occurredAt = '2026-08-14T09:15:00+09:00';
    const result = await service.record(targetShelterId, {
      delta: 10,
      occurredAt,
      updatedBy: 'demo-user-01'
    });
    eventId = result.eventId;

    assert.equal(result.currentCount, originalTarget.current_count + 10);
    assert.equal(result.confidence, 'estimated');

    const targetAfter = await pool.query(`
      SELECT current_count, confidence, updated_at, updated_by
      FROM shelter_status WHERE shelter_id = $1
    `, [targetShelterId]);
    assert.equal(targetAfter.rows[0].current_count, originalTarget.current_count + 10);
    assert.equal(targetAfter.rows[0].confidence, 'estimated');
    assert.equal(targetAfter.rows[0].updated_by, 'demo-user-01');
    assert.equal(targetAfter.rows[0].updated_at.toISOString(), '2026-08-14T00:15:00.000Z');

    const event = await pool.query(`
      SELECT event_type, shelter_id, occurred_at, updated_by, payload, status
      FROM events WHERE id = $1
    `, [eventId]);
    assert.equal(event.rowCount, 1);
    assert.equal(event.rows[0].event_type, 'visitor_change');
    assert.equal(event.rows[0].shelter_id, targetShelterId);
    assert.equal(event.rows[0].updated_by, 'demo-user-01');
    assert.deepEqual(event.rows[0].payload, {
      delta: 10,
      total: originalTarget.current_count + 10
    });
    assert.equal(event.rows[0].status, 'accepted');

    const otherAfter = await pool.query(`
      SELECT current_count, confidence, updated_at, updated_by
      FROM shelter_status WHERE shelter_id = $1
    `, [otherShelterId]);
    assert.equal(otherAfter.rows[0].current_count, originalOther.current_count);
    assert.equal(otherAfter.rows[0].confidence, originalOther.confidence);
    assert.equal(otherAfter.rows[0].updated_at.toISOString(), originalOther.updated_at.toISOString());
    assert.equal(otherAfter.rows[0].updated_by, originalOther.updated_by);
  });
});
