require('dotenv').config();

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Anthropic API
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS, 10) || 4096,
    temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 1.0,
    timeout: parseInt(process.env.CLAUDE_TIMEOUT_MS, 10) || 60000,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 10,
  },

  // Input Validation
  validation: {
    maxInputLength: parseInt(process.env.MAX_INPUT_LENGTH, 10) || 500000,
    minInputLength: parseInt(process.env.MIN_INPUT_LENGTH, 10) || 10,
  },

  // Circuit Breaker
  circuitBreaker: {
    threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD, 10) || 5,
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS, 10) || 30000,
  },
};

// Validate required configuration
function validateConfig() {
  const errors = [];

  if (!config.anthropic.apiKey) {
    errors.push('ANTHROPIC_API_KEY is required');
  }

  // Validate API key format without exposing the actual key
  if (config.anthropic.apiKey && !config.anthropic.apiKey.startsWith('sk-ant-')) {
    errors.push('ANTHROPIC_API_KEY format is invalid');
  }

  // Validate API key length without exposing it
  if (config.anthropic.apiKey && config.anthropic.apiKey.length < 20) {
    errors.push('ANTHROPIC_API_KEY appears to be invalid (too short)');
  }

  if (config.anthropic.maxTokens < 1 || config.anthropic.maxTokens > 8192) {
    errors.push('CLAUDE_MAX_TOKENS must be between 1 and 8192');
  }

  // Validate port range
  if (config.port < 1 || config.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  // Validate rate limit configuration
  if (config.rateLimit.maxRequests < 1 || config.rateLimit.maxRequests > 10000) {
    errors.push('RATE_LIMIT_MAX_REQUESTS must be between 1 and 10000');
  }

  if (config.rateLimit.windowMs < 1000 || config.rateLimit.windowMs > 3600000) {
    errors.push('RATE_LIMIT_WINDOW_MS must be between 1000 and 3600000');
  }

  if (errors.length > 0) {
    // Don't include the actual config values in the error message
    throw new Error(`Configuration validation failed. Check your environment variables:\n${errors.join('\n')}`);
  }
}

// Sanitize config for logging (remove sensitive values)
function getSafeConfig() {
  return {
    port: config.port,
    nodeEnv: config.nodeEnv,
    anthropic: {
      model: config.anthropic.model,
      maxTokens: config.anthropic.maxTokens,
      temperature: config.anthropic.temperature,
      timeout: config.anthropic.timeout,
      // Never log the actual API key
      apiKeyConfigured: !!config.anthropic.apiKey,
    },
    rateLimit: config.rateLimit,
    validation: config.validation,
    circuitBreaker: config.circuitBreaker,
  };
}

config.getSafeConfig = getSafeConfig;

if (config.nodeEnv !== 'test') {
  validateConfig();
}

module.exports = config;
