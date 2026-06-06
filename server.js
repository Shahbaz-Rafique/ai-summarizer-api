const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const config = require('./config');
const summarizeRouter = require('./routes/summarize');
const rateLimiter = require('./middleware/rateLimit');
const errorHandler = require('./middleware/errorHandler');
const {
  requestId,
  securityHeaders,
  corsHandler,
  sanitizeRequest,
} = require('./middleware/security');
const { idempotencyMiddleware } = require('./middleware/idempotency');
const metrics = require('./utils/metrics');

const app = express();

// Load OpenAPI specification
const swaggerDocument = YAML.load('./openapi.yaml');

// Disable Express fingerprinting
app.disable('x-powered-by');

// Track active connections for graceful shutdown
const activeConnections = new Set();
let isShuttingDown = false;

// ============================================================================
// MIDDLEWARE (Order matters!)
// ============================================================================

// 1. Request ID generation (must be first for logging/tracing)
app.use(requestId);

// 2. Metrics collection (track all requests)
app.use(metrics.metricsMiddleware);

// 3. Security headers (before any processing)
app.use(securityHeaders);

// 4. CORS handling (after security headers)
app.use(corsHandler);

// 5. Request sanitization
app.use(sanitizeRequest);

// 5. Request logging (after request ID is assigned)
app.use((req, res, next) => {
  const startTime = Date.now();

  // Log request securely (never log request body or user data)
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: 'request',
    requestId: req.id,
    method: req.method,
    path: req.path,
    // Anonymize IP for privacy
    ip: sanitizeIP(req.headers['x-forwarded-for'] || req.socket.remoteAddress),
    userAgent: req.headers['user-agent'] ? '[redacted]' : undefined,
  }));

  // Log response (without response body)
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'response',
      requestId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration,
    }));
  });

  next();
});

// Helper function to anonymize IP addresses
function sanitizeIP(ip) {
  if (!ip) { return 'unknown'; }
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.xxx` : 'unknown';
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.length >= 4 ? `${parts.slice(0, 4).join(':')}:xxxx:xxxx:xxxx:xxxx` : 'unknown';
  }
  return 'unknown';
}

// 6. Track connections for graceful shutdown
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.set('Connection', 'close');
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_SHUTTING_DOWN',
        message: 'Service is shutting down, please retry your request',
      },
      requestId: req.id,
    });
  }

  activeConnections.add(req.socket);
  req.socket.on('close', () => {
    activeConnections.delete(req.socket);
  });

  next();
});

// 7. Body parsing (with strict size limits)
app.use(express.json({
  limit: '1mb',
  strict: true,
}));

app.use(express.urlencoded({
  extended: false, // Use simple parser for security
  limit: '1mb',
}));

// 8. Request timeout (prevent resource exhaustion)
app.use((req, res, next) => {
  req.setTimeout(65000, () => {
    res.status(408).json({
      success: false,
      error: {
        code: 'REQUEST_TIMEOUT',
        message: 'Request took too long to process',
      },
      requestId: req.id,
    });
  });

  next();
});

// ============================================================================
// ROUTES
// ============================================================================

// Root endpoint (no sensitive info)
app.get('/', (req, res) => {
  res.json({
    service: 'AI Summarizer API',
    version: '1.0.0',
    status: 'running',
    documentation: {
      openapi: 'GET /docs',
      summarize: 'POST /api/summarize',
      health: 'GET /health',
      metrics: 'GET /metrics',
      options: 'GET /api/summarize/options',
    },
  });
});

// OpenAPI/Swagger documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'AI Summarizer API Documentation',
}));

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metrics.register.contentType);
    const metricsData = await metrics.register.metrics();
    res.end(metricsData);
  } catch (error) {
    res.status(500).end(error.message);
  }
});

// Health check endpoints
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      formatted: formatUptime(uptime),
    },
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
    },
    environment: config.nodeEnv,
    activeConnections: activeConnections.size,
  });
});

// Readiness probe (for Kubernetes/Docker)
app.get('/ready', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({
      status: 'not ready',
      reason: 'shutting down',
    });
  }

  res.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

// Liveness probe (for Kubernetes/Docker)
app.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

// Apply idempotency, then rate limiting to API routes
app.use('/api/summarize', idempotencyMiddleware);
app.use('/api/summarize', rateLimiter);

// API routes
app.use('/api/summarize', summarizeRouter);

// 404 handler (must be after all valid routes)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `The endpoint ${req.method} ${req.path} does not exist`,
      availableEndpoints: [
        'GET /',
        'GET /docs',
        'GET /health',
        'GET /ready',
        'GET /live',
        'GET /metrics',
        'POST /api/summarize',
        'GET /api/summarize/health',
        'GET /api/summarize/options',
      ],
    },
    requestId: req.id,
  });
});

// Error handler (must be last middleware)
app.use(errorHandler);

// ============================================================================
// SERVER LIFECYCLE
// ============================================================================

let server;

function startServer() {
  return new Promise((resolve, reject) => {
    try {
      server = app.listen(config.port, () => {
        const safeConfig = config.getSafeConfig();

        console.log('='.repeat(60));
        console.log('🚀 AI Summarizer API Started Successfully');
        console.log('='.repeat(60));
        console.log(`📍 Server:      http://localhost:${safeConfig.port}`);
        console.log(`🌍 Environment: ${safeConfig.nodeEnv}`);
        console.log(`🤖 Model:       ${safeConfig.anthropic.model}`);
        console.log(`🔑 API Key:     ${safeConfig.anthropic.apiKeyConfigured ? 'Configured' : 'NOT CONFIGURED'}`);
        console.log('⏱️  Timeout:     30 seconds');
        console.log('🔄 Max Retries: 3 with exponential backoff');
        console.log(`📊 Rate Limit:  ${safeConfig.rateLimit.maxRequests} req/${safeConfig.rateLimit.windowMs}ms`);
        console.log('='.repeat(60));
        console.log('Available Endpoints:');
        console.log('  GET  /              - API information');
        console.log('  GET  /health        - Server health check');
        console.log('  GET  /ready         - Readiness probe');
        console.log('  GET  /live          - Liveness probe');
        console.log('  POST /api/summarize - Summarize text');
        console.log('  GET  /api/summarize/health  - Service health');
        console.log('  GET  /api/summarize/options - API options');
        console.log('='.repeat(60));

        resolve(server);
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${config.port} is already in use`);
        } else {
          console.error('❌ Server error:', error.message);
        }
        reject(error);
      });

      // Set keep-alive timeout
      server.keepAliveTimeout = 65000;
      server.headersTimeout = 66000;
    } catch (error) {
      reject(error);
    }
  });
}

async function shutdown(signal) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`⚠️  Received ${signal} - Starting graceful shutdown...`);
  console.log('='.repeat(60));

  isShuttingDown = true;

  if (server) {
    server.close(() => {
      console.log('✅ Server closed - no longer accepting new connections');
    });
  }

  // Wait for active connections to finish
  const shutdownTimeout = 10000;
  const checkInterval = 100;
  let elapsed = 0;

  while (activeConnections.size > 0 && elapsed < shutdownTimeout) {
    console.log(`⏳ Waiting for ${activeConnections.size} active connection(s) to finish...`);
    await sleep(checkInterval);
    elapsed += checkInterval;
  }

  if (activeConnections.size > 0) {
    console.log(`⚠️  Forcing shutdown with ${activeConnections.size} active connection(s)`);
    for (const socket of activeConnections) {
      socket.destroy();
    }
  }

  console.log('='.repeat(60));
  console.log('✅ Graceful shutdown complete');
  console.log('='.repeat(60));

  process.exit(0);
}

// ============================================================================
// SIGNAL HANDLERS
// ============================================================================

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) { parts.push(`${days}d`); }
  if (hours > 0) { parts.push(`${hours}h`); }
  if (minutes > 0) { parts.push(`${minutes}m`); }
  if (secs > 0 || parts.length === 0) { parts.push(`${secs}s`); }

  return parts.join(' ');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// START SERVER
// ============================================================================

if (require.main === module) {
  startServer().catch((error) => {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  });
}

module.exports = app;
