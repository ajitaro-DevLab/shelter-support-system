import { pool } from '../db/pool.js';

export const supplyRepository = {
  async record({ eventId, shelterId, supplyType, quantity, unit, occurredAt, updatedBy }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const shelterResult = await client.query(`
        SELECT ss.shelter_id
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

      const supplyResult = await client.query(`
        INSERT INTO supplies (
          shelter_id, supply_type, quantity, unit, occurred_at, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [shelterId, supplyType, quantity, unit, occurredAt, updatedBy]);

      await client.query(`
        INSERT INTO events (
          id, event_type, shelter_id, occurred_at, updated_by, payload, status
        ) VALUES ($1, 'supply_received', $2, $3, $4, $5::jsonb, 'accepted')
      `, [
        eventId,
        shelterId,
        occurredAt,
        updatedBy,
        JSON.stringify({ supplyType, quantity, unit })
      ]);

      const statusResult = await client.query(`
        UPDATE shelter_status
        SET updated_at = $2, updated_by = $3
        WHERE shelter_id = $1
        RETURNING updated_at AS "updatedAt", updated_by AS "updatedBy"
      `, [shelterId, occurredAt, updatedBy]);

      await client.query('COMMIT');
      return {
        outcome: 'recorded',
        supplyId: supplyResult.rows[0].id,
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
