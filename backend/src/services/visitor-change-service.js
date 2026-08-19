import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors/api-error.js';

const VALIDATION_MESSAGE = '入力内容を確認してください。';

function validationError() {
  return new ApiError(400, 'VALIDATION_ERROR', VALIDATION_MESSAGE);
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError();
  }
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw validationError();
  }
  if (typeof input.occurredAt !== 'string' || Number.isNaN(Date.parse(input.occurredAt))) {
    throw validationError();
  }
  if (typeof input.updatedBy !== 'string' || input.updatedBy.trim() === '') {
    throw validationError();
  }
}

export function createVisitorChangeService({ repository }) {
  return {
    async record(shelterId, input) {
      validateInput(input);

      const eventId = randomUUID();
      const occurredAt = new Date(input.occurredAt).toISOString();
      const updatedBy = input.updatedBy.trim();
      const result = await repository.record({
        eventId,
        shelterId,
        delta: input.delta,
        occurredAt,
        updatedBy
      });

      if (result.outcome === 'shelter_not_found') {
        throw new ApiError(404, 'NOT_FOUND', '指定された避難所が見つかりません。');
      }
      if (result.outcome === 'user_not_found' || result.outcome === 'negative_count') {
        throw validationError();
      }
      if (result.outcome !== 'recorded') {
        throw new Error('Unexpected visitor change repository outcome');
      }

      return {
        eventId,
        eventType: 'visitor_change',
        shelterId,
        delta: input.delta,
        currentCount: result.currentCount,
        confidence: result.confidence,
        updatedAt: result.updatedAt,
        updatedBy: result.updatedBy,
        status: 'accepted'
      };
    }
  };
}
