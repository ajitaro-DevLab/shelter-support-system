const LEVELS = new Set(['INFO', 'WARN', 'ERROR']);

export function writeLog(level, category, fields = {}) {
  const safeLevel = LEVELS.has(level) ? level : 'INFO';
  const record = {
    timestamp: new Date().toISOString(),
    level: safeLevel,
    category,
    requestId: fields.requestId ?? null,
    shelterId: fields.shelterId ?? null,
    eventType: fields.eventType ?? null,
    userId: fields.userId ?? null,
    result: fields.result ?? null,
    errorCode: fields.errorCode ?? null,
    errorClass: fields.errorClass ?? null,
    sourceErrorCode: fields.sourceErrorCode ?? null,
    safeErrorMessage: fields.safeErrorMessage ?? null
  };

  const output = JSON.stringify(record);
  if (safeLevel === 'ERROR') {
    console.error(output);
    return;
  }
  if (safeLevel === 'WARN') {
    console.warn(output);
    return;
  }
  console.info(output);
}
