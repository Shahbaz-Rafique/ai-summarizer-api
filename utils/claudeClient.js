const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const { RetryStrategy } = require('./retry');
const promptBuilder = require('./promptBuilder');
const CircuitBreaker = require('./circuitBreaker');
const {
  RateLimitError,
  ServiceOverloadedError,
  TimeoutError,
  AuthenticationError,
  InvalidRequestError,
  ClaudeAPIError,
} = require('./errors');

/**
 * Claude API Client
 *
 * Handles communication with the Anthropic Claude API
 * Responsibilities:
 * - API request execution
 * - Response validation
 * - Error mapping
 * - Integration with retry logic and circuit breaker
 */
class ClaudeClient {
  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
      timeout: 30000,
    });

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
      shouldRetry: this.shouldRetryError.bind(this),
    });

    this.requestTimeout = 30000; // 30 seconds
  }

  /**
   * Summarize text using Claude AI
   *
   * @param {string} text - Text to summarize
   * @param {Object} options - Summarization options
   * @returns {Promise<Object>} Summarization result
   */
  async summarize(text, options = {}) {
    // Validate options
    promptBuilder.validateOptions(options);

    // Build prompt
    const prompt = promptBuilder.buildSummarizationPrompt(text, options);

    // Execute with circuit breaker and retry logic
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(
        async () => this.makeRequest(prompt, options),
        {
          onRetry: (attempt, maxRetries, delay, error) => {
            console.log(
              `Retry attempt ${attempt}/${maxRetries} after ${delay}ms - ${error.message}`
            );
          },
        }
      );
    });
  }

  /**
   * Make API request to Claude
   *
   * @param {string} prompt - Formatted prompt
   * @param {Object} options - Request options
   * @returns {Promise<Object>} API response
   * @private
   */
  async makeRequest(prompt, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await this.client.messages.create(
        {
          model: options.model || config.anthropic.model,
          max_tokens: options.maxTokens || config.anthropic.maxTokens,
          temperature: options.temperature ?? config.anthropic.temperature,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      // Validate response
      this.validateResponse(response);

      // Extract and format result
      return this.formatResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout
      if (error.name === 'AbortError' || controller.signal.aborted) {
        throw new TimeoutError('Request to Claude API timed out after 30 seconds');
      }

      // Map to custom error
      throw this.mapError(error);
    }
  }

  /**
   * Validate API response structure
   *
   * @param {Object} response - API response
   * @throws {ClaudeAPIError} If response is invalid
   * @private
   */
  validateResponse(response) {
    if (!response.content || !Array.isArray(response.content)) {
      throw new ClaudeAPIError('Invalid response structure: missing content array');
    }

    if (response.content.length === 0) {
      throw new ClaudeAPIError('Invalid response structure: empty content array');
    }

    if (!response.content[0].text) {
      throw new ClaudeAPIError('Invalid response structure: no text in content');
    }

    const text = response.content[0].text.trim();
    if (text.length === 0) {
      throw new ClaudeAPIError('Claude returned an empty summary');
    }
  }

  /**
   * Format API response into standardized structure
   *
   * @param {Object} response - API response
   * @returns {Object} Formatted response
   * @private
   */
  formatResponse(response) {
    return {
      summary: response.content[0].text.trim(),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      stopReason: response.stop_reason,
    };
  }

  /**
   * Determine if an error should be retried
   *
   * @param {Error} error - Error to check
   * @returns {boolean} True if should retry
   * @private
   */
  shouldRetryError(error) {
    // Don't retry if circuit breaker is open
    if (error.code === 'CIRCUIT_BREAKER_OPEN') {
      return false;
    }

    // Use error's retryable property if available
    if (error.retryable !== undefined) {
      return error.retryable;
    }

    // Default retry logic
    return this.retryStrategy.defaultShouldRetry(error);
  }

  /**
   * Map API errors to custom error classes
   *
   * @param {Error} error - Original error
   * @returns {Error} Custom error
   * @private
   */
  mapError(error) {
    // Already a custom error
    if (error.retryable !== undefined) {
      return error;
    }

    const status = error.status || error.statusCode;
    const errorMessage = error.message || 'Unknown error';

    // Rate limit (429)
    if (status === 429) {
      const retryAfter = error.headers?.['retry-after']
        ? parseInt(error.headers['retry-after'], 10)
        : null;
      return new RateLimitError(
        `Rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter}s` : 'Please try again later'}`,
        retryAfter
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
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return new TimeoutError('Request timed out');
    }

    // Network errors
    if (
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET'
    ) {
      return new ClaudeAPIError(`Network error: ${error.code}`, error);
    }

    // Generic error
    return new ClaudeAPIError(
      config.nodeEnv === 'development'
        ? `Claude API error: ${errorMessage}`
        : 'An error occurred while processing your request',
      error
    );
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
        timeout: this.requestTimeout,
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
