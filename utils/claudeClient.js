const config = require('../config');
const { RetryStrategy } = require('./retry');
const promptBuilder = require('./promptBuilder');
const CircuitBreaker = require('./circuitBreaker');
const APIClient = require('./apiClient');
const { validateResponse, formatResponse } = require('./responseHandler');
const { mapError, shouldRetryError } = require('./errorMapper');

/**
 * Claude Client (Orchestrator)
 *
 * Single Responsibility: Orchestrate summarization requests through circuit breaker, retry, and API layers
 * Reason to Change: Orchestration logic changes (how components work together)
 */
class ClaudeClient {
  constructor() {
    // Initialize API client
    this.apiClient = new APIClient();

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      threshold: config.circuitBreaker.threshold,
      timeout: config.circuitBreaker.timeout,
    });

    // Initialize retry strategy
    this.retryStrategy = new RetryStrategy({
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      shouldRetry: shouldRetryError,
    });
  }

  /**
   * Summarize text using Claude AI
   *
   * Orchestrates: prompt building → circuit breaker → retry → API call → response handling
   *
   * @param {string} text - Text to summarize
   * @param {Object} options - Summarization options (length, format, language)
   * @returns {Promise<Object>} Summarization result
   */
  async summarize(text, options = {}) {
    // Step 1: Validate options and build prompt
    promptBuilder.validateOptions(options);
    const prompt = promptBuilder.buildSummarizationPrompt(text, options);

    // Step 2: Execute through circuit breaker and retry logic
    return this.circuitBreaker.execute(async () => this.retryStrategy.execute(
      async () => {
        try {
          // Step 3: Make API request
          const rawResponse = await this.apiClient.makeRequest(prompt, options);

          // Step 4: Validate response structure
          validateResponse(rawResponse);

          // Step 5: Format and return
          return formatResponse(rawResponse);
        } catch (error) {
          // Step 6: Map errors to custom types
          throw mapError(error);
        }
      },
      {
        onRetry: (attempt, maxRetries, delay, error) => {
          console.log(
            `Retry attempt ${attempt}/${maxRetries} after ${delay}ms - ${error.message}`,
          );
        },
      },
    ));
  }

  /**
   * Get circuit breaker state
   *
   * @returns {Object} Circuit breaker state
   */
  getCircuitState() {
    return this.circuitBreaker.getState();
  }

  /**
   * Get client statistics and configuration
   *
   * @returns {Object} Client stats
   */
  getStats() {
    return {
      circuit: this.getCircuitState(),
      config: {
        maxRetries: this.retryStrategy.maxRetries,
        baseDelayMs: this.retryStrategy.baseDelayMs,
        maxDelayMs: this.retryStrategy.maxDelayMs,
        timeout: this.apiClient.requestTimeout,
      },
    };
  }

  /**
   * Reset circuit breaker (for testing or manual recovery)
   */
  resetCircuitBreaker() {
    this.circuitBreaker.reset();
  }
}

// Export singleton instance
module.exports = new ClaudeClient();
