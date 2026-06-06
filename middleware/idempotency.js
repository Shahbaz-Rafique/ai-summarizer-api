/**
 * Idempotency Middleware
 *
 * Ensures that duplicate requests (same Idempotency-Key) return the same response
 * without re-processing. Critical for avoiding duplicate charges and processing.
 *
 * Implementation:
 * - Uses in-memory Map (use Redis for production multi-instance)
 * - TTL of 24 hours
 * - Stores full response body and status code
 */

const crypto = require('crypto');
const metrics = require('../utils/metrics');

// In-memory store (use Redis for production)
const idempotencyStore = new Map();

// TTL for idempotency keys (24 hours)
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000;

// Cleanup interval (every hour)
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [key, data] of idempotencyStore.entries()) {
    if (now - data.timestamp > IDEMPOTENCY_TTL) {
      idempotencyStore.delete(key);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'idempotency_cleanup',
      removed: cleanedCount,
      remaining: idempotencyStore.size,
    }));
  }
}, 60 * 60 * 1000); // Run every hour

/**
 * Idempotency middleware
 *
 * Checks for Idempotency-Key header and returns cached response if found
 */
function idempotencyMiddleware(req, res, next) {
  const idempotencyKey = req.headers['idempotency-key'];

  // No idempotency key provided - process normally
  if (!idempotencyKey) {
    return next();
  }

  // Validate idempotency key format (should be a UUID or similar)
  if (!isValidIdempotencyKey(idempotencyKey)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be a valid UUID or unique string (max 255 chars)',
        field: 'Idempotency-Key',
      },
      requestId: req.id,
    });
  }

  // Create storage key (include method and path for safety)
  const storageKey = createStorageKey(req.method, req.path, idempotencyKey);

  // Check if we have a cached response
  const cached = idempotencyStore.get(storageKey);

  if (cached) {
    // Cache hit - return cached response
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'idempotency_cache_hit',
      requestId: req.id,
      idempotencyKey: hashKey(idempotencyKey),
      age: Date.now() - cached.timestamp,
    }));

    metrics.trackIdempotencyCacheHit();

    // Set cache headers
    res.setHeader('X-Idempotency-Cache', 'HIT');
    res.setHeader('X-Idempotency-Age', Math.floor((Date.now() - cached.timestamp) / 1000));

    return res.status(cached.statusCode).json(cached.body);
  }

  // Cache miss - process request and cache response
  metrics.trackIdempotencyCacheMiss();
  res.setHeader('X-Idempotency-Cache', 'MISS');

  // Intercept response to cache it
  const originalJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);

  let statusCode = 200;

  // Override status() to capture status code
  res.status = function(code) {
    statusCode = code;
    return originalStatus(code);
  };

  // Override json() to cache response
  res.json = function(body) {
    // Only cache successful responses (2xx)
    if (statusCode >= 200 && statusCode < 300) {
      idempotencyStore.set(storageKey, {
        statusCode,
        body,
        timestamp: Date.now(),
      });

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'idempotency_cache_store',
        requestId: req.id,
        idempotencyKey: hashKey(idempotencyKey),
        statusCode,
      }));
    }

    return originalJson(body);
  };

  next();
}

/**
 * Validate idempotency key format
 */
function isValidIdempotencyKey(key) {
  if (typeof key !== 'string') return false;
  if (key.length === 0 || key.length > 255) return false;

  // Check for valid characters (alphanumeric, hyphens, underscores)
  return /^[a-zA-Z0-9_-]+$/.test(key);
}

/**
 * Create storage key
 */
function createStorageKey(method, path, idempotencyKey) {
  return `${method}:${path}:${idempotencyKey}`;
}

/**
 * Hash key for logging (don't log actual keys)
 */
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
}

/**
 * Get idempotency store stats (for monitoring)
 */
function getStats() {
  const now = Date.now();
  let expiredCount = 0;

  for (const [, data] of idempotencyStore.entries()) {
    if (now - data.timestamp > IDEMPOTENCY_TTL) {
      expiredCount++;
    }
  }

  return {
    totalKeys: idempotencyStore.size,
    expiredKeys: expiredCount,
    activeKeys: idempotencyStore.size - expiredCount,
    ttlMs: IDEMPOTENCY_TTL,
  };
}

/**
 * Clear all idempotency keys (for testing)
 */
function clearAll() {
  idempotencyStore.clear();
}

module.exports = {
  idempotencyMiddleware,
  getStats,
  clearAll,
};
