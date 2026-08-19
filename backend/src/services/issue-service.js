import { randomUUID } from 'node:crypto';
import { ISSUE_CATEGORIES, ISSUE_SEVERITIES } from '../domain/issue-status.js';
import { ApiError } from '../errors/api-error.js';

const VALIDATION_MESSAGE = '入力内容を確認してください。';
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function validationError() {
  return new ApiError(400, 'VALIDATION_ERROR', VALIDATION_MESSAGE);
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError();
  }
  if (!ISSUE_CATEGORIES.has(input.category)) {
    throw validationError();
  }
  if (!ISSUE_SEVERITIES.has(input.severity)) {
    throw validationError();
  }
  if (
    typeof input.occurredAt !== 'string'
    || !ISO_DATE_TIME_PATTERN.test(input.occurredAt)
    || Number.isNaN(Date.parse(input.occurredAt))
  ) {
    throw validationError();
  }
  if (typeof input.updatedBy !== 'string' || input.updatedBy.trim() === '') {
    throw validationError();
  }
}

export function createIssueService({ repository }) {
  return {
    async record(shelterId, input) {
      validateInput(input);

      const eventId = randomUUID();
      const occurredAt = new Date(input.occurredAt).toISOString();
      const updatedBy = input.updatedBy.trim();
      const result = await repository.record({
        eventId,
        shelterId,
        category: input.category,
        severity: input.severity,
        occurredAt,
        updatedBy
      });

      if (result.outcome === 'shelter_not_found') {
        throw new ApiError(404, 'NOT_FOUND', '指定された避難所が見つかりません。');
      }
      if (result.outcome === 'user_not_found') {
        throw validationError();
      }
      if (result.outcome !== 'recorded') {
        throw new Error('Unexpected issue repository outcome');
      }

      return {
        issueId: result.issueId,
        eventId,
        eventType: 'issue_update',
        shelterId,
        category: input.category,
        severity: input.severity,
        shelterStatus: result.status,
        occurredAt,
        updatedAt: result.updatedAt,
        updatedBy: result.updatedBy,
        status: 'accepted'
      };
    }
  };
}
