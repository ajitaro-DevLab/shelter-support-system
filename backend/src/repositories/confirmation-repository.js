import { pool } from '../db/pool.js';

const ALLOWED_DELTAS = new Set([-10, -5, -1, 1, 5, 10]);

export const confirmationRepository = {
  async record({
    eventId,
    shelterId,
    mode,
    confirmedCount,
    confirmationSlot,
    occurredAt,
    updatedBy
  }) {
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
      if (
        (mode === 'unchanged' && confirmedCount !== currentCount)
        || (mode === 'delta' && !ALLOWED_DELTAS.has(confirmedCount - currentCount))
      ) {
        await client.query('ROLLBACK');
        return { outcome: 'mode_count_mismatch' };
      }

      const confirmationResult = await client.query(`
        INSERT INTO confirmations (
          shelter_id, confirmation_slot, confirmed_count, confirmed_at, updated_by
        ) VALUES ($1, $2::time, $3, $4, $5)
        RETURNING id
      `, [shelterId, confirmationSlot, confirmedCount, occurredAt, updatedBy]);

      await client.query(`
        INSERT INTO events (
          id, event_type, shelter_id, occurred_at, updated_by, payload, status
        ) VALUES ($1, 'confirmation', $2, $3, $4, $5::jsonb, 'accepted')
      `, [
        eventId,
        shelterId,
        occurredAt,
        updatedBy,
        JSON.stringify({ mode, total: confirmedCount, confirmationSlot })
      ]);

      const statusResult = await client.query(`
        UPDATE shelter_status
        SET
          current_count = $2,
          confirmed_count = $2,
          confirmed_at = $3,
          confirmation_slot = $4::time,
          confidence = 'confirmed',
          updated_at = $3,
          updated_by = $5
        WHERE shelter_id = $1
        RETURNING
          current_count AS "currentCount",
          confirmed_count AS "confirmedCount",
          confirmed_at AS "confirmedAt",
          to_char(confirmation_slot, 'HH24:MI') AS "confirmationSlot",
          confidence,
          updated_at AS "updatedAt",
          updated_by AS "updatedBy"
      `, [shelterId, confirmedCount, occurredAt, confirmationSlot, updatedBy]);

      await client.query('COMMIT');
      return {
        outcome: 'recorded',
        confirmationId: confirmationResult.rows[0].id,
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
