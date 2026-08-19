import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, pool } from '../src/db/pool.js';
import { supplyRepository } from '../src/repositories/supply-repository.js';
import { createSupplyService } from '../src/services/supply-service.js';

describe('supply PostgreSQL transaction', () => {
  const targetShelterId = 'shelter-004';
  const otherShelterId = 'shelter-002';
  const service = createSupplyService({ repository: supplyRepository });
  let eventId;
  let supplyId;
  let originalTarget;
  let originalOther;

  before(async () => {
    const result = await pool.query(`
      SELECT shelter_id, current_count, confidence, updated_at, updated_by
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
    if (supplyId) {
      await pool.query('DELETE FROM supplies WHERE id = $1', [supplyId]);
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

  it('writes the receipt and event while preserving counts and another shelter', async () => {
    const result = await service.record(targetShelterId, {
      supplyType: 'blanket',
      quantity: 20,
      unit: '枚',
      occurredAt: '2026-08-14T16:00:00+09:00',
      updatedBy: 'demo-user-01'
    });
    eventId = result.eventId;
    supplyId = result.supplyId;

    const supply = await pool.query(`
      SELECT shelter_id, supply_type, quantity, unit, occurred_at, updated_by
      FROM supplies WHERE id = $1
    `, [supplyId]);
    assert.equal(supply.rowCount, 1);
    assert.deepEqual(supply.rows[0], {
      shelter_id: targetShelterId,
      supply_type: 'blanket',
      quantity: 20,
      unit: '枚',
      occurred_at: new Date('2026-08-14T07:00:00.000Z'),
      updated_by: 'demo-user-01'
    });

    const event = await pool.query(`
      SELECT event_type, shelter_id, payload, status
      FROM events WHERE id = $1
    `, [eventId]);
    assert.equal(event.rowCount, 1);
    assert.equal(event.rows[0].event_type, 'supply_received');
    assert.equal(event.rows[0].shelter_id, targetShelterId);
    assert.deepEqual(event.rows[0].payload, {
      supplyType: 'blanket',
      quantity: 20,
      unit: '枚'
    });
    assert.equal(event.rows[0].status, 'accepted');

    const targetAfter = await pool.query(`
      SELECT current_count, confidence, updated_at, updated_by
      FROM shelter_status WHERE shelter_id = $1
    `, [targetShelterId]);
    assert.equal(targetAfter.rows[0].current_count, originalTarget.current_count);
    assert.equal(targetAfter.rows[0].confidence, originalTarget.confidence);
    assert.equal(targetAfter.rows[0].updated_at.toISOString(), '2026-08-14T07:00:00.000Z');
    assert.equal(targetAfter.rows[0].updated_by, 'demo-user-01');

    const otherAfter = await pool.query(`
      SELECT current_count, confidence, updated_at, updated_by
      FROM shelter_status WHERE shelter_id = $1
    `, [otherShelterId]);
    assert.deepEqual(otherAfter.rows[0], {
      current_count: originalOther.current_count,
      confidence: originalOther.confidence,
      updated_at: originalOther.updated_at,
      updated_by: originalOther.updated_by
    });
  });
});
