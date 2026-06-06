/**
 * Retry utility with exponential backoff
 *
 * Handles retrying failed operations with configurable backoff strategy
 */

class RetryStrategy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelayMs = options.baseDelayMs || 1000;
    this.maxDelayMs = options.maxDelayMs || 10000;
    this.shouldRetry = options.shouldRetry || this.defaultShouldRetry;
  }

  /**
   * Execute a function with retry logic
   *
   * @param {Function} fn - Async function to retry
   * @param {Object} context - Optional context for logging
   * @returns {Promise<*>} Result of the function
   */
  async execute(fn, context = {}) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Check if we should retry this error
        if (!this.shouldRetry(error)) {
          throw error;
        }

        // Check if we've exhausted retries
        if (attempt >= this.maxRetries) {
          throw error;
        }

        // Calculate delay and wait
        const delay = this.calculateBackoff(attempt, error);

        if (context.onRetry) {
          context.onRetry(attempt + 1, this.maxRetries, delay, error);
        }

        await this.sleep(delay);
      }
    }

    // Should never reach here, but just in case
    throw lastError;
  }

  /**
   * Calculate exponential backoff delay with jitter
   *
   * @param {number} attempt - Current attempt number (0-indexed)
   * @param {Error} error - The error that triggered the retry
   * @returns {number} Delay in milliseconds
   */
  calculateBackoff(attempt, error) {
    // Check if error has a retry-after header (for rate limits)
    if (error && error.retryAfter) {
      return error.retryAfter * 1000; // Convert seconds to ms
    }

    // Exponential backoff: delay = baseDelay * (2 ^ attempt)
    const exponentialDelay = this.baseDelayMs * 2 ** attempt;

    // Add jitter to prevent thundering herd (random 0-1000ms)
    const jitter = Math.random() * 1000;

    // Cap at max delay
    return Math.min(exponentialDelay + jitter, this.maxDelayMs);
  }

  /**
   * Default retry predicate - retries on specific error conditions
   *
   * @param {Error} error - The error to check
   * @returns {boolean} Whether to retry
   */
  defaultShouldRetry(error) {
    // Retry on network errors
    if (error.code === 'ETIMEDOUT'
        || error.code === 'ECONNABORTED'
        || error.code === 'ECONNRESET'
        || error.code === 'ENOTFOUND') {
      return true;
    }

    // Retry on rate limits (429)
    if (error.status === 429) {
      return true;
    }

    // Retry on service overloaded (529, 503)
    if (error.status === 529 || error.status === 503) {
      return true;
    }

    // Retry on gateway timeout (504)
    if (error.status === 504) {
      return true;
    }

    // Check if error explicitly says it's retryable
    if (error.retryable === true) {
      return true;
    }

    // Don't retry client errors (4xx except 429)
    if (error.status >= 400 && error.status < 500 && error.status !== 429) {
      return false;
    }

    // Don't retry by default
    return false;
  }

  /**
   * Sleep for specified milliseconds
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Helper function for simple retry with defaults
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise<*>} Result of the function
 */
async function retry(fn, options = {}) {
  const strategy = new RetryStrategy(options);
  return strategy.execute(fn, options);
}

module.exports = {
  RetryStrategy,
  retry,
};
