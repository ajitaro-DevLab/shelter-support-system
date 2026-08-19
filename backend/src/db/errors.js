const DATABASE_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '53400'
]);

const DATABASE_UNAVAILABLE_MESSAGES = new Set([
  'Connection terminated due to connection timeout',
  'Connection terminated unexpectedly',
  'timeout exceeded when trying to connect'
]);

const SAFE_ERROR_CLASS_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const SAFE_SOURCE_CODE_PATTERN = /^[A-Z0-9_]{2,32}$/;

function getSafeErrorClass(error, isDatabaseUnavailable) {
  if (isDatabaseUnavailable) return 'DatabaseConnectionError';

  const errorClass = error?.name;
  return typeof errorClass === 'string' && SAFE_ERROR_CLASS_PATTERN.test(errorClass)
    ? errorClass
    : 'UnknownError';
}

function getSafeSourceErrorCode(error) {
  const sourceErrorCode = error?.code;
  return typeof sourceErrorCode === 'string' && SAFE_SOURCE_CODE_PATTERN.test(sourceErrorCode)
    ? sourceErrorCode
    : null;
}

function getDatabaseSafeMessage(error) {
  const errorCode = error?.code;
  if (errorCode === 'ECONNREFUSED') return 'PostgreSQL connection refused';
  if (errorCode === 'ETIMEDOUT' || error?.message?.includes('timeout')) {
    return 'PostgreSQL connection timed out';
  }
  if (
    errorCode === 'ECONNRESET'
    || errorCode === '57P01'
    || errorCode === '57P02'
    || error?.message?.includes('Connection terminated')
  ) {
    return 'PostgreSQL connection terminated';
  }
  return 'PostgreSQL temporarily unavailable';
}

export function isDatabaseUnavailableError(error) {
  const errorCode = error?.code;

  const hasUnavailableCode = typeof errorCode === 'string'
    && (errorCode.startsWith('08') || DATABASE_UNAVAILABLE_CODES.has(errorCode));

  return hasUnavailableCode || DATABASE_UNAVAILABLE_MESSAGES.has(error?.message);
}

export function getSafeErrorDiagnostics(error, isDatabaseUnavailable) {
  return {
    errorClass: getSafeErrorClass(error, isDatabaseUnavailable),
    sourceErrorCode: getSafeSourceErrorCode(error),
    safeErrorMessage: isDatabaseUnavailable
      ? getDatabaseSafeMessage(error)
      : 'Unexpected application error'
  };
}
