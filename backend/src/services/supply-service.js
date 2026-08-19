import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors/api-error.js';

const SUPPLY_TYPES = new Set([
  'water',
  'food',
  'blanket',
  'hygiene',
  'portable_toilet'
]);

const SUPPLY_UNITS = new Set([
  'ケース',
  '箱',
  '袋',
  '個',
  '枚',
  'セット',
  '台'
]);

const VALIDATION_MESSAGE = '入力内容を確認してください。';
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function validationError() {
  return new ApiError(400, 'VALIDATION_ERROR', VALIDATION_MESSAGE);
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError();
  }
  if (!SUPPLY_TYPES.has(input.supplyType)) {
    throw validationError();
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw validationError();
  }
  if (!SUPPLY_UNITS.has(input.unit)) {
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

export function createSupplyService({ repository }) {
  return {
    async record(shelterId, input) {
      validateInput(input);

      const eventId = randomUUID();
      const occurredAt = new Date(input.occurredAt).toISOString();
      const updatedBy = input.updatedBy.trim();
      const result = await repository.record({
        eventId,
        shelterId,
        supplyType: input.supplyType,
        quantity: input.quantity,
        unit: input.unit,
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
        throw new Error('Unexpected supply repository outcome');
      }

      return {
        supplyId: result.supplyId,
        eventId,
        eventType: 'supply_received',
        shelterId,
        supplyType: input.supplyType,
        quantity: input.quantity,
        unit: input.unit,
        occurredAt,
        updatedAt: result.updatedAt,
        updatedBy: result.updatedBy,
        status: 'accepted'
      };
    }
  };
}
