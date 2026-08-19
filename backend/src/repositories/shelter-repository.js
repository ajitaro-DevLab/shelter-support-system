import { pool } from '../db/pool.js';

export const shelterRepository = {
  async listActive() {
    const result = await pool.query(`
      SELECT
        s.id,
        s.name,
        ss.status,
        ss.current_count AS "currentCount",
        ss.updated_at AS "updatedAt"
      FROM shelters s
      INNER JOIN shelter_status ss ON ss.shelter_id = s.id
      WHERE s.is_active = true
      ORDER BY s.id
    `);
    return result.rows;
  },

  async listForHq() {
    const result = await pool.query(`
      SELECT
        s.id AS "shelterId",
        s.name,
        ss.status,
        ss.current_count AS "currentCount",
        ss.confirmed_count AS "confirmedCount",
        ss.confirmed_at AS "confirmedAt",
        CASE
          WHEN ss.confirmation_slot IS NULL THEN NULL
          ELSE to_char(ss.confirmation_slot, 'HH24:MI')
        END AS "confirmationSlot",
        ss.confidence,
        ss.updated_at AS "updatedAt",
        ss.updated_by AS "updatedBy"
      FROM shelters s
      INNER JOIN shelter_status ss ON ss.shelter_id = s.id
      WHERE s.is_active = true
      ORDER BY s.id
    `);
    return result.rows;
  },

  async getDetail(shelterId) {
    const result = await pool.query(`
      SELECT
        s.id,
        s.name,
        s.latitude,
        s.longitude,
        ss.status,
        ss.current_count AS "currentCount",
        ss.confirmed_count AS "confirmedCount",
        ss.confirmed_at AS "confirmedAt",
        CASE
          WHEN ss.confirmation_slot IS NULL THEN NULL
          ELSE to_char(ss.confirmation_slot, 'HH24:MI')
        END AS "confirmationSlot",
        ss.confidence,
        ss.updated_at AS "updatedAt",
        ss.updated_by AS "updatedBy",
        CASE
          WHEN latest_supply.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'supplyId', latest_supply.id::text,
            'supplyType', latest_supply.supply_type,
            'quantity', latest_supply.quantity,
            'unit', latest_supply.unit,
            'occurredAt', latest_supply.occurred_at,
            'updatedBy', latest_supply.updated_by
          )
        END AS "latestSupply",
        CASE
          WHEN latest_issue.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'issueId', latest_issue.id::text,
            'category', latest_issue.category,
            'severity', latest_issue.severity,
            'occurredAt', latest_issue.occurred_at,
            'updatedBy', latest_issue.updated_by
          )
        END AS "latestIssue",
        recent_events.history
      FROM shelters s
      INNER JOIN shelter_status ss ON ss.shelter_id = s.id
      LEFT JOIN LATERAL (
        SELECT id, supply_type, quantity, unit, occurred_at, updated_by
        FROM supplies
        WHERE shelter_id = s.id
        ORDER BY occurred_at DESC, created_at DESC, id DESC
        LIMIT 1
      ) latest_supply ON true
      LEFT JOIN LATERAL (
        SELECT id, category, severity, occurred_at, updated_by
        FROM issues
        WHERE shelter_id = s.id
        ORDER BY occurred_at DESC, created_at DESC, id DESC
        LIMIT 1
      ) latest_issue ON true
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'eventId', event.id,
              'eventType', event.event_type,
              'occurredAt', event.occurred_at,
              'updatedBy', event.updated_by,
              'payload', event.payload,
              'status', event.status
            ) ORDER BY event.occurred_at DESC, event.created_at DESC, event.id DESC
          ),
          '[]'::jsonb
        ) AS history
        FROM (
          SELECT id, event_type, occurred_at, created_at, updated_by, payload, status
          FROM events
          WHERE shelter_id = s.id
          ORDER BY occurred_at DESC, created_at DESC, id DESC
          LIMIT 3
        ) event
      ) recent_events
      WHERE s.id = $1 AND s.is_active = true
    `, [shelterId]);

    return result.rows[0] ?? null;
  }
};
