const { ClaudeAPIError } = require('./errors');

/**
 * Response Handler
 *
 * Single Responsibility: Validate and format Claude API responses
 * Reason to Change: Claude response structure changes
 */

/**
 * Validate API response structure
 *
 * @param {Object} response - API response
 * @throws {ClaudeAPIError} If response is invalid
 */
function validateResponse(response) {
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
 * @param {Object} response - Raw API response
 * @returns {Object} Formatted response with summary, usage, model, stopReason
 */
function formatResponse(response) {
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
 * Extract usage metrics from response
 *
 * @param {Object} response - API response
 * @returns {Object} Usage metrics
 */
function extractUsage(response) {
  return {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    totalTokens: response.usage.input_tokens + response.usage.output_tokens,
  };
}

module.exports = {
  validateResponse,
  formatResponse,
  extractUsage,
};
