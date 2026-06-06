# Test Coverage Plan

**Date**: 2026-06-06  
**Current Test-to-Code Ratio**: 0.45 (1,457 test lines / 3,219 source lines)  
**Target Ratio**: 1.0  
**Gap**: 1,762 test lines needed

---

## Current State

### Existing Test Files (2)

| Test File | Lines | Coverage |
|-----------|-------|----------|
| `__tests__/utils/claudeClient.test.js` | ~800 | ✅ Good |
| `__tests__/routes/summarize.test.js` | ~657 | ✅ Good |
| **Total** | **1,457** | **2 files** |

### Source Files Needing Tests (17)

| Source File | Lines | Tests? | Priority |
|-------------|-------|--------|----------|
| utils/apiClient.js | 78 | ❌ | 🔴 CRITICAL |
| utils/responseHandler.js | 72 | ❌ | 🔴 CRITICAL |
| utils/errorMapper.js | 120 | ❌ | 🔴 CRITICAL |
| utils/retry.js | 149 | ❌ | 🔴 CRITICAL |
| utils/circuitBreaker.js | 176 | ❌ | 🔴 CRITICAL |
| utils/promptBuilder.js | 129 | ❌ | 🔴 CRITICAL |
| utils/batchProcessor.js | 200 | ❌ | 🔴 CRITICAL |
| utils/metrics.js | 235 | ❌ | 🟡 HIGH |
| utils/errors.js | 65 | ❌ | 🟢 MEDIUM |
| middleware/security.js | 154 | ❌ | 🔴 CRITICAL |
| middleware/errorHandler.js | 173 | ❌ | 🔴 CRITICAL |
| middleware/idempotency.js | 193 | ❌ | 🔴 CRITICAL |
| middleware/rateLimit.js | 80 | ❌ | 🔴 CRITICAL |
| middleware/validate.js | 225 | ❌ | 🔴 CRITICAL |
| middleware/validateBatch.js | 237 | ❌ | 🔴 CRITICAL |
| config/index.js | 103 | ❌ | 🟢 MEDIUM |
| server.js | 393 | ❌ | 🟡 HIGH |

**Total Untested**: 2,782 lines  
**Tests Needed**: ~2,782 lines (1:1 ratio)

---

## Test Requirements by Module

### 1. utils/apiClient.js (78 lines) → Need ~100 test lines

**Functions to Test**:
- `constructor()` - Initialize Anthropic client
- `makeRequest(prompt, options)` - API call with timeout
- `getClient()` - Return client instance

**Test Cases**:
```
✅ Happy Path
  - Successful API request
  - Returns raw response
  - Clears timeout on success

❌ Error Cases
  - Timeout (AbortController)
  - Network errors (ECONNREFUSED, ENOTFOUND)
  - API errors (passthrough)

🔲 Edge Cases
  - Very long prompts
  - Missing options
  - Invalid model name

📏 Boundary Conditions
  - Timeout exactly at 30s
  - Response at 29.9s (just before timeout)
```

**Estimated**: 15 tests, ~100 lines

---

### 2. utils/responseHandler.js (72 lines) → Need ~90 test lines

**Functions to Test**:
- `validateResponse(response)` - Check structure
- `formatResponse(response)` - Transform to standard shape
- `extractUsage(response)` - Pull token metrics

**Test Cases**:
```
✅ Happy Path
  - Valid response passes validation
  - Formatted response has correct structure
  - Usage extracted correctly

❌ Error Cases
  - Missing content array
  - Empty content array
  - Missing text field
  - Empty text (whitespace only)

🔲 Edge Cases
  - Multiple content blocks (use first)
  - Extra fields in response
  - stop_reason variations

📏 Boundary Conditions
  - Single character text
  - Very long text (10k+ chars)
```

**Estimated**: 12 tests, ~90 lines

---

### 3. utils/errorMapper.js (120 lines) → Need ~150 test lines

**Functions to Test**:
- `mapError(error)` - Status → custom error
- `shouldRetryError(error)` - Retry predicate
- `extractRetryAfter(headers)` - Parse retry-after

**Test Cases**:
```
✅ Happy Path
  - 429 → RateLimitError
  - 503/529 → ServiceOverloadedError
  - 401/403 → AuthenticationError
  - 400 → InvalidRequestError
  - ETIMEDOUT → TimeoutError

❌ Error Cases
  - Unknown status code
  - Missing headers
  - Invalid retry-after value

🔲 Edge Cases
  - Already custom error (passthrough)
  - Circuit breaker open (no retry)
  - Network errors (ENOTFOUND, ECONNREFUSED)

📏 Boundary Conditions
  - retry-after = 0
  - retry-after = 999999
  - Missing error.status
```

**Estimated**: 18 tests, ~150 lines

---

### 4. utils/retry.js (149 lines) → Need ~180 test lines

**Functions to Test**:
- `execute(fn, options)` - Retry with backoff
- `calculateDelay(attempt)` - Exponential backoff
- `defaultShouldRetry(error)` - Retry predicate

**Test Cases**:
```
✅ Happy Path
  - Succeeds on first attempt
  - Succeeds on 2nd attempt
  - Respects maxRetries

❌ Error Cases
  - All retries exhausted
  - Non-retryable error (fails immediately)
  - onRetry callback called correctly

🔲 Edge Cases
  - Jitter varies delay
  - Respects retry-after header
  - maxDelayMs caps delay

📏 Boundary Conditions
  - maxRetries = 0 (no retries)
  - maxRetries = 10 (many retries)
  - baseDelayMs = 0
  - maxDelayMs < baseDelayMs
```

**Estimated**: 20 tests, ~180 lines

---

### 5. utils/circuitBreaker.js (176 lines) → Need ~200 test lines

**Functions to Test**:
- `execute(fn)` - Execute with circuit breaker
- `getState()` - Get current state
- `reset()` - Reset to CLOSED

**Test Cases**:
```
✅ Happy Path
  - CLOSED → executes function
  - Success increments success count
  - Multiple successes stay CLOSED

❌ Error Cases
  - Failure increments failure count
  - threshold failures → OPEN
  - OPEN rejects immediately
  - HALF_OPEN → OPEN on failure
  - HALF_OPEN → CLOSED after recoveryAttempts

🔲 Edge Cases
  - Client errors (4xx) don't trip circuit
  - Server errors (5xx) trip circuit
  - timeout transitions OPEN → HALF_OPEN

📏 Boundary Conditions
  - threshold = 1 (trips immediately)
  - threshold = 100 (rarely trips)
  - recoveryAttempts = 1
  - recoveryAttempts = 10
```

**Estimated**: 25 tests, ~220 lines

---

### 6. utils/promptBuilder.js (129 lines) → Need ~140 test lines

**Functions to Test**:
- `buildSummarizationPrompt(text, options)` - Build prompt
- `validateOptions(options)` - Validate options

**Test Cases**:
```
✅ Happy Path
  - Default options (medium, paragraph)
  - All options specified
  - Language specified

❌ Error Cases
  - Invalid length (not short/medium/long)
  - Invalid format (not bullets/paragraph)
  - Language too long (>50 chars)

🔲 Edge Cases
  - Missing options (use defaults)
  - Empty options object
  - Extra unknown options (ignore)

📏 Boundary Conditions
  - Very long text
  - Text with special characters
  - Language = 50 chars (max)
```

**Estimated**: 15 tests, ~140 lines

---

### 7. utils/batchProcessor.js (200 lines) → Need ~250 test lines

**Functions to Test**:
- `process(items, processor, options)` - Process batch
- `isFullSuccess(results)` - Check if all succeeded
- `isPartialSuccess(results)` - Check if some succeeded
- `isTotalFailure(results)` - Check if all failed

**Test Cases**:
```
✅ Happy Path
  - Process all items successfully
  - Respects concurrency limit
  - onProgress called correctly

❌ Error Cases
  - Some items fail (partial success)
  - All items fail (total failure)
  - Processor throws error

🔲 Edge Cases
  - Empty items array
  - Single item
  - Items > concurrency (queuing)
  - Very high concurrency (100+)

📏 Boundary Conditions
  - concurrency = 1 (sequential)
  - concurrency = items.length (all parallel)
  - concurrency > items.length
```

**Estimated**: 22 tests, ~250 lines

---

### 8. middleware/security.js (154 lines) → Need ~180 test lines

**Functions to Test**:
- `requestId(req, res, next)` - Generate request ID
- `securityHeaders(req, res, next)` - Set security headers
- `corsHandler(req, res, next)` - Handle CORS
- `sanitizeRequest(req, res, next)` - Sanitize request

**Test Cases**:
```
✅ Happy Path
  - Request ID generated (UUID)
  - All security headers set
  - CORS allowed for whitelisted origin
  - Clean request passes sanitization

❌ Error Cases
  - CORS blocked for unknown origin
  - Dangerous headers removed
  - Oversized Content-Length rejected

🔲 Edge Cases
  - Existing request ID (don't overwrite)
  - OPTIONS request (CORS preflight)
  - No Origin header (allow)

📏 Boundary Conditions
  - Content-Length = 0
  - Content-Length = 10MB (at limit)
  - Content-Length > 10MB (reject)
```

**Estimated**: 18 tests, ~180 lines

---

### 9. middleware/errorHandler.js (173 lines) → Need ~200 test lines

**Functions to Test**:
- `errorHandler(err, req, res, next)` - Handle all errors
- `sanitizeErrorMessage(message)` - Remove sensitive data
- `anonymizeIP(ip)` - Anonymize IP address

**Test Cases**:
```
✅ Happy Path
  - Custom errors formatted correctly
  - Validation errors handled
  - Generic errors handled

❌ Error Cases
  - Stack trace only in development
  - Sensitive data removed from messages
  - IP addresses anonymized

🔲 Edge Cases
  - Missing requestId (generate one)
  - Error without message
  - Error without status

📏 Boundary Conditions
  - Very long error message
  - Error with nested originalError
  - IPv6 address anonymization
```

**Estimated**: 16 tests, ~200 lines

---

### 10. middleware/idempotency.js (193 lines) → Need ~220 test lines

**Functions to Test**:
- `idempotencyMiddleware(req, res, next)` - Main middleware
- Cache hit/miss logic
- Cleanup interval

**Test Cases**:
```
✅ Happy Path
  - First request (cache MISS)
  - Duplicate request (cache HIT)
  - Headers set correctly (X-Idempotency-Cache, X-Idempotency-Age)

❌ Error Cases
  - Invalid UUID format
  - Missing Idempotency-Key (skip)
  - Cache miss for non-existent key

🔲 Edge Cases
  - TTL expiration (24 hours)
  - Cleanup removes expired entries
  - Concurrent requests with same key

📏 Boundary Conditions
  - Cache at TTL - 1ms (still valid)
  - Cache at TTL + 1ms (expired)
  - Very large response body
```

**Estimated**: 20 tests, ~220 lines

---

### 11. middleware/rateLimit.js (80 lines) → Need ~100 test lines

**Functions to Test**:
- `rateLimiter(req, res, next)` - Rate limit middleware
- Token bucket algorithm
- Cleanup interval

**Test Cases**:
```
✅ Happy Path
  - First request passes
  - Multiple requests within limit pass
  - Headers set correctly (X-RateLimit-*)

❌ Error Cases
  - Rate limit exceeded (429)
  - Correct retry-after calculation

🔲 Edge Cases
  - Rate limit by IP
  - Rate limit by X-API-Key header
  - Token replenishment over time

📏 Boundary Conditions
  - Exactly at rate limit (10/60s)
  - Just under limit (9/60s)
  - Just over limit (11/60s)
```

**Estimated**: 14 tests, ~100 lines

---

### 12. middleware/validate.js (225 lines) → Need ~280 test lines

**Functions to Test**:
- `validateSummarizeRequest(req, res, next)` - Main validator
- Individual validation functions

**Test Cases**:
```
✅ Happy Path
  - Valid request passes
  - All optional params accepted

❌ Error Cases
  - Missing text field
  - Text too short (<50 chars)
  - Text too long (>10k chars)
  - Invalid length option
  - Invalid format option
  - Language too long (>50 chars)
  - Null bytes detected
  - Invalid UTF-8
  - Prompt injection detected

🔲 Edge Cases
  - Text = 50 chars (minimum)
  - Text = 10,000 chars (maximum)
  - Language = 50 chars (maximum)
  - Empty options (use defaults)

📏 Boundary Conditions
  - Text = 49 chars (reject)
  - Text = 51 chars (accept)
  - Text = 9,999 chars (accept)
  - Text = 10,001 chars (reject)
```

**Estimated**: 28 tests, ~280 lines

---

### 13. middleware/validateBatch.js (237 lines) → Need ~290 test lines

**Functions to Test**:
- `validateBatchRequest(req, res, next)` - Batch validator
- Per-item validation

**Test Cases**:
```
✅ Happy Path
  - Valid batch passes
  - All items valid

❌ Error Cases
  - Missing items array
  - Batch too small (<1)
  - Batch too large (>10)
  - One item invalid (detailed error with index)
  - Multiple items invalid

🔲 Edge Cases
  - Batch = 1 item (minimum)
  - Batch = 10 items (maximum)
  - Mixed valid/invalid items

📏 Boundary Conditions
  - Batch = 0 items (reject)
  - Batch = 11 items (reject)
```

**Estimated**: 24 tests, ~290 lines

---

### 14. utils/metrics.js (235 lines) → Need ~200 test lines

**Functions to Test**:
- `metricsMiddleware(req, res, next)` - Collect HTTP metrics
- `trackSummarization()` - Track summarization metrics
- `trackTokenUsage()` - Track token metrics
- `updateCircuitBreakerState()` - Update circuit breaker metric
- `calculateCost()` - Calculate cost (CAUTION: hardcoded pricing)

**Test Cases**:
```
✅ Happy Path
  - HTTP metrics collected
  - Summarization metrics tracked
  - Token usage tracked
  - Cost calculated correctly

❌ Error Cases
  - Unknown model (cost calculation)
  - Missing usage data

🔲 Edge Cases
  - Multiple requests increment counters
  - Histograms record durations

📏 Boundary Conditions
  - Zero tokens
  - Very high token count (1M+)
```

**Estimated**: 16 tests, ~200 lines

---

### 15. utils/errors.js (65 lines) → Need ~80 test lines

**Functions to Test**:
- All error constructors (8 classes)

**Test Cases**:
```
✅ Happy Path
  - Each error type instantiated
  - retryable flag set correctly
  - HTTP status set correctly

🔲 Edge Cases
  - Error with originalError
  - Error without message

📏 Boundary Conditions
  - Very long error message
```

**Estimated**: 10 tests, ~80 lines

---

### 16. config/index.js (103 lines) → Need ~120 test lines

**Functions to Test**:
- Config loading from env
- `validateConfig()` - Validation
- `getSafeConfig()` - Sanitized config

**Test Cases**:
```
✅ Happy Path
  - Load config from env
  - Defaults applied
  - Validation passes

❌ Error Cases
  - Missing required ANTHROPIC_API_KEY
  - Invalid API key format

🔲 Edge Cases
  - getSafeConfig() redacts API key
  - Type coercion (parseInt, parseFloat)

📏 Boundary Conditions
  - API key minimum length
```

**Estimated**: 12 tests, ~120 lines

---

### 17. server.js (393 lines) → Need ~200 test lines

**Functions to Test**:
- Graceful shutdown
- Health endpoint
- Metrics endpoint
- Connection tracking

**Test Cases**:
```
✅ Happy Path
  - Server starts successfully
  - Health endpoint returns 200
  - Metrics endpoint returns Prometheus format
  - Graceful shutdown closes connections

❌ Error Cases
  - Port already in use
  - Shutdown with active connections

🔲 Edge Cases
  - Multiple shutdown signals (SIGTERM, SIGINT)
  - Shutdown timeout (30s)

📏 Boundary Conditions
  - Max connections tracked
```

**Estimated**: 14 tests, ~200 lines

---

## Test Writing Plan

### Phase 1: Critical Utils (NEW from refactor)

**Priority**: 🔴 CRITICAL  
**Timeline**: 8 hours

1. ✅ `__tests__/utils/apiClient.test.js` (~100 lines)
2. ✅ `__tests__/utils/responseHandler.test.js` (~90 lines)
3. ✅ `__tests__/utils/errorMapper.test.js` (~150 lines)

**Subtotal**: 340 test lines

---

### Phase 2: Critical Utils (Existing, untested)

**Priority**: 🔴 CRITICAL  
**Timeline**: 12 hours

4. ✅ `__tests__/utils/retry.test.js` (~180 lines)
5. ✅ `__tests__/utils/circuitBreaker.test.js` (~220 lines)
6. ✅ `__tests__/utils/promptBuilder.test.js` (~140 lines)
7. ✅ `__tests__/utils/batchProcessor.test.js` (~250 lines)

**Subtotal**: 790 test lines

---

### Phase 3: Critical Middleware

**Priority**: 🔴 CRITICAL  
**Timeline**: 14 hours

8. ✅ `__tests__/middleware/security.test.js` (~180 lines)
9. ✅ `__tests__/middleware/errorHandler.test.js` (~200 lines)
10. ✅ `__tests__/middleware/idempotency.test.js` (~220 lines)
11. ✅ `__tests__/middleware/rateLimit.test.js` (~100 lines)
12. ✅ `__tests__/middleware/validate.test.js` (~280 lines)
13. ✅ `__tests__/middleware/validateBatch.test.js` (~290 lines)

**Subtotal**: 1,270 test lines

---

### Phase 4: Lower Priority

**Priority**: 🟡 HIGH / 🟢 MEDIUM  
**Timeline**: 8 hours

14. ✅ `__tests__/utils/metrics.test.js` (~200 lines)
15. ✅ `__tests__/utils/errors.test.js` (~80 lines)
16. ✅ `__tests__/config/index.test.js` (~120 lines)
17. ✅ `__tests__/server.test.js` (~200 lines)

**Subtotal**: 600 test lines

---

## Total Effort

| Phase | Files | Test Lines | Hours |
|-------|-------|------------|-------|
| Phase 1 | 3 | 340 | 8 |
| Phase 2 | 4 | 790 | 12 |
| Phase 3 | 6 | 1,270 | 14 |
| Phase 4 | 4 | 600 | 8 |
| **TOTAL** | **17** | **3,000** | **42 hours** |

---

## Before/After Comparison

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Test Files | 2 | 19 | +850% |
| Test Lines | 1,457 | 4,457 | +206% |
| Source Lines | 3,219 | 3,219 | - |
| **Test/Code Ratio** | **0.45** | **1.38** | **+207%** |

**Result**: 🎯 **Target exceeded** (1.38 > 1.0)

---

## Test Organization

```
__tests__/
├── utils/
│   ├── apiClient.test.js          (NEW)
│   ├── responseHandler.test.js    (NEW)
│   ├── errorMapper.test.js        (NEW)
│   ├── claudeClient.test.js       (UPDATE)
│   ├── retry.test.js              (NEW)
│   ├── circuitBreaker.test.js     (NEW)
│   ├── promptBuilder.test.js      (NEW)
│   ├── batchProcessor.test.js     (NEW)
│   ├── metrics.test.js            (NEW)
│   └── errors.test.js             (NEW)
├── middleware/
│   ├── security.test.js           (NEW)
│   ├── errorHandler.test.js       (NEW)
│   ├── idempotency.test.js        (NEW)
│   ├── rateLimit.test.js          (NEW)
│   ├── validate.test.js           (NEW)
│   └── validateBatch.test.js      (NEW)
├── routes/
│   └── summarize.test.js          (EXISTS)
├── config/
│   └── index.test.js              (NEW)
└── server.test.js                 (NEW)
```

**Total**: 19 test files (2 exist, 17 new)

---

## Test Template

```javascript
const moduleName = require('../../path/to/module');

describe('ModuleName', () => {
  describe('functionName', () => {
    // ✅ Happy Path
    describe('happy path', () => {
      it('should do X when Y', () => {
        // Arrange
        // Act
        // Assert
      });
    });

    // ❌ Error Cases
    describe('error cases', () => {
      it('should throw Error when invalid input', () => {
        // Arrange
        // Act & Assert
        expect(() => fn()).toThrow(Error);
      });
    });

    // 🔲 Edge Cases
    describe('edge cases', () => {
      it('should handle edge case Z', () => {
        // Test edge case
      });
    });

    // 📏 Boundary Conditions
    describe('boundary conditions', () => {
      it('should accept minimum value', () => {
        // Test minimum
      });

      it('should reject below minimum', () => {
        // Test below minimum
      });
    });
  });
});
```

---

## Next Steps

1. ✅ Review this plan
2. ⏳ Write Phase 1 tests (8 hours) - NEW modules from refactor
3. ⏳ Write Phase 2 tests (12 hours) - Critical utils
4. ⏳ Write Phase 3 tests (14 hours) - Critical middleware
5. ⏳ Write Phase 4 tests (8 hours) - Config, server, metrics
6. ✅ Run `npm test` and verify coverage
7. ✅ Update README.md with new test count

**Timeline**: 42 hours total (~5 days of focused work)

---

**End of Test Coverage Plan**
