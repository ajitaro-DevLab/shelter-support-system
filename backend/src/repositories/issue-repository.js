import { pool } from '../db/pool.js';
import { evaluateIssueStatus } from '../domain/issue-status.js';

export const issueRepository = {
  async record({ eventId, shelterId, category, severity, occurredAt, updatedBy }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const shelterResult = await client.query(`
        SELECT s.initial_status AS "initialStatus"
        FROM shelters s
        INNER JOIN shelter_status ss ON ss.shelter_id = s.id
        WHERE s.id = $1
        FOR UPDATE OF ss
      `, [shelterId]);
      if (shelterResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return { outcome: 'shelter_not_found' };
      }

      const userResult = await client.query(
        'SELECT 1 FROM users WHERE id = $1 AND is_active = true',
        [updatedBy]
      );
      if (userResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return { outcome: 'user_not_found' };
      }

      const issueResult = await client.query(`
        INSERT INTO issues (
          shelter_id, category, severity, occurred_at, updated_by
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [shelterId, category, severity, occurredAt, updatedBy]);

      await client.query(`
        INSERT INTO events (
          id, event_type, shelter_id, occurred_at, updated_by, payload, status
        ) VALUES ($1, 'issue_update', $2, $3, $4, $5::jsonb, 'accepted')
      `, [
        eventId,
        shelterId,
        occurredAt,
        updatedBy,
        JSON.stringify({ category, severity })
      ]);

      const latestIssues = await client.query(`
        SELECT DISTINCT ON (category) category, severity
        FROM issues
        WHERE shelter_id = $1
        ORDER BY category, occurred_at DESC, created_at DESC, id DESC
      `, [shelterId]);
      const shelterStatus = evaluateIssueStatus(
        latestIssues.rows.map((issue) => issue.severity),
        shelterResult.rows[0].initialStatus
      );

      const statusResult = await client.query(`
        UPDATE shelter_status
        SET status = $2, updated_at = $3, updated_by = $4
        WHERE shelter_id = $1
        RETURNING status, updated_at AS "updatedAt", updated_by AS "updatedBy"
      `, [shelterId, shelterStatus, occurredAt, updatedBy]);

      await client.query('COMMIT');
      return {
        outcome: 'recorded',
        issueId: issueResult.rows[0].id,
        ...statusResult.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};
