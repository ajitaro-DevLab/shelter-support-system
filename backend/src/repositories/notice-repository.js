import { pool } from '../db/pool.js';

export const noticeRepository = {
  async list({ shelterId, publicOnly }) {
    const shelterResult = await pool.query(
      'SELECT 1 FROM shelters WHERE id = $1 AND is_active = true',
      [shelterId]
    );
    if (shelterResult.rowCount === 0) {
      return { outcome: 'shelter_not_found' };
    }

    const noticeResult = await pool.query(`
      SELECT
        id,
        shelter_id AS "shelterId",
        title,
        to_char(start_time, 'HH24:MI') AS "startTime",
        location,
        body,
        is_public AS "isPublic",
        occurred_at AS "occurredAt",
        updated_by AS "updatedBy",
        created_at AS "createdAt"
      FROM notices
      WHERE shelter_id = $1
        AND ($2::boolean = false OR is_public = true)
      ORDER BY occurred_at DESC, created_at DESC, id DESC
    `, [shelterId, publicOnly]);

    return { outcome: 'listed', notices: noticeResult.rows };
  },

  async record({
    eventId,
    shelterId,
    title,
    startTime,
    location,
    body,
    isPublic,
    occurredAt,
    updatedBy
  }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const shelterResult = await client.query(`
        SELECT 1
        FROM shelter_status
        WHERE shelter_id = $1
        FOR UPDATE
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

      const noticeResult = await client.query(`
        INSERT INTO notices (
          shelter_id, title, start_time, location, body,
          is_public, occurred_at, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        shelterId,
        title,
        startTime,
        location,
        body,
        isPublic,
        occurredAt,
        updatedBy
      ]);

      await client.query(`
        INSERT INTO events (
          id, event_type, shelter_id, occurred_at, updated_by, payload, status
        ) VALUES ($1, 'notice_update', $2, $3, $4, $5::jsonb, 'accepted')
      `, [
        eventId,
        shelterId,
        occurredAt,
        updatedBy,
        JSON.stringify({ title, startTime, location, body, isPublic })
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
        noticeId: noticeResult.rows[0].id,
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
