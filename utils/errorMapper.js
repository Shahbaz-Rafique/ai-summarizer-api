const config = require('../config');
const {
  RateLimitError,
  ServiceOverloadedError,
  TimeoutError,
  AuthenticationError,
  InvalidRequestError,
  ClaudeAPIError,
} = require('./errors');

/**
 * Error Mapper
 *
 * Single Responsibility: Map API errors to custom error classes and determine retry logic
 * Reason to Change: Error classification or retry logic changes
 */

/**
 * Map API errors to custom error classes
 *
 * @param {Error} error - Original error from API or network
 * @returns {Error} Custom error with retryable flag
 */
function mapError(error) {
  // Already a custom error
  if (error.retryable !== undefined) {
    return error;
  }

  const status = error.status || error.statusCode;
  const errorMessage = error.message || 'Unknown error';

  // Rate limit (429)
  if (status === 429) {
    const retryAfter = extractRetryAfter(error.headers);
    return new RateLimitError(
      `Rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter}s` : 'Please try again later'}`,
      retryAfter,
    );
  }

  // Service overloaded (529, 503)
  if (status === 529 || status === 503) {
    return new ServiceOverloadedError('Claude API is temporarily overloaded');
  }

  // Authentication errors (401, 403)
  if (status === 401 || status === 403) {
    return new AuthenticationError('Invalid or expired API key');
  }

  // Bad request (400)
  if (status === 400) {
    return new InvalidRequestError(errorMessage);
  }

  // Timeout errors
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED' || error.name === 'TimeoutError') {
    return new TimeoutError('Request timed out');
  }

  // Network errors
  if (
    error.code === 'ENOTFOUND'
    || error.code === 'ECONNREFUSED'
    || error.code === 'ECONNRESET'
  ) {
    return new ClaudeAPIError(`Network error: ${error.code}`, error);
  }

  // Generic error
  return new ClaudeAPIError(
    config.nodeEnv === 'development'
      ? `Claude API error: ${errorMessage}`
      : 'An error occurred while processing your request',
    error,
  );
}

/**
 * Determine if an error should be retried
 *
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is retryable
 */
function shouldRetryError(error) {
  // Don't retry if circuit breaker is open
  if (error.code === 'CIRCUIT_BREAKER_OPEN') {
    return false;
  }

  // Use error's retryable property if available
  if (error.retryable !== undefined) {
    return error.retryable;
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Extract retry-after value from headers
 *
 * @param {Object} headers - HTTP headers
 * @returns {number|null} Retry-after in seconds, or null
 */
function extractRetryAfter(headers) {
  if (!headers || !headers['retry-after']) {
    return null;
  }

  const retryAfter = parseInt(headers['retry-after'], 10);
  return isNaN(retryAfter) ? null : retryAfter;
}

module.exports = {
  mapError,
  shouldRetryError,
  extractRetryAfter,
};
