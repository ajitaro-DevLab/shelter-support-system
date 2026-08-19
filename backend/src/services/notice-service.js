import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors/api-error.js';

const VALIDATION_MESSAGE = '入力内容を確認してください。';
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function validationError() {
  return new ApiError(400, 'VALIDATION_ERROR', VALIDATION_MESSAGE);
}

function validateText(value, maximumLength) {
  return typeof value === 'string'
    && value.trim() !== ''
    && [...value.trim()].length <= maximumLength;
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError();
  }
  if (!validateText(input.title, 30)) {
    throw validationError();
  }
  if (typeof input.startTime !== 'string' || !TIME_PATTERN.test(input.startTime)) {
    throw validationError();
  }
  if (!validateText(input.location, 40)) {
    throw validationError();
  }
  if (!validateText(input.body, 100)) {
    throw validationError();
  }
  if (typeof input.isPublic !== 'boolean') {
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

function notFoundError() {
  return new ApiError(404, 'NOT_FOUND', '指定された避難所が見つかりません。');
}

function serializeNotice(notice) {
  const { id, ...fields } = notice;
  return {
    ...fields,
    noticeId: String(id ?? notice.noticeId),
    occurredAt: new Date(notice.occurredAt).toISOString(),
    createdAt: new Date(notice.createdAt).toISOString()
  };
}

export function createNoticeService({ repository }) {
  return {
    async list(shelterId, { publicOnly = false } = {}) {
      const result = await repository.list({ shelterId, publicOnly });
      if (result.outcome === 'shelter_not_found') {
        throw notFoundError();
      }
      if (result.outcome !== 'listed') {
        throw new Error('Unexpected notice repository outcome');
      }
      return result.notices.map(serializeNotice);
    },

    async record(shelterId, input) {
      validateInput(input);

      const eventId = randomUUID();
      const occurredAt = new Date(input.occurredAt).toISOString();
      const title = input.title.trim();
      const location = input.location.trim();
      const body = input.body.trim();
      const updatedBy = input.updatedBy.trim();
      const result = await repository.record({
        eventId,
        shelterId,
        title,
        startTime: input.startTime,
        location,
        body,
        isPublic: input.isPublic,
        occurredAt,
        updatedBy
      });

      if (result.outcome === 'shelter_not_found') {
        throw notFoundError();
      }
      if (result.outcome === 'user_not_found') {
        throw validationError();
      }
      if (result.outcome !== 'recorded') {
        throw new Error('Unexpected notice repository outcome');
      }

      return {
        noticeId: String(result.noticeId),
        eventId,
        eventType: 'notice_update',
        shelterId,
        title,
        startTime: input.startTime,
        location,
        body,
        isPublic: input.isPublic,
        occurredAt,
        updatedAt: result.updatedAt,
        updatedBy: result.updatedBy,
        status: 'accepted'
      };
    }
  };
}
