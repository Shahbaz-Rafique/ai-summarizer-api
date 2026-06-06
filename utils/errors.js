class AppError extends Error {
  constructor(message, code, status, retryable = false) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    Error.captureStackTrace(this, this.constructor);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', retryAfter = null) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true);
    this.retryAfter = retryAfter;
  }
}

class ServiceOverloadedError extends AppError {
  constructor(message = 'Service is temporarily overloaded') {
    super(message, 'SERVICE_OVERLOADED', 503, true);
  }
}

class TimeoutError extends AppError {
  constructor(message = 'Request timed out') {
    super(message, 'TIMEOUT', 504, true);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'API authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401, false);
  }
}

class InvalidRequestError extends AppError {
  constructor(message = 'Invalid request') {
    super(message, 'INVALID_REQUEST', 400, false);
  }
}

class CircuitBreakerOpenError extends AppError {
  constructor(message = 'Circuit breaker is open - service temporarily unavailable') {
    super(message, 'CIRCUIT_BREAKER_OPEN', 503, true);
  }
}

class ClaudeAPIError extends AppError {
  constructor(message, originalError = null) {
    super(message, 'CLAUDE_API_ERROR', 500, false);
    this.originalError = originalError;
  }
}

module.exports = {
  AppError,
  RateLimitError,
  ServiceOverloadedError,
  TimeoutError,
  AuthenticationError,
  InvalidRequestError,
  CircuitBreakerOpenError,
  ClaudeAPIError,
};
