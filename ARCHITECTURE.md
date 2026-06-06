# Architecture Document

**Version**: 1.0.0  
**Last Updated**: 2026-06-06  
**Status**: Living Document

This document is the **source of truth** for architectural decisions, scope, API contracts, and accepted tradeoffs.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Decisions](#architecture-decisions)
3. [V1 Scope](#v1-scope)
4. [API Contract](#api-contract)
5. [Known Tradeoffs](#known-tradeoffs)
6. [Future Considerations](#future-considerations)

---

## System Overview

### Purpose

A production-ready REST API that summarizes text using Claude AI with enterprise-grade reliability, observability, and security.

### Core Requirements

1. **Reliability**: 99.9% uptime target
2. **Performance**: P95 latency < 5 seconds
3. **Cost**: Track and optimize token usage
4. **Security**: OWASP Top 10 compliance
5. **Observability**: Full request tracing and metrics

### Non-Functional Requirements

- **Scalability**: Horizontal scaling to 10+ instances
- **Maintainability**: Clear separation of concerns
- **Testability**: >80% code coverage
- **Documentation**: Self-documenting API (OpenAPI)

---

## Architecture Decisions

### 1. Monolithic API (Not Microservices)

**Decision**: Single Node.js/Express application

**Why**:
- ✅ **Simplicity**: One codebase, one deployment
- ✅ **Low latency**: No inter-service communication overhead
- ✅ **Easier debugging**: Single log stream, single process
- ✅ **Lower operational cost**: One service to monitor
- ✅ **Appropriate scale**: Expected load < 1000 RPS

**Alternatives Considered**:
- ❌ **Microservices**: Overkill for single-responsibility API
- ❌ **Serverless**: Cold starts incompatible with real-time requirements

**When to Revisit**: If we add user management, billing, or other domains

---

### 2. Synchronous API (Not Async/Queue-Based)

**Decision**: Client waits for summary (blocking request)

**Why**:
- ✅ **Simpler client**: No polling/webhooks required
- ✅ **Better UX**: Immediate results for small texts
- ✅ **No persistence needed**: No job queue database
- ✅ **Lower latency**: 2-5s total (acceptable for UX)

**Alternatives Considered**:
- ❌ **Async with polling**: Adds complexity for 2-5s tasks
- ❌ **WebSockets/SSE**: Overkill for simple request/response

**Mitigation for Long Requests**:
- Circuit breaker (30s timeout)
- Request timeout (65s)
- Idempotency for safe retries

**When to Revisit**: If summary time exceeds 10 seconds consistently

---

### 3. Modular Monolith (SOLID Principles)

**Decision**: Single Responsibility Principle applied rigorously

**Why**:
- ✅ **Testable**: Each module tested in isolation
- ✅ **Reusable**: Retry logic, circuit breaker work anywhere
- ✅ **Maintainable**: Changes localized to single module
- ✅ **Clear boundaries**: Easy to extract to microservice later

**Module Boundaries**:
```
retry.js          → Retry logic with exponential backoff
circuitBreaker.js → Circuit breaker pattern
promptBuilder.js  → Prompt construction
batchProcessor.js → Concurrent batch processing
claudeClient.js   → Orchestration only (uses above)
```

**Alternatives Considered**:
- ❌ **Single god class**: Hard to test, maintain
- ❌ **Over-abstraction**: Premature optimization

---

### 4. In-Memory State (Development) → Redis (Production)

**Decision**: In-memory Map for dev, Redis for prod

**Why In-Memory for V1**:
- ✅ **Zero dependencies**: `npm install && npm start` works
- ✅ **Fast iteration**: No Redis to install locally
- ✅ **Simple testing**: Jest tests don't need Redis

**Why Redis for Production**:
- ✅ **Multi-instance**: Shared state across replicas
- ✅ **Persistence**: Survives pod restarts
- ✅ **TTL built-in**: Automatic expiration
- ✅ **Atomic operations**: Correct rate limiting

**Current State** (V1):
```javascript
// middleware/idempotency.js
const idempotencyStore = new Map(); // ⚠️ DEV ONLY

// middleware/rateLimit.js
const rateLimitStore = new Map();  // ⚠️ DEV ONLY
```

**Migration Path**:
```javascript
// Use adapter pattern
const store = process.env.REDIS_URL 
  ? new RedisStore(process.env.REDIS_URL)
  : new MemoryStore();
```

**Critical**: ⚠️ **DO NOT DEPLOY TO PRODUCTION** without Redis

---

### 5. Prometheus Metrics (Not Custom Solution)

**Decision**: Prometheus + prom-client

**Why**:
- ✅ **Industry standard**: Works with Grafana, AlertManager
- ✅ **Pull model**: Service doesn't need to know about monitoring
- ✅ **Rich data types**: Counters, Gauges, Histograms
- ✅ **No vendor lock-in**: Open source

**Metrics Exposed**:
- HTTP: request count, latency, errors
- Business: token usage, cost, summary requests
- Infrastructure: circuit breaker state, rate limits

**Alternatives Considered**:
- ❌ **StatsD**: Push model requires agent
- ❌ **CloudWatch**: AWS vendor lock-in
- ❌ **DataDog**: High cost for startup

---

### 6. OpenAPI 3.0 (Not Custom Docs)

**Decision**: YAML spec + Swagger UI

**Why**:
- ✅ **Interactive**: Try API from browser
- ✅ **Code generation**: Auto-generate clients
- ✅ **Contract-first**: Spec is source of truth
- ✅ **Validation**: Schema validation for free

**Alternatives Considered**:
- ❌ **Markdown docs**: Not interactive, no validation
- ❌ **Postman collection**: Not standard format

---

### 7. Idempotency via Headers (Not Request Body)

**Decision**: `Idempotency-Key` header with UUID

**Why**:
- ✅ **Standard**: Stripe, GitHub use this pattern
- ✅ **Cacheable**: Same URL + body = same resource
- ✅ **RESTful**: Idempotency is metadata, not data

**Implementation**:
```http
POST /api/summarize
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

**Alternatives Considered**:
- ❌ **Request body field**: Pollutes data model
- ❌ **URL query param**: Not RESTful for POST

---

### 8. Batch with Concurrency Limit (Not Unbounded)

**Decision**: Max 10 items, concurrency 3

**Why**:
- ✅ **Prevents overload**: 3 concurrent = ~6 req/sec to Claude
- ✅ **Fast enough**: 10 items @ 2s each = ~7s total (vs 20s sequential)
- ✅ **Fair queuing**: Other requests don't starve

**Math**:
```
Sequential: 10 × 2s = 20s
Parallel 10: 2s (all at once) → Rate limit risk
Parallel 3:  ⌈10/3⌉ × 2s = 7s → ✅ Optimal
```

**Alternatives Considered**:
- ❌ **Unbounded concurrency**: Rate limit hell
- ❌ **Sequential**: Too slow for UX

---

### 9. Partial Failure Handling (207 Multi-Status)

**Decision**: Return successes + failures, don't fail fast

**Why**:
- ✅ **Better UX**: User gets partial results
- ✅ **Lower cost**: Don't re-process successes
- ✅ **Clear errors**: Each failure has error code

**Response**:
```json
{
  "success": false,
  "data": {
    "results": [/* succeeded */],
    "errors": [/* failed with retryable flag */],
    "summary": {"successful": 1, "failed": 1}
  }
}
```

**Alternatives Considered**:
- ❌ **Fail fast**: Lose all work on one failure
- ❌ **Retry internally**: Ties up request too long

---

### 10. Circuit Breaker (Netflix Hystrix Pattern)

**Decision**: 3 states (CLOSED, HALF_OPEN, OPEN)

**Why**:
- ✅ **Prevents cascade failures**: Stop calling failing service
- ✅ **Auto-recovery**: Tries again after timeout
- ✅ **Fast failure**: Don't wait for timeout when open

**Configuration**:
```javascript
threshold: 5,        // Open after 5 consecutive failures
timeout: 30000,      // Try recovery after 30s
recoveryAttempts: 2  // Need 2 successes to close
```

**Alternatives Considered**:
- ❌ **No circuit breaker**: Cascade failures
- ❌ **Fixed retry**: Keeps hammering failing service

---

## V1 Scope

### ✅ In Scope

#### Core Features
- [x] Single text summarization
- [x] Batch summarization (up to 10 texts)
- [x] Configurable length (short/medium/long)
- [x] Configurable format (bullets/paragraph)
- [x] Language selection

#### Production Readiness
- [x] OpenAPI/Swagger documentation
- [x] Prometheus metrics
- [x] Request ID tracing
- [x] Idempotency support
- [x] Rate limiting (per IP)
- [x] Circuit breaker
- [x] Graceful shutdown
- [x] Health checks (liveness, readiness)
- [x] Security headers (CSP, HSTS, etc.)
- [x] Input validation
- [x] Error handling with retry flags

#### Developer Experience
- [x] 73 automated tests
- [x] Integration test suite
- [x] Comprehensive documentation
- [x] Example curl commands

---

### ❌ Explicitly Out of Scope for V1

#### Authentication & Authorization
- ❌ **User accounts**: No signup/login
- ❌ **API key management**: No per-user API keys
- ❌ **OAuth**: No third-party auth
- ❌ **RBAC**: No role-based access control

**Rationale**: Server-to-server only. Client controls access to this API.

**When to Add**: V2, if multi-tenant SaaS

---

#### Advanced Processing
- ❌ **Streaming responses**: No SSE/WebSocket
- ❌ **Async processing**: No job queue
- ❌ **Webhooks**: No callback notifications
- ❌ **Custom prompts**: User can't modify system prompt
- ❌ **Fine-tuning**: No model customization
- ❌ **Multi-step summaries**: No iterative refinement

**Rationale**: 2-5s response time acceptable. Adds complexity.

**When to Add**: If summary time > 10s or async requested

---

#### Cost Management
- ❌ **Per-user quotas**: No individual limits
- ❌ **Billing system**: No invoicing
- ❌ **Cost prediction**: No estimate before processing
- ❌ **Budget alerts**: No automated cost warnings
- ❌ **Usage tiers**: No free/pro/enterprise plans

**Rationale**: Single tenant. Operator monitors total cost.

**When to Add**: V2, if multi-tenant

---

#### Caching
- ❌ **Response caching**: No cache for identical text
- ❌ **CDN integration**: No edge caching
- ❌ **Semantic deduplication**: No "similar text" detection

**Rationale**: Most texts are unique. Premature optimization.

**When to Add**: If >20% duplicate requests observed

---

#### Advanced Monitoring
- ❌ **Distributed tracing**: No Jaeger/Zipkin
- ❌ **APM**: No New Relic/DataDog APM
- ❌ **Session replay**: No Sentry recordings
- ❌ **Custom dashboards**: No pre-built Grafana boards

**Rationale**: Prometheus metrics sufficient for V1.

**When to Add**: If debugging requires distributed tracing

---

#### Multi-Language Support
- ❌ **i18n error messages**: Errors always in English
- ❌ **Localized docs**: Documentation in English only

**Rationale**: Target audience is developers (English fluent)

---

#### Infrastructure
- ❌ **Auto-scaling**: No HPA/auto-scale groups
- ❌ **Multi-region**: Single region deployment
- ❌ **CDN**: No CloudFront/CloudFlare
- ❌ **Load testing**: No continuous perf tests

**Rationale**: Manual scaling sufficient for V1 load.

**When to Add**: If traffic > 1000 RPS

---

#### Data Persistence
- ❌ **Request history**: No database of requests
- ❌ **Audit logs**: No immutable log store
- ❌ **Analytics**: No BigQuery/Snowflake

**Rationale**: Logs sufficient for debugging. GDPR-friendly (no PII storage).

---

## API Contract

### Design Principles

1. **RESTful**: Resources, standard HTTP methods
2. **Consistent errors**: Structured error format everywhere
3. **Idempotent POST**: Safe retries via `Idempotency-Key`
4. **Explicit validation**: Clear error messages with field names
5. **Versioned**: Future-proof (URL versioning when needed)

---

### Request/Response Shapes

#### 1. POST /api/summarize

**Request**:
```typescript
{
  text: string;      // Required, 50-10000 chars
  length?: "short" | "medium" | "long";  // Default: medium
  format?: "bullets" | "paragraph";      // Default: paragraph
  language?: string; // Max 50 chars, e.g. "Spanish"
}
```

**Response (200)**:
```typescript
{
  success: true;
  data: {
    summary: string;
    metadata: {
      model: string;              // e.g. "claude-sonnet-4-6"
      usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      };
      processingTimeMs: number;
      stopReason: string;         // e.g. "end_turn"
    };
  };
  requestId: string;              // UUID
}
```

**Response (400 - Validation Error)**:
```typescript
{
  success: false;
  error: {
    code: string;                 // e.g. "TEXT_TOO_SHORT"
    message: string;              // Human-readable
    field?: string;               // Field that failed
    minLength?: number;           // Context (for length errors)
    actualLength?: number;
  };
  requestId: string;
}
```

**Response (429 - Rate Limit)**:
```typescript
{
  success: false;
  error: {
    code: "RATE_LIMIT_EXCEEDED";
    message: string;
    retryAfter?: number;          // Seconds
  };
  requestId: string;
}
```

**Headers**:
```http
Request:
  Content-Type: application/json
  Idempotency-Key: <uuid>  (optional)

Response:
  X-Request-ID: <uuid>
  X-RateLimit-Limit: 10
  X-RateLimit-Remaining: 9
  X-RateLimit-Reset: 45
  X-Idempotency-Cache: HIT|MISS  (if key provided)
```

---

#### 2. POST /api/summarize/batch

**Request**:
```typescript
{
  items: Array<{            // Min 1, max 10
    text: string;           // 50-10000 chars
    length?: "short" | "medium" | "long";
    format?: "bullets" | "paragraph";
    language?: string;
  }>;
}
```

**Response (200 - All Success)**:
```typescript
{
  success: true;
  data: {
    results: Array<{
      index: number;
      data: {
        summary: string;
        metadata: { /* same as single */ };
      };
    }>;
    errors: [];
    summary: {
      total: number;
      successful: number;
      failed: number;
      processingTimeMs: number;
    };
  };
  requestId: string;
}
```

**Response (207 - Partial Success)**:
```typescript
{
  success: false;
  data: {
    results: Array<{/* successes */}>;
    errors: Array<{
      index: number;
      error: {
        code: string;
        message: string;
        retryable: boolean;  // ⭐ KEY: tells client if worth retrying
      };
    }>;
    summary: {
      total: number;
      successful: number;
      failed: number;
      processingTimeMs: number;
    };
  };
  requestId: string;
}
```

**Response (500 - Total Failure)**:
```typescript
{
  success: false;
  data: {
    results: [];
    errors: Array<{/* all failed */}>;
    summary: { successful: 0, failed: N };
  };
  requestId: string;
}
```

---

#### 3. GET /health

**Response**:
```typescript
{
  status: "healthy";
  timestamp: string;        // ISO 8601
  uptime: {
    seconds: number;
    formatted: string;      // e.g. "2h 34m 15s"
  };
  memory: {
    rss: string;            // e.g. "50MB"
    heapUsed: string;
    heapTotal: string;
  };
  environment: string;      // "development" | "production"
  activeConnections: number;
}
```

---

#### 4. GET /api/summarize/health

**Response**:
```typescript
{
  status: "healthy" | "degraded";
  timestamp: string;
  service: "ai-summarizer-api";
  version: string;
  circuitBreaker: {
    state: "CLOSED" | "HALF_OPEN" | "OPEN";
    failureCount: number;
    successCount: number;
    lastFailureTime: string | null;  // ISO 8601
  };
  config: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    timeout: number;
  };
  requestId: string;
}
```

---

#### 5. GET /metrics

**Response**: Prometheus text format

```
# TYPE http_requests_total counter
http_requests_total{method="POST",route="/api/summarize",status_code="200"} 42

# TYPE summarization_tokens_total counter
summarization_tokens_total{type="input"} 12543
summarization_tokens_total{type="output"} 3456

# TYPE summarization_cost_usd_total counter
summarization_cost_usd_total 1.23

# TYPE circuit_breaker_state gauge
circuit_breaker_state 0
```

---

### Error Codes (Exhaustive List)

| Code | HTTP | Retryable | Meaning |
|------|------|-----------|---------|
| `MISSING_REQUIRED_FIELD` | 400 | ❌ | Required field missing |
| `INVALID_FIELD_TYPE` | 400 | ❌ | Wrong type (e.g. number instead of string) |
| `EMPTY_TEXT` | 400 | ❌ | Text is empty or whitespace |
| `TEXT_TOO_SHORT` | 400 | ❌ | Text < 50 characters |
| `TEXT_TOO_LONG` | 413 | ❌ | Text > 10,000 characters |
| `INVALID_CHARACTER` | 400 | ❌ | Contains null bytes |
| `INVALID_ENCODING` | 400 | ❌ | Not valid UTF-8 |
| `SUSPICIOUS_INPUT` | 400 | ❌ | Prompt injection detected |
| `INVALID_LENGTH` | 400 | ❌ | Length not in [short, medium, long] |
| `INVALID_FORMAT` | 400 | ❌ | Format not in [bullets, paragraph] |
| `BATCH_TOO_LARGE` | 400 | ❌ | Batch > 10 items |
| `BATCH_TOO_SMALL` | 400 | ❌ | Batch < 1 item |
| `BATCH_VALIDATION_ERRORS` | 400 | ❌ | One or more items failed validation |
| `RATE_LIMIT_EXCEEDED` | 429 | ✅ | Too many requests |
| `TIMEOUT` | 504 | ✅ | Request exceeded 30s |
| `CIRCUIT_BREAKER_OPEN` | 503 | ✅ | Circuit breaker tripped |
| `SERVICE_OVERLOADED` | 503 | ✅ | Claude API overloaded (529) |
| `AUTHENTICATION_ERROR` | 401 | ❌ | Invalid API key (server config issue) |
| `CLAUDE_API_ERROR` | 500 | ❓ | Generic Claude error |
| `INTERNAL_SERVER_ERROR` | 500 | ❌ | Unexpected error |

**Retryable Flag Logic**:
- ✅ Retryable: Transient failures (rate limits, timeouts, overload)
- ❌ Not retryable: Permanent failures (validation, auth)
- ❓ Maybe retryable: Check specific error

---

## Known Tradeoffs

### 1. In-Memory State (Redis Debt)

**Tradeoff**: Development simplicity vs Production correctness

**What We Chose**: In-memory Map for V1

**Cost**:
- ❌ **Breaks multi-instance**: Idempotency doesn't work across pods
- ❌ **Rate limits ineffective**: Per-instance limits, not global
- ❌ **State lost on restart**: All idempotency keys gone

**Benefit**:
- ✅ **Zero setup**: `npm install && npm start` works
- ✅ **Fast iteration**: No Redis to install/configure
- ✅ **Simpler tests**: No Redis in CI

**Mitigation**:
- Document clearly: "DEV ONLY" comments
- Add Redis migration guide in CODE_REVIEW.md
- Adapter pattern ready for Redis swap

**When We Pay the Cost**: First production deployment

---

### 2. Synchronous API (No Job Queue)

**Tradeoff**: Simplicity vs Scalability

**What We Chose**: Blocking request/response

**Cost**:
- ❌ **Ties up connection**: 2-5s blocked per request
- ❌ **No prioritization**: Can't prioritize urgent requests
- ❌ **Hard timeout limit**: 65s absolute maximum

**Benefit**:
- ✅ **Simpler client**: No polling, webhooks, or job IDs
- ✅ **Lower latency**: No queue overhead
- ✅ **No persistence**: No job queue database

**Mitigation**:
- Circuit breaker (fails fast if Claude down)
- Request timeout (65s max)
- Idempotency (safe to retry)

**When We Pay the Cost**: If summary time > 10s consistently

---

### 3. No Response Caching

**Tradeoff**: Simplicity vs Cost

**What We Chose**: No cache, always call Claude

**Cost**:
- ❌ **Higher Claude costs**: Every request is fresh API call
- ❌ **Slower for duplicates**: No cache hit speedup

**Benefit**:
- ✅ **No stale data**: Always fresh summaries
- ✅ **No cache invalidation**: No TTL to tune
- ✅ **Simpler code**: No cache layer

**Data Point**: Need telemetry to measure duplicate rate

**When We Pay the Cost**: If >20% requests are duplicates

**Future**: Add semantic similarity detection (hash normalized text)

---

### 4. No Per-User Quotas

**Tradeoff**: Simplicity vs Cost Control

**What We Chose**: Single pool, no individual limits

**Cost**:
- ❌ **No cost attribution**: Can't track cost per user
- ❌ **One user can exhaust quota**: No fairness
- ❌ **No billing**: Can't charge users

**Benefit**:
- ✅ **No user DB**: No accounts, no persistence
- ✅ **Simpler code**: No quota tracking
- ✅ **Faster**: No DB lookup per request

**Mitigation**:
- Global rate limiting (prevents total runaway)
- Metrics track total cost

**When We Pay the Cost**: Multi-tenant SaaS (V2)

---

### 5. Console.log (Not Structured Logger)

**Tradeoff**: Zero dependencies vs Production readiness

**What We Chose**: console.log with JSON.stringify

**Cost**:
- ❌ **No log aggregation**: Can't search across instances
- ❌ **No log levels**: Can't filter by severity
- ❌ **No structured fields**: Can't query by requestId

**Benefit**:
- ✅ **Zero dependencies**: No Winston/Bunyan
- ✅ **Works everywhere**: console works in all environments
- ✅ **Simple**: No logger configuration

**Mitigation**:
- All logs are JSON (structured)
- Include requestId in every log
- Include timestamp

**When We Pay the Cost**: First production deploy (CRITICAL)

**Future**: Winston with CloudWatch/DataDog transport

---

### 6. Fixed Batch Concurrency (Not Configurable)

**Tradeoff**: Simplicity vs Flexibility

**What We Chose**: Hardcoded concurrency = 3

**Cost**:
- ❌ **Not tunable**: Can't adjust per environment
- ❌ **Not optimal for all**: May be too low/high

**Benefit**:
- ✅ **Predictable**: Known max load on Claude
- ✅ **Simple**: No configuration
- ✅ **Safe default**: Tested value

**Data Point**: 3 is optimal for:
- Claude rate limits
- P95 latency target
- Fair queuing

**When We Pay the Cost**: Different Claude tier with different limits

**Future**: Make configurable via env var

---

### 7. No Streaming Responses

**Tradeoff**: Complexity vs UX

**What We Chose**: Buffer entire response, send at end

**Cost**:
- ❌ **Perceived latency**: User waits 5s with no feedback
- ❌ **No progress**: Can't show "25% done"

**Benefit**:
- ✅ **Simpler**: Standard REST, no SSE/WebSocket
- ✅ **Cacheable**: Can add response cache later
- ✅ **Retryable**: Idempotency works

**Mitigation**:
- Clear loading states in client
- Show estimated time based on text length

**When We Pay the Cost**: If users complain about wait time

**Future**: Server-Sent Events for progressive results

---

### 8. No Cost Estimation

**Tradeoff**: Complexity vs Predictability

**What We Chose**: Process first, charge later

**Cost**:
- ❌ **Surprise bills**: User doesn't know cost upfront
- ❌ **No cost gating**: Can't reject expensive requests

**Benefit**:
- ✅ **Simpler**: No pre-estimation logic
- ✅ **No double-counting**: Only charge actual usage

**Mitigation**:
- Text length limits (10k chars max)
- Rate limiting (caps max cost per time)
- Metrics track cost

**When We Pay the Cost**: Enterprise customers want predictability

**Future**: Estimate tokens before call (rough: chars/4)

---

### 9. No API Versioning

**Tradeoff**: Simplicity vs Evolvability

**What We Chose**: No `/v1/` in URL

**Cost**:
- ❌ **Breaking changes hard**: Must maintain backward compat
- ❌ **Can't run v1 and v2**: Single route space

**Benefit**:
- ✅ **Simpler URLs**: `/api/summarize` not `/v1/api/summarize`
- ✅ **No routing complexity**: No version negotiation

**Mitigation**:
- Only additive changes (new optional fields)
- Use feature flags for breaking changes
- OpenAPI spec is versioned

**When We Pay the Cost**: First breaking change

**Future**: Add `/v1/` prefix in V2

---

### 10. Hardcoded Pricing (Not Dynamic)

**Tradeoff**: Simplicity vs Accuracy

**What We Chose**: Hardcoded pricing in metrics.js

**Cost**:
- ❌ **Stale data**: When Anthropic changes prices
- ❌ **Requires code change**: Can't update without deploy

**Benefit**:
- ✅ **No external dependency**: Works offline
- ✅ **Fast**: No API call for pricing

**Mitigation**:
- Document clearly: "Update when pricing changes"
- Pricing is in metrics only (not billing)

**When We Pay the Cost**: Anthropic changes pricing

**Future**: Load from config or pricing API

---

## Future Considerations

### Things to Add in V2

1. **Redis for state** (CRITICAL - required for multi-instance)
2. **Structured logging** (CRITICAL - required for production)
3. **Response caching** (if duplicate rate > 20%)
4. **Cost estimation** (for enterprise customers)
5. **Per-user quotas** (for multi-tenant SaaS)
6. **Streaming responses** (if wait time complaints)
7. **API versioning** (/v1/ prefix)
8. **Async processing** (if summary time > 10s)
9. **Webhooks** (for async use case)
10. **Distributed tracing** (if debugging requires it)

### Metrics to Track (Inform V2 Decisions)

- **Duplicate request rate**: If >20%, add caching
- **P95 latency**: If >10s, move to async
- **Rate limit hit rate**: If >5%, users need more capacity
- **Cost per request**: Trend over time
- **Error rate by type**: What's failing most?

---

## Decision Log

| Date | Decision | Rationale | Revisit When |
|------|----------|-----------|--------------|
| 2026-06-06 | Monolithic API | Simplicity, low scale | >1000 RPS |
| 2026-06-06 | In-memory state (dev) | Zero dependencies | Production deploy |
| 2026-06-06 | Synchronous API | Simplicity, low latency | Summary > 10s |
| 2026-06-06 | No response cache | Low duplicate rate (unknown) | Duplicate > 20% |
| 2026-06-06 | Batch concurrency = 3 | Optimal for rate limits | Different tier |
| 2026-06-06 | No API versioning | Simplicity | First breaking change |
| 2026-06-06 | console.log | Zero deps | Production deploy |

---

## Change History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-06-06 | Initial architecture document |

---

**This document should be updated when**:
- New architectural decisions are made
- Tradeoffs are reassessed
- API contract changes
- Scope changes (features added/removed)
- Production learnings require changes

**Document Owner**: Engineering Lead  
**Review Frequency**: Every sprint or when adding major features
