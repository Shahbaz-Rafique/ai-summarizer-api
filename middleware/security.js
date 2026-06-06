const crypto = require('crypto');
const config = require('../config');

// Generate unique request ID for security auditing and request tracing
function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
}

// Comprehensive security headers middleware
function securityHeaders(req, res, next) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // XSS protection (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // HSTS - Force HTTPS (only in production)
  if (config.nodeEnv === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  // Content Security Policy - strict policy
  const cspDirectives = [
    "default-src 'none'",
    "base-uri 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // unsafe-inline needed for some frameworks
    "connect-src 'self'",
    'upgrade-insecure-requests',
  ];
  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  // Referrer Policy - don't leak origin
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy - disable unnecessary browser features
  const permissionsPolicy = [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ];
  res.setHeader('Permissions-Policy', permissionsPolicy.join(', '));

  // Remove X-Powered-By header to avoid tech stack disclosure
  res.removeHeader('X-Powered-By');

  // Cache control for API responses (don't cache)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  next();
}

// Secure CORS configuration
function corsHandler(req, res, next) {
  const { origin } = req.headers;

  // Whitelist of allowed origins
  const allowedOrigins = getAllowedOrigins();

  // Check if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Request-ID');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.setHeader('Access-Control-Allow-Credentials', 'false'); // Don't allow credentials
  } else if (config.nodeEnv === 'development' && !origin) {
    // Allow requests without origin in development (e.g., curl, Postman)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Request-ID');
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
}

// Get allowed origins from environment or default
function getAllowedOrigins() {
  if (config.nodeEnv === 'production') {
    // In production, read from environment variable
    const originsEnv = process.env.ALLOWED_ORIGINS;
    if (originsEnv) {
      return originsEnv.split(',').map((o) => o.trim()).filter(Boolean);
    }
    // Default production origins - should be configured via env var
    return [];
  }

  // Development - allow localhost on common ports
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:8080',
  ];
}

// Request sanitization - remove potentially dangerous headers
function sanitizeRequest(req, res, next) {
  // Remove headers that shouldn't come from clients
  delete req.headers['x-real-ip'];
  delete req.headers['x-original-url'];

  // Validate Content-Length to prevent integer overflow
  const contentLength = req.headers['content-length'];
  if (contentLength) {
    const length = parseInt(contentLength, 10);
    if (isNaN(length) || length < 0 || length > 10000000) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CONTENT_LENGTH',
          message: 'Invalid Content-Length header',
        },
      });
    }
  }

  next();
}

module.exports = {
  requestId,
  securityHeaders,
  corsHandler,
  sanitizeRequest,
};
