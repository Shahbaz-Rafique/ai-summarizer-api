# Batch Summarization API

Process multiple texts concurrently with graceful partial failure handling.

## Overview

The batch endpoint allows you to summarize multiple texts in a single request, processing them concurrently with a configurable concurrency limit.

**Endpoint**: `POST /api/summarize/batch`

**Features**:
- Process up to 10 texts per batch
- Concurrent processing (3 at a time)
- Graceful partial failure handling
- Progress tracking
- Idempotency support
- Individual options per text

## Request Format

```json
{
  "items": [
    {
      "text": "First text to summarize (50-10000 characters)...",
      "length": "short",    // optional
      "format": "bullets",   // optional
      "language": "English"  // optional
    },
    {
      "text": "Second text to summarize...",
      "length": "medium",
      "format": "paragraph"
    }
  ]
}
```

### Request Constraints

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `items` | array | Yes | 1-10 items |
| `items[].text` | string | Yes | 50-10,000 characters |
| `items[].length` | enum | No | `short` \| `medium` \| `long` |
| `items[].format` | enum | No | `bullets` \| `paragraph` |
| `items[].language` | string | No | Max 50 characters |

## Response Format

### Success (200)

All items processed successfully:

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "index": 0,
        "data": {
          "summary": "The generated summary...",
          "metadata": {
            "model": "claude-sonnet-4-6",
            "usage": {
              "inputTokens": 100,
              "outputTokens": 50,
              "totalTokens": 150
            },
            "stopReason": "end_turn"
          }
        }
      },
      {
        "index": 1,
        "data": {
          "summary": "Another summary...",
          "metadata": { ... }
        }
      }
    ],
    "errors": [],
    "summary": {
      "total": 2,
      "successful": 2,
      "failed": 0,
      "processingTimeMs": 3456
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Partial Success (207 Multi-Status)

Some items succeeded, some failed:

```json
{
  "success": false,
  "data": {
    "results": [
      {
        "index": 0,
        "data": {
          "summary": "Successfully processed...",
          "metadata": { ... }
        }
      }
    ],
    "errors": [
      {
        "index": 1,
        "error": {
          "code": "RATE_LIMIT_EXCEEDED",
          "message": "Rate limit exceeded for this item",
          "retryable": true
        }
      },
      {
        "index": 2,
        "error": {
          "code": "TIMEOUT",
          "message": "Request timed out",
          "retryable": true
        }
      }
    ],
    "summary": {
      "total": 3,
      "successful": 1,
      "failed": 2,
      "processingTimeMs": 5678
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Total Failure (500)

All items failed:

```json
{
  "success": false,
  "data": {
    "results": [],
    "errors": [
      {
        "index": 0,
        "error": {
          "code": "CIRCUIT_BREAKER_OPEN",
          "message": "Circuit breaker is open",
          "retryable": true
        }
      }
    ],
    "summary": {
      "total": 1,
      "successful": 0,
      "failed": 1,
      "processingTimeMs": 123
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | All items processed successfully |
| 207 | Partial success (some succeeded, some failed) |
| 400 | Bad request (validation errors) |
| 429 | Rate limit exceeded |
| 500 | All items failed |

## Examples

### Basic Batch Request

```bash
curl -X POST http://localhost:3000/api/summarize/batch \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "text": "Artificial intelligence (AI) is intelligence demonstrated by machines, in contrast to the natural intelligence displayed by humans and animals. Leading AI textbooks define the field as the study of intelligent agents."
      },
      {
        "text": "Machine learning is a subset of artificial intelligence that focuses on building applications that learn from data and improve their accuracy over time without being programmed to do so."
      }
    ]
  }'
```

### With Different Options Per Item

```bash
curl -X POST http://localhost:3000/api/summarize/batch \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "text": "First text...",
        "length": "short",
        "format": "bullets"
      },
      {
        "text": "Second text...",
        "length": "long",
        "format": "paragraph",
        "language": "Spanish"
      },
      {
        "text": "Third text...",
        "length": "medium"
      }
    ]
  }'
```

### With Idempotency Key

```bash
IDEMPOTENCY_KEY=$(uuidgen)

curl -X POST http://localhost:3000/api/summarize/batch \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "items": [
      {"text": "First text..."},
      {"text": "Second text..."}
    ]
  }'

# Retry with same key returns cached response
curl -X POST http://localhost:3000/api/summarize/batch \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "items": [
      {"text": "First text..."},
      {"text": "Second text..."}
    ]
  }'
```

## Handling Partial Failures

### Client-Side Retry Logic

```javascript
async function batchSummarizeWithRetry(items, maxRetries = 3) {
  let failedItems = items;
  let allResults = [];
  let attempt = 0;

  while (failedItems.length > 0 && attempt < maxRetries) {
    const response = await fetch('/api/summarize/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: failedItems }),
    });

    const data = await response.json();

    // Collect successful results
    allResults.push(...data.data.results);

    // Filter for retryable failures
    failedItems = data.data.errors
      .filter(error => error.error.retryable)
      .map(error => items[error.index]);

    attempt++;

    if (failedItems.length > 0) {
      // Exponential backoff
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }

  return {
    successes: allResults,
    failures: failedItems,
  };
}
```

### Processing Results

```javascript
const response = await fetch('/api/summarize/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ items }),
});

const data = await response.json();

// Check overall status
if (response.status === 200) {
  console.log('All succeeded!');
  console.log(data.data.results);
} else if (response.status === 207) {
  console.log('Partial success');
  console.log(`${data.data.summary.successful} succeeded`);
  console.log(`${data.data.summary.failed} failed`);

  // Process successes
  data.data.results.forEach(result => {
    console.log(`Item ${result.index}: ${result.data.summary}`);
  });

  // Handle failures
  data.data.errors.forEach(error => {
    console.error(`Item ${error.index} failed: ${error.error.message}`);
    if (error.error.retryable) {
      console.log('Can retry this item');
    }
  });
} else if (response.status === 500) {
  console.error('All failed');
  console.error(data.data.errors);
}
```

## Performance Characteristics

### Concurrency

- **Concurrency Limit**: 3 (processes 3 texts simultaneously)
- **Max Batch Size**: 10 texts
- **Why Limit Concurrency**: Prevents overwhelming Claude API, reduces rate limit hits

### Timing

For a batch of 10 texts with average processing time of 2 seconds per text:

- **Without Concurrency**: ~20 seconds (sequential)
- **With Concurrency (3)**: ~7 seconds (3 + 3 + 3 + 1)
- **Speedup**: ~3x faster

### Cost Optimization

Batch requests:
- Share the same HTTP connection overhead
- Can be idempotent (retry whole batch)
- Reduce network round-trips
- Enable better error handling

## Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `BATCH_TOO_LARGE` | More than 10 items | No |
| `BATCH_TOO_SMALL` | Less than 1 item | No |
| `BATCH_VALIDATION_ERRORS` | Item validation failed | No |
| `TEXT_TOO_SHORT` | Text < 50 characters | No |
| `TEXT_TOO_LONG` | Text > 10,000 characters | No |
| `RATE_LIMIT_EXCEEDED` | Rate limit hit | Yes |
| `TIMEOUT` | Request timeout | Yes |
| `CIRCUIT_BREAKER_OPEN` | Circuit breaker open | Yes |
| `SERVICE_OVERLOADED` | Claude API overloaded | Yes |
| `CLAUDE_API_ERROR` | Generic Claude error | Maybe |

## Monitoring

### Metrics

The batch endpoint tracks:
- `summarization_requests_total{length="batch"}` - Batch request count
- `summarization_duration_seconds` - Batch processing time
- Individual item token usage
- Partial success vs total success rates

### Prometheus Queries

```promql
# Batch request rate
rate(summarization_requests_total{length="batch"}[5m])

# Average batch size
avg(batch_size) by (job)

# Batch success rate
rate(http_requests_total{route="/api/summarize/batch",status_code="200"}[5m]) /
rate(http_requests_total{route="/api/summarize/batch"}[5m])

# Partial failure rate
rate(http_requests_total{route="/api/summarize/batch",status_code="207"}[5m])
```

## Best Practices

### 1. Use Idempotency Keys

Always include an `Idempotency-Key` header for batch requests to safely retry:

```bash
curl -H "Idempotency-Key: $(uuidgen)" ...
```

### 2. Handle Partial Failures

Check the response status and handle 207 Multi-Status appropriately:

```javascript
if (response.status === 207) {
  // Some succeeded, some failed - handle both
}
```

### 3. Retry Only Retryable Errors

```javascript
const retryableErrors = errors.filter(e => e.error.retryable);
```

### 4. Optimize Batch Size

- **Small batches** (2-3 items): Lower latency, easier to retry
- **Large batches** (8-10 items): Better throughput, but longer total time

### 5. Monitor Costs

Batch requests can be more cost-effective, but monitor total token usage:

```bash
curl http://localhost:3000/metrics | grep summarization_tokens_total
```

## Limitations

### Current Implementation

- **In-Memory Queue**: For multi-instance deployments, use Redis-backed queue
- **No Streaming**: Results returned when all items complete
- **Fixed Concurrency**: Concurrency of 3 is hardcoded (consider making configurable)

### Future Enhancements

- [ ] Configurable concurrency per request
- [ ] Streaming results as they complete (SSE)
- [ ] Redis-backed queue for distributed processing
- [ ] Priority queue support
- [ ] Webhook callbacks for completed batches
- [ ] Batch status polling endpoint

## Related Documentation

- [Production Features](PRODUCTION_FEATURES.md) - Metrics, monitoring, idempotency
- [API Documentation](http://localhost:3000/docs) - Interactive Swagger UI
- [Security Policy](SECURITY.md) - Security best practices
