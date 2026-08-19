import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, pool } from '../src/db/pool.js';
import { visitorChangeRepository } from '../src/repositories/visitor-change-repository.js';
import { createVisitorChangeService } from '../src/services/visitor-change-service.js';

describe('visitor-change PostgreSQL rollback', () => {
  const targetShelterId = 'shelter-002';
  const triggerName = 'rollback_test_shelter_status_update';
  const functionName = 'rollback_test_fail_shelter_status_update';
  const service = createVisitorChangeService({ repository: visitorChangeRepository });
  let beforeState;

  before(async () => {
    const stateResult = await pool.query(`
      SELECT
        ss.current_count AS "currentCount",
        COUNT(e.id)::integer AS "eventCount"
      FROM shelter_status ss
      LEFT JOIN events e ON e.shelter_id = ss.shelter_id
      WHERE ss.shelter_id = $1
      GROUP BY ss.current_count
    `, [targetShelterId]);
    beforeState = stateResult.rows[0];

    await pool.query(`
      CREATE OR REPLACE FUNCTION ${functionName}()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.shelter_id = '${targetShelterId}' THEN
          RAISE EXCEPTION 'rollback test injected failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await pool.query(`
      CREATE TRIGGER ${triggerName}
      BEFORE UPDATE ON shelter_status
      FOR EACH ROW
      EXECUTE FUNCTION ${functionName}()
    `);
  });

  after(async () => {
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON shelter_status`);
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    await closePool();
  });

  it('rolls back the preceding event insert when the status update fails', async () => {
    await assert.rejects(
      service.record(targetShelterId, {
        delta: 5,
        occurredAt: '2026-08-14T14:10:00+09:00',
        updatedBy: 'demo-user-01'
      }),
      (error) => error?.code === 'P0001'
    );

    const afterResult = await pool.query(`
      SELECT
        ss.current_count AS "currentCount",
        COUNT(e.id)::integer AS "eventCount"
      FROM shelter_status ss
      LEFT JOIN events e ON e.shelter_id = ss.shelter_id
      WHERE ss.shelter_id = $1
      GROUP BY ss.current_count
    `, [targetShelterId]);

    assert.deepEqual(afterResult.rows[0], beforeState);
  });
});
