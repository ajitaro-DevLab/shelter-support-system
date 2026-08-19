import { randomUUID } from 'node:crypto';
import { CONFIRMATION_SLOTS, getConfirmationSchedule } from '../domain/confirmation-schedule.js';
import { ApiError } from '../errors/api-error.js';

const CONFIRMATION_MODES = new Set(['unchanged', 'delta', 'correction']);
const VALIDATION_MESSAGE = '入力内容を確認してください。';
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function validationError() {
  return new ApiError(400, 'VALIDATION_ERROR', VALIDATION_MESSAGE);
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError();
  }
  if (!CONFIRMATION_MODES.has(input.mode)) {
    throw validationError();
  }
  if (!Number.isInteger(input.confirmedCount) || input.confirmedCount < 0) {
    throw validationError();
  }
  if (!CONFIRMATION_SLOTS.has(input.confirmationSlot)) {
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

  const schedule = getConfirmationSchedule(new Date(input.occurredAt));
  if (input.confirmationSlot !== schedule.currentSlot) {
    throw validationError();
  }
}

export function createConfirmationService({ repository }) {
  return {
    async record(shelterId, input) {
      validateInput(input);

      const eventId = randomUUID();
      const occurredAt = new Date(input.occurredAt).toISOString();
      const updatedBy = input.updatedBy.trim();
      const result = await repository.record({
        eventId,
        shelterId,
        mode: input.mode,
        confirmedCount: input.confirmedCount,
        confirmationSlot: input.confirmationSlot,
        occurredAt,
        updatedBy
      });

      if (result.outcome === 'shelter_not_found') {
        throw new ApiError(404, 'NOT_FOUND', '指定された避難所が見つかりません。');
      }
      if (
        result.outcome === 'user_not_found'
        || result.outcome === 'mode_count_mismatch'
      ) {
        throw validationError();
      }
      if (result.outcome !== 'recorded') {
        throw new Error('Unexpected confirmation repository outcome');
      }

      return {
        confirmationId: result.confirmationId,
        eventId,
        eventType: 'confirmation',
        shelterId,
        mode: input.mode,
        currentCount: result.currentCount,
        confirmedCount: result.confirmedCount,
        confirmedAt: result.confirmedAt,
        confirmationSlot: result.confirmationSlot,
        confidence: result.confidence,
        updatedAt: result.updatedAt,
        updatedBy: result.updatedBy,
        status: 'accepted'
      };
    }
  };
}
