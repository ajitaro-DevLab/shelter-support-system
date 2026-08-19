import { randomUUID } from 'node:crypto';
import { getSafeErrorDiagnostics, isDatabaseUnavailableError } from './db/errors.js';
import { ApiError } from './errors/api-error.js';
import { writeLog } from './logger.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const MAX_JSON_BODY_BYTES = 64 * 1024;

function sendJson(response, statusCode, body, requestId) {
  response.writeHead(statusCode, {
    'Content-Type': JSON_CONTENT_TYPE,
    'X-Request-Id': requestId
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_JSON_BODY_BYTES) {
      throw new ApiError(400, 'VALIDATION_ERROR', '入力内容を確認してください。');
    }
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', '入力内容を確認してください。');
  }
}

export function createRequestHandler({
  logger = writeLog,
  healthCheck = async () => {},
  shelterRepository = null,
  shelterDetailService = null,
  hqService = null,
  visitorChangeService = null,
  confirmationService = null,
  supplyService = null,
  issueService = null,
  noticeService = null
} = {}) {
  return async function handleRequest(request, response) {
    const requestId = request.headers['x-request-id'] || randomUUID();
    const url = new URL(request.url, 'http://localhost');
    const requestContext = { requestId };

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        await healthCheck();
        logger('INFO', 'api', { requestId, result: 'success' });
        sendJson(response, 200, { status: 'ok' }, requestId);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/shelters') {
        if (!shelterRepository) throw new Error('Shelter repository is not configured');
        const shelters = await shelterRepository.listActive();
        logger('INFO', 'api', { requestId, result: 'success' });
        sendJson(response, 200, shelters, requestId);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/hq/shelters') {
        if (!hqService) throw new Error('HQ service is not configured');
        const shelters = await hqService.list();
        logger('INFO', 'api', { requestId, result: 'success' });
        sendJson(response, 200, shelters, requestId);
        return;
      }

      const shelterDetailMatch = url.pathname.match(/^\/api\/shelters\/([^/]+)$/);
      if (request.method === 'GET' && shelterDetailMatch) {
        if (!shelterDetailService) throw new Error('Shelter detail service is not configured');

        const shelterId = shelterDetailMatch[1];
        Object.assign(requestContext, { shelterId });
        const shelter = await shelterDetailService.get(shelterId);
        if (!shelter) {
          throw new ApiError(404, 'NOT_FOUND', '指定された避難所が見つかりません。');
        }
        logger('INFO', 'api', {
          ...requestContext,
          result: 'success'
        });
        sendJson(response, 200, shelter, requestId);
        return;
      }

      const visitorChangeMatch = url.pathname.match(
        /^\/api\/shelters\/([^/]+)\/events\/visitor-change$/
      );
      if (request.method === 'POST' && visitorChangeMatch) {
        if (!visitorChangeService) throw new Error('Visitor change service is not configured');

        const shelterId = visitorChangeMatch[1];
        Object.assign(requestContext, {
          shelterId,
          eventType: 'visitor_change'
        });
        const input = await readJsonBody(request);
        requestContext.userId = input?.updatedBy;
        const result = await visitorChangeService.record(shelterId, input);
        logger('INFO', 'api', {
          ...requestContext,
          result: 'success'
        });
        sendJson(response, 201, result, requestId);
        return;
      }

      const confirmationMatch = url.pathname.match(
        /^\/api\/shelters\/([^/]+)\/confirmations$/
      );
      if (request.method === 'POST' && confirmationMatch) {
        if (!confirmationService) throw new Error('Confirmation service is not configured');

        const shelterId = confirmationMatch[1];
        Object.assign(requestContext, {
          shelterId,
          eventType: 'confirmation'
        });
        const input = await readJsonBody(request);
        requestContext.userId = input?.updatedBy;
        const result = await confirmationService.record(shelterId, input);
        logger('INFO', 'api', {
          ...requestContext,
          result: 'success'
        });
        sendJson(response, 201, result, requestId);
        return;
      }

      const supplyMatch = url.pathname.match(
        /^\/api\/shelters\/([^/]+)\/supplies$/
      );
      if (request.method === 'POST' && supplyMatch) {
        if (!supplyService) throw new Error('Supply service is not configured');

        const shelterId = supplyMatch[1];
        Object.assign(requestContext, {
          shelterId,
          eventType: 'supply_received'
        });
        const input = await readJsonBody(request);
        requestContext.userId = input?.updatedBy;
        const result = await supplyService.record(shelterId, input);
        logger('INFO', 'api', {
          ...requestContext,
          result: 'success'
        });
        sendJson(response, 201, result, requestId);
        return;
      }

      const issueMatch = url.pathname.match(
        /^\/api\/shelters\/([^/]+)\/issues$/
      );
      if (request.method === 'POST' && issueMatch) {
        if (!issueService) throw new Error('Issue service is not configured');

        const shelterId = issueMatch[1];
        Object.assign(requestContext, {
          shelterId,
          eventType: 'issue_update'
        });
        const input = await readJsonBody(request);
        requestContext.userId = input?.updatedBy;
        const result = await issueService.record(shelterId, input);
        logger('INFO', 'api', {
          ...requestContext,
          result: 'success'
        });
        sendJson(response, 201, result, requestId);
        return;
      }

      const noticeMatch = url.pathname.match(
        /^\/api\/shelters\/([^/]+)\/notices$/
      );
      if (request.method === 'GET' && noticeMatch) {
        if (!noticeService) throw new Error('Notice service is not configured');

        const shelterId = noticeMatch[1];
        Object.assign(requestContext, { shelterId });
        const notices = await noticeService.list(shelterId, {
          publicOnly: url.searchParams.get('public') === 'true'
        });
        logger('INFO', 'api', {
          ...requestContext,
          result: 'success'
        });
        sendJson(response, 200, notices, requestId);
        return;
      }

      if (request.method === 'POST' && noticeMatch) {
        if (!noticeService) throw new Error('Notice service is not configured');

        const shelterId = noticeMatch[1];
        Object.assign(requestContext, {
          shelterId,
          eventType: 'notice_update'
        });
        const input = await readJsonBody(request);
        requestContext.userId = input?.updatedBy;
        const result = await noticeService.record(shelterId, input);
        logger('INFO', 'api', {
          ...requestContext,
          result: 'success'
        });
        sendJson(response, 201, result, requestId);
        return;
      }

      logger('WARN', 'api', {
        requestId,
        result: 'not_found',
        errorCode: 'NOT_FOUND'
      });
      sendJson(response, 404, {
        error: {
          code: 'NOT_FOUND',
          message: '指定されたAPIが見つかりません。'
        }
      }, requestId);
    } catch (error) {
      if (error instanceof ApiError) {
        logger('WARN', 'api', {
          ...requestContext,
          result: 'rejected',
          errorCode: error.errorCode
        });
        sendJson(response, error.statusCode, {
          error: {
            code: error.errorCode,
            message: error.publicMessage
          }
        }, requestId);
        return;
      }

      const isDatabaseUnavailable = isDatabaseUnavailableError(error);
      const statusCode = isDatabaseUnavailable ? 503 : 500;
      const errorCode = isDatabaseUnavailable ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR';
      const diagnostics = getSafeErrorDiagnostics(error, isDatabaseUnavailable);
      logger('ERROR', 'database/error', {
        ...requestContext,
        result: 'failed',
        errorCode,
        ...diagnostics
      });
      sendJson(response, statusCode, {
        error: {
          code: errorCode,
          message: isDatabaseUnavailable
            ? 'サービスを利用できません。'
            : 'サーバーで処理を完了できませんでした。'
        }
      }, requestId);
    }
  };
}
