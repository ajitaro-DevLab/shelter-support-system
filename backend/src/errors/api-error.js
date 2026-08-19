export class ApiError extends Error {
  constructor(statusCode, errorCode, publicMessage) {
    super(errorCode);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.publicMessage = publicMessage;
  }
}
