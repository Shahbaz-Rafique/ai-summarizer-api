const express = require('express');
const router = express.Router();
const claudeClient = require('../utils/claudeClient');
const { validateSummarizeRequest } = require('../middleware/validate');
const { validateBatchRequest } = require('../middleware/validateBatch');
const BatchProcessor = require('../utils/batchProcessor');
const metrics = require('../utils/metrics');

/**
 * POST /api/summarize
 *
 * Summarize text using Claude AI
 *
 * Request body:
 * - text (required): Text to summarize (50-10000 characters)
 * - length (optional): 'short' | 'medium' | 'long' (default: 'medium')
 * - format (optional): 'bullets' | 'paragraph' (default: 'paragraph')
 * - language (optional): Output language (e.g., 'English', 'Spanish', 'French')
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     summary: "The generated summary...",
 *     metadata: {
 *       model: "claude-sonnet-4-6",
 *       usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
 *       processingTimeMs: 1234
 *     }
 *   }
 * }
 */
router.post('/', validateSummarizeRequest, async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { text, length, format, language } = req.body;

    // Log request metadata ONLY (never log user text or PII)
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId: req.id,
      endpoint: '/api/summarize',
      textLength: text.length, // Log length, not content
      length: length || 'medium',
      format: format || 'paragraph',
      language: language || 'default',
      idempotencyKey: req.headers['idempotency-key'] ? '[present]' : '[absent]',
    }));

    // Call Claude API
    const result = await claudeClient.summarize(text, {
      length,
      format,
      language,
    });

    const duration = (Date.now() - startTime) / 1000; // Convert to seconds

    // Track metrics
    metrics.trackSummarization(
      { length, format, language },
      duration,
      'success'
    );

    metrics.trackTokenUsage(
      result.usage.inputTokens,
      result.usage.outputTokens,
      result.model
    );

    // Update circuit breaker state metric
    const circuitState = claudeClient.getCircuitState();
    metrics.updateCircuitBreakerState(circuitState.state);

    // Success response
    res.json({
      success: true,
      data: {
        summary: result.summary,
        metadata: {
          model: result.model,
          usage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
          },
          processingTimeMs: Math.round(duration * 1000),
          stopReason: result.stopReason,
        },
      },
      requestId: req.id,
    });

  } catch (error) {
    // Track failed request
    const duration = (Date.now() - startTime) / 1000;
    metrics.trackSummarization(
      { length: req.body.length, format: req.body.format, language: req.body.language },
      duration,
      'error'
    );

    // Track circuit breaker failures
    if (error.code === 'CIRCUIT_BREAKER_OPEN') {
      metrics.trackCircuitBreakerFailure();
    }

    // Update circuit breaker state
    const circuitState = claudeClient.getCircuitState();
    metrics.updateCircuitBreakerState(circuitState.state);

    // Pass to error handler middleware
    next(error);
  }
});

/**
 * GET /api/summarize/health
 *
 * Health check endpoint
 *
 * Returns:
 * - Service status
 * - Circuit breaker state
 * - Client statistics
 */
router.get('/health', (req, res) => {
  const circuitState = claudeClient.getCircuitState();
  const stats = claudeClient.getStats();

  const isHealthy = circuitState.state !== 'OPEN';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    service: 'ai-summarizer-api',
    version: '1.0.0',
    circuitBreaker: {
      state: circuitState.state,
      failureCount: circuitState.failureCount,
      successCount: circuitState.successCount,
      lastFailureTime: circuitState.lastFailureTime
        ? new Date(circuitState.lastFailureTime).toISOString()
        : null,
    },
    config: stats.config,
    requestId: req.id,
  });
});

/**
 * POST /api/summarize/batch
 *
 * Batch summarization endpoint
 * Processes up to 10 texts concurrently (concurrency limit: 3)
 * Returns partial results even if some requests fail
 */
router.post('/batch', validateBatchRequest, async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { items } = req.body;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId: req.id,
      endpoint: '/api/summarize/batch',
      batchSize: items.length,
      idempotencyKey: req.headers['idempotency-key'] ? '[present]' : '[absent]',
    }));

    // Create batch processor with concurrency limit of 3
    const batchProcessor = new BatchProcessor({ concurrency: 3 });

    // Process batch
    const results = await batchProcessor.process(
      items,
      async (item, index) => {
        // Summarize this item
        const result = await claudeClient.summarize(item.text, {
          length: item.length,
          format: item.format,
          language: item.language,
        });

        // Track token usage
        metrics.trackTokenUsage(
          result.usage.inputTokens,
          result.usage.outputTokens,
          result.model
        );

        return {
          summary: result.summary,
          metadata: {
            model: result.model,
            usage: result.usage,
            stopReason: result.stopReason,
          },
        };
      },
      {
        onProgress: (progress) => {
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            requestId: req.id,
            type: 'batch_progress',
            ...progress,
          }));
        },
        logger: {
          error: (data) => console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            requestId: req.id,
            type: 'batch_item_error',
            ...data,
          })),
        },
      }
    );

    const duration = Date.now() - startTime;

    // Determine response status code based on results
    let statusCode = 200;
    if (BatchProcessor.isTotalFailure(results)) {
      statusCode = 500; // All failed
    } else if (BatchProcessor.isPartialSuccess(results)) {
      statusCode = 207; // Multi-Status (partial success)
    }

    // Track batch metrics
    const batchDuration = duration / 1000;
    metrics.trackSummarization(
      { length: 'batch', format: 'batch', language: 'batch' },
      batchDuration,
      statusCode === 200 ? 'success' : 'partial'
    );

    // Update circuit breaker state
    const circuitState = claudeClient.getCircuitState();
    metrics.updateCircuitBreakerState(circuitState.state);

    res.status(statusCode).json({
      success: statusCode === 200,
      data: {
        results: results.successes,
        errors: results.failures,
        summary: {
          total: results.totalItems,
          successful: results.successCount,
          failed: results.failureCount,
          processingTimeMs: duration,
        },
      },
      requestId: req.id,
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    // Track failed batch
    metrics.trackSummarization(
      { length: 'batch', format: 'batch', language: 'batch' },
      duration / 1000,
      'error'
    );

    next(error);
  }
});

/**
 * GET /api/summarize/options
 *
 * Get available options for summarization
 */
router.get('/options', (req, res) => {
  res.json({
    success: true,
    data: {
      length: {
        type: 'enum',
        required: false,
        default: 'medium',
        values: ['short', 'medium', 'long'],
        descriptions: {
          short: '1-2 sentences',
          medium: '3-5 sentences (concise paragraph)',
          long: '2-3 paragraphs (detailed)',
        },
      },
      format: {
        type: 'enum',
        required: false,
        default: 'paragraph',
        values: ['bullets', 'paragraph'],
        descriptions: {
          bullets: 'Summary formatted as bullet points',
          paragraph: 'Summary formatted as continuous text',
        },
      },
      language: {
        type: 'string',
        required: false,
        default: 'English (inferred)',
        maxLength: 50,
        description: 'Output language for the summary (e.g., "English", "Spanish", "French", "German", "Japanese")',
      },
      text: {
        type: 'string',
        required: true,
        minLength: 50,
        maxLength: 10000,
        description: 'The text to summarize',
      },
    },
    requestId: req.id,
  });
});

module.exports = router;
