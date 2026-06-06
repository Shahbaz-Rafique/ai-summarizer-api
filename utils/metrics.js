/**
 * Prometheus Metrics Collection
 *
 * Tracks API performance, usage, and costs for monitoring and alerting
 */

const promClient = require('prom-client');
const config = require('../config');

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({
  register,
  prefix: 'nodejs_',
});

// ============================================================================
// HTTP Metrics
// ============================================================================

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// ============================================================================
// Summarization Metrics
// ============================================================================

const summarizationRequestsTotal = new promClient.Counter({
  name: 'summarization_requests_total',
  help: 'Total number of summarization requests',
  labelNames: ['length', 'format', 'language', 'status'],
  registers: [register],
});

const summarizationDuration = new promClient.Histogram({
  name: 'summarization_duration_seconds',
  help: 'Time spent calling Claude API',
  labelNames: ['status'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [register],
});

const summarizationTokensTotal = new promClient.Counter({
  name: 'summarization_tokens_total',
  help: 'Total tokens used (input + output)',
  labelNames: ['type'], // 'input' or 'output'
  registers: [register],
});

const summarizationCostUSD = new promClient.Counter({
  name: 'summarization_cost_usd_total',
  help: 'Total cost in USD (estimated)',
  registers: [register],
});

// ============================================================================
// Circuit Breaker Metrics
// ============================================================================

const circuitBreakerState = new promClient.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
  registers: [register],
});

const circuitBreakerFailures = new promClient.Counter({
  name: 'circuit_breaker_failures_total',
  help: 'Total circuit breaker failures',
  registers: [register],
});

// ============================================================================
// Rate Limiting Metrics
// ============================================================================

const rateLimitExceeded = new promClient.Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Total rate limit violations',
  labelNames: ['identifier_type'], // 'ip' or 'api_key'
  registers: [register],
});

// ============================================================================
// Idempotency Metrics
// ============================================================================

const idempotencyCacheHits = new promClient.Counter({
  name: 'idempotency_cache_hits_total',
  help: 'Total idempotency cache hits (requests served from cache)',
  registers: [register],
});

const idempotencyCacheMisses = new promClient.Counter({
  name: 'idempotency_cache_misses_total',
  help: 'Total idempotency cache misses (new requests)',
  registers: [register],
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate estimated cost based on token usage
 * Pricing as of 2026 (these are example rates - update with actual pricing)
 */
function calculateCost(model, inputTokens, outputTokens) {
  // Example pricing (update with actual Anthropic pricing)
  const pricing = {
    'claude-opus-4-8': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-sonnet-4-6': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-haiku-4-5': { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
  };

  const rates = pricing[model] || pricing['claude-sonnet-4-6'];
  const cost = (inputTokens * rates.input) + (outputTokens * rates.output);

  return cost;
}

/**
 * Map circuit breaker state to numeric value for Prometheus
 */
function mapCircuitBreakerState(state) {
  const mapping = {
    'CLOSED': 0,
    'HALF_OPEN': 1,
    'OPEN': 2,
  };
  return mapping[state] ?? 0;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Express middleware to track HTTP metrics
 */
function metricsMiddleware(req, res, next) {
  const start = Date.now();

  // Track response
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const route = req.route ? req.route.path : req.path;

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode,
      },
      duration
    );
  });

  next();
}

// ============================================================================
// Public API
// ============================================================================

module.exports = {
  register,
  metricsMiddleware,

  // HTTP metrics
  httpRequestsTotal,
  httpRequestDuration,

  // Summarization metrics
  trackSummarization: (options, duration, status) => {
    summarizationRequestsTotal.inc({
      length: options.length || 'medium',
      format: options.format || 'paragraph',
      language: options.language || 'default',
      status,
    });

    summarizationDuration.observe({ status }, duration);
  },

  trackTokenUsage: (inputTokens, outputTokens, model) => {
    summarizationTokensTotal.inc({ type: 'input' }, inputTokens);
    summarizationTokensTotal.inc({ type: 'output' }, outputTokens);

    const cost = calculateCost(model, inputTokens, outputTokens);
    summarizationCostUSD.inc(cost);
  },

  // Circuit breaker metrics
  updateCircuitBreakerState: (state) => {
    circuitBreakerState.set(mapCircuitBreakerState(state));
  },

  trackCircuitBreakerFailure: () => {
    circuitBreakerFailures.inc();
  },

  // Rate limiting metrics
  trackRateLimitExceeded: (identifierType) => {
    rateLimitExceeded.inc({ identifier_type: identifierType });
  },

  // Idempotency metrics
  trackIdempotencyCacheHit: () => {
    idempotencyCacheHits.inc();
  },

  trackIdempotencyCacheMiss: () => {
    idempotencyCacheMisses.inc();
  },
};
