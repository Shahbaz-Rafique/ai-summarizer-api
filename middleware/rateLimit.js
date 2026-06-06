const config = require('../config');
const metrics = require('../utils/metrics');

// In-memory store for rate limiting (use Redis for production multi-instance)
const rateLimitStore = new Map();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.resetTime > config.rateLimit.windowMs) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function getClientIdentifier(req) {
  // Prefer API key if present, otherwise use IP
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    return `key:${apiKey}`;
  }

  // Get IP from X-Forwarded-For or socket
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
  return `ip:${ip}`;
}

function rateLimiter(req, res, next) {
  const identifier = getClientIdentifier(req);
  const now = Date.now();

  // Get or create rate limit data for this client
  let clientData = rateLimitStore.get(identifier);

  if (!clientData) {
    // First request from this client
    clientData = {
      count: 0,
      resetTime: now + config.rateLimit.windowMs,
    };
    rateLimitStore.set(identifier, clientData);
  }

  // Check if window has expired
  if (now > clientData.resetTime) {
    // Reset the window
    clientData.count = 0;
    clientData.resetTime = now + config.rateLimit.windowMs;
  }

  // Increment request count
  clientData.count++;

  // Set rate limit headers
  const remaining = Math.max(0, config.rateLimit.maxRequests - clientData.count);
  const resetTime = Math.ceil((clientData.resetTime - now) / 1000);

  res.setHeader('X-RateLimit-Limit', config.rateLimit.maxRequests);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetTime);

  // Check if limit exceeded
  if (clientData.count > config.rateLimit.maxRequests) {
    // Track rate limit violation
    const identifierType = identifier.startsWith('key:') ? 'api_key' : 'ip';
    metrics.trackRateLimitExceeded(identifierType);

    return res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      retryAfter: resetTime,
    });
  }

  next();
}

module.exports = rateLimiter;
