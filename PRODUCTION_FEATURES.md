# Production Features

This document describes the production-ready features that make this API suitable for real-world deployment.

## 🎯 Top 3 Production Features

### 1. **OpenAPI/Swagger Documentation** (Developer Experience)

**Problem Solved**: Developers need clear, interactive documentation to understand and test the API.

**Implementation**:
- Complete OpenAPI 3.0 specification at [openapi.yaml](openapi.yaml)
- Interactive Swagger UI at `GET /docs`
- Request/response examples
- Error code documentation
- Parameter validation rules

**Usage**:
```bash
# Start the server
npm start

# Visit the docs
open http://localhost:3000/docs
```

**Benefits**:
- Self-documenting API
- Try API calls directly from browser
- Generate client SDKs automatically
- Onboard new developers faster
- API contract testing

---

### 2. **Prometheus Metrics** (Monitoring & Observability)

**Problem Solved**: You can't improve what you don't measure. Production systems need metrics for monitoring, alerting, and debugging.

**Metrics Exported** (`GET /metrics`):

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests by method, route, status |
| `http_request_duration_seconds` | Histogram | Request latency distribution |
| `summarization_requests_total` | Counter | Summarization requests by length/format/status |
| `summarization_duration_seconds` | Histogram | Time spent calling Claude API |
| `summarization_tokens_total` | Counter | Total tokens used (input/output) |
| `summarization_cost_usd_total` | Counter | Estimated cost in USD |
| `circuit_breaker_state` | Gauge | Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN) |
| `rate_limit_exceeded_total` | Counter | Rate limit violations |
| `idempotency_cache_hits_total` | Counter | Requests served from cache |
| `idempotency_cache_misses_total` | Counter | New requests processed |
| `nodejs_*` | Various | Node.js process metrics (CPU, memory, event loop) |

**Prometheus Configuration**:
```yaml
scrape_configs:
  - job_name: 'ai-summarizer-api'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

**Grafana Dashboard Queries**:
```promql
# Request rate (requests per second)
rate(http_requests_total[5m])

# Error rate (%)
(rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m])) * 100

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Daily cost
increase(summarization_cost_usd_total[24h])

# Token usage by type
rate(summarization_tokens_total[5m])

# Circuit breaker alert
circuit_breaker_state > 0
```

**Alerting Rules**:
```yaml
groups:
  - name: ai_summarizer_alerts
    rules:
      - alert: HighErrorRate
        expr: (rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m])) > 0.05
        for: 5m
        annotations:
          summary: "Error rate above 5%"

      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state == 2
        for: 1m
        annotations:
          summary: "Circuit breaker is OPEN"

      - alert: HighCostRate
        expr: rate(summarization_cost_usd_total[1h]) > 10
        annotations:
          summary: "Cost exceeding $10/hour"
```

**Benefits**:
- Real-time monitoring
- Cost tracking
- Performance optimization
- Alerting on issues
- Capacity planning

---

### 3. **Idempotency Keys** (Reliability)

**Problem Solved**: Network failures can cause duplicate requests, leading to duplicate processing and charges. Idempotency ensures the same request produces the same result without re-processing.

**Implementation**:
- Send `Idempotency-Key` header (UUID recommended)
- Same key within 24 hours returns cached response
- No duplicate charges
- Safe to retry failed requests

**Usage**:
```bash
# Generate idempotency key
IDEMPOTENCY_KEY=$(uuidgen)

# Make request
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{"text":"Your text here..."}'

# If request fails, retry with SAME key
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{"text":"Your text here..."}'
```

**Response Headers**:
```
X-Idempotency-Cache: MISS  # First request
X-Idempotency-Cache: HIT   # Subsequent requests
X-Idempotency-Age: 125     # Seconds since first request
```

**Benefits**:
- Safe retries (network failures, timeouts)
- No duplicate charges
- Idempotent by design
- Client-side retry logic simplified
- Prevents accidental duplicate operations

**Production Note**: Current implementation uses in-memory storage. For multi-instance deployments, use Redis:

```javascript
// Redis-backed idempotency (production)
const redis = require('redis');
const client = redis.createClient();

// Store with TTL
await client.setex(
  `idempotency:${key}`,
  86400, // 24 hours
  JSON.stringify(response)
);
```

---

## 📊 Monitoring Stack Setup

### Quick Start with Docker Compose

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-storage:/var/lib/grafana

volumes:
  grafana-storage:
```

```bash
# Start monitoring stack
docker-compose up -d

# Access services
open http://localhost:3000/docs        # API docs
open http://localhost:3000/metrics     # Prometheus metrics
open http://localhost:9090             # Prometheus UI
open http://localhost:3001             # Grafana (admin/admin)
```

---

## 🔍 Observability Best Practices

### 1. **Structured Logging**
All logs are JSON-formatted for easy parsing:
```json
{
  "timestamp": "2026-06-06T12:00:00.000Z",
  "type": "request",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "path": "/api/summarize",
  "status": 200,
  "durationMs": 1234
}
```

Ship logs to:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Datadog
- CloudWatch Logs
- Grafana Loki

### 2. **Request Tracing**
Every request gets a unique `X-Request-ID` for distributed tracing:
```bash
curl -v http://localhost:3000/api/summarize
# < X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

Correlate logs, metrics, and errors using request ID.

### 3. **Cost Tracking**
Monitor token usage and costs:
```bash
# Check total cost
curl http://localhost:3000/metrics | grep summarization_cost_usd_total

# Result:
# summarization_cost_usd_total 12.45
```

Set up budget alerts based on `summarization_cost_usd_total` rate.

---

## 🚀 Production Deployment Checklist

- [x] OpenAPI documentation
- [x] Prometheus metrics
- [x] Idempotency support
- [x] Request ID tracing
- [x] Structured logging
- [x] Health checks (liveness, readiness)
- [x] Security headers
- [x] Rate limiting
- [x] Circuit breaker
- [x] Graceful shutdown
- [ ] Redis for idempotency (multi-instance)
- [ ] Redis for rate limiting (multi-instance)
- [ ] Centralized logging (ELK/Datadog)
- [ ] Alerting rules configured
- [ ] Grafana dashboards
- [ ] Load testing completed
- [ ] Disaster recovery plan
- [ ] Runbook documentation

---

## 📈 Sample Grafana Dashboards

### Overview Dashboard
```json
{
  "dashboard": {
    "title": "AI Summarizer API - Overview",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [{"expr": "rate(http_requests_total[5m])"}]
      },
      {
        "title": "Error Rate %",
        "targets": [{"expr": "(rate(http_requests_total{status_code=~\"5..\"}[5m]) / rate(http_requests_total[5m])) * 100"}]
      },
      {
        "title": "P95 Latency",
        "targets": [{"expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"}]
      },
      {
        "title": "Cost per Hour",
        "targets": [{"expr": "rate(summarization_cost_usd_total[1h]) * 3600"}]
      }
    ]
  }
}
```

---

## 🎓 Learn More

- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Idempotency in REST APIs](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header)
- [SRE Book - Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
