/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by stopping requests when a service is failing
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5; // Failures before opening
    this.timeout = options.timeout || 30000; // Time before retry (ms)

    // Circuit states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }

  /**
   * Execute a function with circuit breaker protection
   *
   * @param {Function} fn - Async function to execute
   * @returns {Promise<*>} Result of the function
   * @throws {CircuitBreakerOpenError} If circuit is open
   */
  async execute(fn) {
    // Check circuit state before execution
    this.checkState();

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Check if circuit should allow request
   *
   * @throws {Error} If circuit is open and timeout hasn't elapsed
   */
  checkState() {
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;

      if (timeSinceLastFailure < this.timeout) {
        const retryAfter = Math.ceil((this.timeout - timeSinceLastFailure) / 1000);
        const error = new Error(
          `Circuit breaker is OPEN. Retry after ${retryAfter}s`,
        );
        error.code = 'CIRCUIT_BREAKER_OPEN';
        error.status = 503;
        error.retryable = true;
        throw error;
      }

      // Timeout elapsed, try recovery
      console.log('Circuit breaker entering HALF_OPEN state');
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;

      // Need 2 consecutive successes to close circuit
      if (this.successCount >= 2) {
        console.log('Circuit breaker closed - service recovered');
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed execution
   *
   * @param {Error} error - The error that occurred
   */
  onFailure(error) {
    // Don't count client errors (4xx except 429) toward circuit breaker
    if (this.isClientError(error)) {
      return;
    }

    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Failed during recovery attempt, reopen circuit
      console.error('Circuit breaker reopened - recovery failed');
      this.state = 'OPEN';
      this.successCount = 0;
    } else if (this.state === 'CLOSED' && this.failureCount >= this.threshold) {
      // Threshold exceeded, open circuit
      console.error(`Circuit breaker opened after ${this.failureCount} consecutive failures`);
      this.state = 'OPEN';
    }
  }

  /**
   * Check if error is a client error (4xx except 429)
   *
   * @param {Error} error - Error to check
   * @returns {boolean} True if client error
   */
  isClientError(error) {
    const status = error.status || error.statusCode;
    return status >= 400 && status < 500 && status !== 429;
  }

  /**
   * Get current circuit breaker state
   *
   * @returns {Object} Current state information
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    console.log('Circuit breaker manually reset');
  }

  /**
   * Check if circuit is currently open
   *
   * @returns {boolean} True if circuit is open
   */
  isOpen() {
    return this.state === 'OPEN';
  }

  /**
   * Check if circuit is currently closed
   *
   * @returns {boolean} True if circuit is closed
   */
  isClosed() {
    return this.state === 'CLOSED';
  }

  /**
   * Check if circuit is in half-open state
   *
   * @returns {boolean} True if circuit is half-open
   */
  isHalfOpen() {
    return this.state === 'HALF_OPEN';
  }
}

module.exports = CircuitBreaker;
