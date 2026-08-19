import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, pool } from '../src/db/pool.js';
import { issueRepository } from '../src/repositories/issue-repository.js';
import { createIssueService } from '../src/services/issue-service.js';

describe('issue PostgreSQL transaction', () => {
  const targetShelterId = 'shelter-005';
  const otherShelterId = 'shelter-002';
  const service = createIssueService({ repository: issueRepository });
  const eventIds = [];
  const issueIds = [];
  let originalTarget;
  let originalOther;

  before(async () => {
    const result = await pool.query(`
      SELECT shelter_id, current_count, status, confidence, updated_at, updated_by
      FROM shelter_status
      WHERE shelter_id IN ($1, $2)
      ORDER BY shelter_id
    `, [targetShelterId, otherShelterId]);
    originalTarget = result.rows.find((row) => row.shelter_id === targetShelterId);
    originalOther = result.rows.find((row) => row.shelter_id === otherShelterId);
  });

  after(async () => {
    for (const eventId of eventIds) {
      await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
    }
    for (const issueId of issueIds) {
      await pool.query('DELETE FROM issues WHERE id = $1', [issueId]);
    }
    if (originalTarget) {
      await pool.query(`
        UPDATE shelter_status
        SET status = $2, updated_at = $3, updated_by = $4
        WHERE shelter_id = $1
      `, [
        originalTarget.shelter_id,
        originalTarget.status,
        originalTarget.updated_at,
        originalTarget.updated_by
      ]);
    }
    await closePool();
  });

  async function record(category, severity, occurredAt) {
    const result = await service.record(targetShelterId, {
      category,
      severity,
      occurredAt,
      updatedBy: 'demo-user-01'
    });
    eventIds.push(result.eventId);
    issueIds.push(result.issueId);
    return result;
  }

  it('evaluates latest category states and leaves another shelter unchanged', async () => {
    const caution = await record('toilet', 'caution', '2026-08-14T11:15:00+09:00');
    assert.equal(caution.shelterStatus, 'yellow');

    const urgent = await record('hygiene', 'urgent', '2026-08-14T15:30:00+09:00');
    assert.equal(urgent.shelterStatus, 'red');

    const urgentResolved = await record('hygiene', 'normal', '2026-08-14T16:00:00+09:00');
    assert.equal(urgentResolved.shelterStatus, 'yellow');

    const allResolved = await record('toilet', 'normal', '2026-08-14T16:30:00+09:00');
    assert.equal(allResolved.shelterStatus, 'gray');

    const issues = await pool.query(`
      SELECT category, severity, occurred_at, updated_by
      FROM issues
      WHERE id = ANY($1::bigint[])
      ORDER BY occurred_at
    `, [issueIds]);
    assert.equal(issues.rowCount, 4);
    assert.deepEqual(
      issues.rows.map(({ category, severity }) => ({ category, severity })),
      [
        { category: 'toilet', severity: 'caution' },
        { category: 'hygiene', severity: 'urgent' },
        { category: 'hygiene', severity: 'normal' },
        { category: 'toilet', severity: 'normal' }
      ]
    );
    assert.ok(issues.rows.every((row) => row.updated_by === 'demo-user-01'));

    const events = await pool.query(`
      SELECT event_type, shelter_id, payload, status
      FROM events
      WHERE id = ANY($1::text[])
      ORDER BY occurred_at
    `, [eventIds]);
    assert.equal(events.rowCount, 4);
    assert.ok(events.rows.every((row) => row.event_type === 'issue_update'));
    assert.ok(events.rows.every((row) => row.shelter_id === targetShelterId));
    assert.ok(events.rows.every((row) => row.status === 'accepted'));
    assert.deepEqual(events.rows.at(-1).payload, {
      category: 'toilet',
      severity: 'normal'
    });

    const targetAfter = await pool.query(`
      SELECT current_count, status, confidence, updated_at, updated_by
      FROM shelter_status WHERE shelter_id = $1
    `, [targetShelterId]);
    assert.deepEqual(targetAfter.rows[0], {
      current_count: originalTarget.current_count,
      status: 'gray',
      confidence: originalTarget.confidence,
      updated_at: new Date('2026-08-14T07:30:00.000Z'),
      updated_by: 'demo-user-01'
    });

    const otherAfter = await pool.query(`
      SELECT current_count, status, confidence, updated_at, updated_by
      FROM shelter_status WHERE shelter_id = $1
    `, [otherShelterId]);
    assert.deepEqual(otherAfter.rows[0], {
      current_count: originalOther.current_count,
      status: originalOther.status,
      confidence: originalOther.confidence,
      updated_at: originalOther.updated_at,
      updated_by: originalOther.updated_by
    });
  });
});
