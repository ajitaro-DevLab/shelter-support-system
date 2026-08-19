(function initializeApiClient(globalScope) {
  'use strict';

  const API_BASE_PATH = '/api';
  const JSON_CONTENT_TYPE = 'application/json';

  class ApiClientError extends Error {
    constructor(type, message, details = {}) {
      super(message);
      this.name = 'ApiClientError';
      this.type = type;
      this.status = details.status ?? null;
      this.code = details.code ?? null;
      this.requestId = details.requestId ?? null;
    }
  }

  function buildApiPath(path) {
    if (typeof path !== 'string' || path.trim() === '') {
      throw new TypeError('API path is required');
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return normalizedPath === API_BASE_PATH || normalizedPath.startsWith(`${API_BASE_PATH}/`)
      ? normalizedPath
      : `${API_BASE_PATH}${normalizedPath}`;
  }

  async function parseJsonResponse(response) {
    if (response.status === 204) return null;

    try {
      return await response.json();
    } catch {
      throw new ApiClientError('parse', 'サーバーからの応答を読み取れませんでした。', {
        status: response.status,
        requestId: response.headers.get('x-request-id')
      });
    }
  }

  async function request(path, options = {}) {
    const fetchImplementation = options.fetchImplementation
      || ((...args) => globalScope.fetch(...args));
    const method = options.method || 'GET';
    const requestOptions = {
      method,
      cache: 'no-store',
      headers: { ...(options.headers || {}) }
    };

    if (Object.prototype.hasOwnProperty.call(options, 'body')) {
      requestOptions.headers['Content-Type'] = JSON_CONTENT_TYPE;
      requestOptions.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetchImplementation(buildApiPath(path), requestOptions);
    } catch {
      throw new ApiClientError(
        'network',
        'サーバーに接続できません。通信状態を確認してください。'
      );
    }

    const responseBody = await parseJsonResponse(response);
    if (!response.ok) {
      const apiError = responseBody?.error;
      throw new ApiClientError(
        'api',
        typeof apiError?.message === 'string'
          ? apiError.message
          : 'サーバーで処理を完了できませんでした。',
        {
          status: response.status,
          code: typeof apiError?.code === 'string' ? apiError.code : 'HTTP_ERROR',
          requestId: response.headers.get('x-request-id')
        }
      );
    }

    return responseBody;
  }

  function apiGet(path, options = {}) {
    return request(path, { ...options, method: 'GET' });
  }

  function apiPost(path, body, options = {}) {
    return request(path, { ...options, method: 'POST', body });
  }

  const apiClient = {
    ApiClientError,
    apiGet,
    apiPost
  };

  globalScope.ApiClient = apiClient;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = apiClient;
  }
}(typeof window !== 'undefined' ? window : globalThis));
