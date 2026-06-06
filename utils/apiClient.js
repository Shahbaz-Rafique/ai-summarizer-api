const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

/**
 * API Client for Claude
 *
 * Single Responsibility: Execute HTTP requests to Claude API
 * Reason to Change: Claude API communication protocol changes
 */
class APIClient {
  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
      timeout: 30000,
    });

    this.requestTimeout = 30000; // 30 seconds
  }

  /**
   * Make API request to Claude
   *
   * @param {string} prompt - Formatted prompt
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Raw API response
   * @throws {Error} Network, timeout, or API errors
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
        },
      );

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error.name === 'AbortError' || controller.signal.aborted) {
        const timeoutError = new Error('Request to Claude API timed out after 30 seconds');
        timeoutError.code = 'ETIMEDOUT';
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }

      // Re-throw original error for mapping layer to handle
      throw error;
    }
  }

  /**
   * Get the underlying Anthropic client
   *
   * @returns {Anthropic} Anthropic client instance
   */
  getClient() {
    return this.client;
  }
}

module.exports = APIClient;
