const config = require('../config');

function errorHandler(err, req, res, next) {
  // Log error details securely (never log user text or PII)
  const errorLog = {
    timestamp: new Date().toISOString(),
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: sanitizeIP(req.headers['x-forwarded-for'] || req.socket.remoteAddress),
    error: {
      name: err.name,
      code: err.code,
      status: err.status,
      // Only include stack trace in development
      stack: config.nodeEnv === 'development' ? err.stack : undefined,
    },
  };

  // Log to console (in production, use proper logging service with security filtering)
  console.error(JSON.stringify(errorLog));

  // Handle Claude API errors (from claudeClient)
  if (err.code && err.status) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: sanitizeErrorMessage(err.message),
        retryable: err.retryable,
      },
      requestId: req.id,
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: sanitizeErrorMessage(err.message),
      },
      requestId: req.id,
    });
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
      },
      requestId: req.id,
    });
  }

  // Handle request timeout
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
    return res.status(504).json({
      success: false,
      error: {
        code: 'GATEWAY_TIMEOUT',
        message: 'Request timed out',
      },
      requestId: req.id,
    });
  }

  // Handle payload too large
  if (err.status === 413 || err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size',
      },
      requestId: req.id,
    });
  }

  // Default to 500 for unknown errors - never expose internal details
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: config.nodeEnv === 'development'
        ? sanitizeErrorMessage(err.message)
        : 'An unexpected error occurred. Please try again later.',
    },
    requestId: req.id,
  });
}

// Sanitize IP addresses for GDPR compliance (anonymize last octet)
function sanitizeIP(ip) {
  if (!ip) return 'unknown';

  // IPv4
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  }

  // IPv6 - anonymize last 64 bits
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 4) {
      return parts.slice(0, 4).join(':') + ':xxxx:xxxx:xxxx:xxxx';
    }
  }

  return 'unknown';
}

// Sanitize error messages to prevent information disclosure
function sanitizeErrorMessage(message) {
  if (!message) return 'An error occurred';

  // Remove file paths
  message = message.replace(/\/[^\s]+\.(js|ts|json)/g, '[file]');

  // Remove line numbers
  message = message.replace(/:\d+:\d+/g, '');

  // Remove stack trace fragments
  message = message.replace(/at\s+\S+\s+\([^)]+\)/g, '');

  // Remove absolute paths
  message = message.replace(/[A-Za-z]:\\[^\s]+/g, '[path]');
  message = message.replace(/\/[^\s]+\/[^\s]+/g, '[path]');

  // Truncate very long messages
  if (message.length > 200) {
    message = message.substring(0, 200) + '...';
  }

  return message.trim();
}

// Handle unhandled promise rejections securely
process.on('unhandledRejection', (reason, promise) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: 'unhandledRejection',
    reason: reason instanceof Error ? reason.message : String(reason),
    // Never log the full reason as it might contain sensitive data
  }));
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: 'uncaughtException',
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
    },
  }));

  // Give time to log before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

module.exports = errorHandler;
