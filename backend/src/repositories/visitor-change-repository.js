import { pool } from '../db/pool.js';

export const visitorChangeRepository = {
  async record({ eventId, shelterId, delta, occurredAt, updatedBy }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const shelterResult = await client.query(`
        SELECT ss.current_count AS "currentCount"
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

      const currentCount = shelterResult.rows[0].currentCount;
      const nextCount = currentCount + delta;
      if (nextCount < 0) {
        await client.query('ROLLBACK');
        return { outcome: 'negative_count' };
      }

      await client.query(`
        INSERT INTO events (
          id, event_type, shelter_id, occurred_at, updated_by, payload, status
        ) VALUES ($1, 'visitor_change', $2, $3, $4, $5::jsonb, 'accepted')
      `, [
        eventId,
        shelterId,
        occurredAt,
        updatedBy,
        JSON.stringify({ delta, total: nextCount })
      ]);

      const statusResult = await client.query(`
        UPDATE shelter_status
        SET
          current_count = $2,
          confidence = 'estimated',
          updated_at = $3,
          updated_by = $4
        WHERE shelter_id = $1
        RETURNING
          current_count AS "currentCount",
          confidence,
          updated_at AS "updatedAt",
          updated_by AS "updatedBy"
      `, [shelterId, nextCount, occurredAt, updatedBy]);

      await client.query('COMMIT');
      return { outcome: 'recorded', ...statusResult.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};
