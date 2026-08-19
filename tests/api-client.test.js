const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { ApiClientError, apiGet, apiPost } = require('../js/api-client.js');

function createResponse({ status = 200, body, requestId = 'request-test' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => name.toLowerCase() === 'x-request-id' ? requestId : null
    },
    json: async () => body
  };
}

describe('frontend API client', () => {
  it('performs a GET request and parses JSON', async () => {
    let captured;
    const result = await apiGet('/health', {
      fetchImplementation: async (path, options) => {
        captured = { path, options };
        return createResponse({ body: { status: 'ok' } });
      }
    });

    assert.deepEqual(result, { status: 'ok' });
    assert.equal(captured.path, '/api/health');
    assert.equal(captured.options.method, 'GET');
    assert.equal(captured.options.cache, 'no-store');
  });

  it('performs a POST request with a JSON body', async () => {
    let captured;
    const input = { delta: 5, updatedBy: 'demo-user-01' };
    const result = await apiPost('/shelters/shelter-002/events/visitor-change', input, {
      fetchImplementation: async (path, options) => {
        captured = { path, options };
        return createResponse({ status: 201, body: { status: 'accepted' } });
      }
    });

    assert.deepEqual(result, { status: 'accepted' });
    assert.equal(captured.options.method, 'POST');
    assert.equal(captured.options.headers['Content-Type'], 'application/json');
    assert.equal(captured.options.body, JSON.stringify(input));
  });

  it('exposes a structured API error response', async () => {
    await assert.rejects(
      apiGet('/shelters/missing', {
        fetchImplementation: async () => createResponse({
          status: 404,
          body: { error: { code: 'NOT_FOUND', message: '指定された避難所が見つかりません。' } },
          requestId: 'api-error-request'
        })
      }),
      (error) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.type, 'api');
        assert.equal(error.status, 404);
        assert.equal(error.code, 'NOT_FOUND');
        assert.equal(error.requestId, 'api-error-request');
        return true;
      }
    );
  });

  it('distinguishes a network error from an API error', async () => {
    await assert.rejects(
      apiGet('/health', {
        fetchImplementation: async () => { throw new Error('connection refused'); }
      }),
      (error) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.type, 'network');
        assert.equal(error.status, null);
        assert.equal(error.code, null);
        assert.doesNotMatch(error.message, /connection refused/i);
        return true;
      }
    );
  });

  it('reports invalid successful JSON as a parse error', async () => {
    await assert.rejects(
      apiGet('/health', {
        fetchImplementation: async () => ({
          ...createResponse({ body: null }),
          json: async () => { throw new SyntaxError('invalid JSON'); }
        })
      }),
      (error) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.type, 'parse');
        assert.equal(error.status, 200);
        assert.doesNotMatch(error.message, /invalid JSON/i);
        return true;
      }
    );
  });
});
