# AI Summarizer API

Production-ready REST API for text summarization using Claude AI (Anthropic).

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-73%20passing-success)](package.json)

## 🚀 Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd ai-summarizer-api

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Add your Anthropic API key to .env
# ANTHROPIC_API_KEY=sk-ant-your-key-here

# Start the server
npm start

# Visit the interactive API documentation
open http://localhost:3000/docs
```

The server will start on `http://localhost:3000`.

---

## 📚 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Setup](#-setup)
- [API Documentation](#-api-documentation)
- [Examples](#-examples)
- [Configuration](#-configuration)
- [Monitoring](#-monitoring)
- [Testing](#-testing)
- [Security](#-security)
- [Production Deployment](#-production-deployment)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

---

## ✨ Features

### Core Functionality
- ✅ **Text Summarization** - Powered by Claude 4 (Opus/Sonnet/Haiku)
- ✅ **Batch Processing** - Summarize up to 10 texts concurrently
- ✅ **Flexible Options** - Configurable length, format, and language per request

### Production-Ready
- ✅ **OpenAPI/Swagger Docs** - Interactive API documentation at `/docs`
- ✅ **Prometheus Metrics** - Comprehensive monitoring at `/metrics`
- ✅ **Idempotency** - Safe retry mechanism with `Idempotency-Key` header
- ✅ **Rate Limiting** - Configurable per-IP/API-key limits
- ✅ **Circuit Breaker** - Automatic fault protection
- ✅ **Graceful Shutdown** - Zero-downtime deployments
- ✅ **Request Tracing** - UUID-based request IDs for debugging
- ✅ **Security Headers** - CSP, HSTS, XSS protection

### Developer Experience
- ✅ **73 Tests** - Unit + integration test coverage
- ✅ **Structured Logging** - JSON-formatted logs
- ✅ **Error Handling** - Descriptive error codes with retry flags
- ✅ **Health Checks** - Liveness, readiness, and dependency checks

---

## 🏗️ Architecture

### Design Principles

This API was built following production best practices:

#### 1. **Single Responsibility Principle (SRP)**
Each module has one clear purpose:
- `retry.js` → Retry logic with exponential backoff
- `circuitBreaker.js` → Circuit breaker pattern
- `promptBuilder.js` → Prompt construction
- `batchProcessor.js` → Concurrent batch processing
- `claudeClient.js` → Claude API communication (orchestrates the above)

**Why**: Testable, maintainable, reusable components.

#### 2. **Graceful Degradation**
- Circuit breaker prevents cascade failures
- Partial success handling in batch requests (207 Multi-Status)
- Retry logic with exponential backoff
- Rate limiting protects against overload

**Why**: System remains operational during partial failures.

#### 3. **Observability First**
- Request ID on every request (`X-Request-ID`)
- Prometheus metrics for monitoring
- Structured JSON logging
- Health checks for dependencies

**Why**: Easy debugging, alerting, and capacity planning.

#### 4. **Security by Design**
- Input validation (length, encoding, prompt injection)
- Rate limiting with metrics
- Security headers (CSP, HSTS, XSS)
- No secrets in logs (sanitized errors, anonymized IPs)
- CORS whitelist (no wildcards in production)

**Why**: Defense in depth against common attacks.

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Load Balancer                            │
│                    (HTTPS Termination)                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼───────┐
│  API Server  │ │ API Server  │ │ API Server  │
│   (Node.js)  │ │  (Node.js)  │ │  (Node.js)  │
└──────┬───────┘ └──────┬──────┘ └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼───────┐
│    Redis     │ │   Claude    │ │ Prometheus  │
│  (State)     │ │     API     │ │  (Metrics)  │
└──────────────┘ └─────────────┘ └─────────────┘
```

### Request Flow

```
1. Client Request
   ↓
2. Request ID Generation
   ↓
3. Security Headers
   ↓
4. CORS Check
   ↓
5. Idempotency Check (cache hit → return cached)
   ↓
6. Rate Limiting Check
   ↓
7. Input Validation
   ↓
8. Circuit Breaker Check
   ↓
9. Claude API Call (with retry logic)
   ↓
10. Metrics Tracking
   ↓
11. Response + Cache (idempotency)
```

### Technology Stack

| Component | Technology | Why |
|-----------|------------|-----|
| **Runtime** | Node.js 18+ | Async I/O, excellent for API services |
| **Framework** | Express.js | Mature, well-documented, middleware-based |
| **AI Model** | Claude 4 (Anthropic) | Best-in-class summarization quality |
| **Testing** | Jest + Supertest | Standard Node.js testing stack |
| **Docs** | OpenAPI 3.0 + Swagger UI | Interactive, auto-generated docs |
| **Metrics** | Prometheus + prom-client | Industry standard monitoring |
| **Validation** | Custom middleware | Fine-grained control, no heavy deps |

---

## 🛠️ Setup

### Prerequisites

- **Node.js** >= 18.0.0 ([Download](https://nodejs.org/))
- **Anthropic API Key** ([Get one](https://console.anthropic.com/))
- **Redis** (for production) - Optional for development

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd ai-summarizer-api

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env

# 4. Edit .env and add your API key
# ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
```

### Development Mode

```bash
# Start with auto-reload
npm run dev

# Or start normally
npm start
```

The server will start on `http://localhost:3000`.

### Production Mode

```bash
# Set production environment
export NODE_ENV=production

# Install production dependencies only
npm ci --only=production

# Start server
npm start
```

---

## 📖 API Documentation

### Interactive Documentation

Visit **http://localhost:3000/docs** for interactive Swagger UI documentation.

### Base URL

```
http://localhost:3000
```

### Authentication

Currently server-to-server only. The API key is configured on the server via `ANTHROPIC_API_KEY` environment variable.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | API information |
| `GET` | `/docs` | Interactive API documentation |
| `GET` | `/health` | Server health check |
| `GET` | `/metrics` | Prometheus metrics |
| `POST` | `/api/summarize` | Summarize single text |
| `POST` | `/api/summarize/batch` | Summarize multiple texts |
| `GET` | `/api/summarize/health` | Service health + circuit breaker |
| `GET` | `/api/summarize/options` | Available API options |

---

## 💡 Examples

### 1. Basic Summarization

```bash
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Artificial intelligence (AI) is intelligence demonstrated by machines, in contrast to the natural intelligence displayed by humans and animals. Leading AI textbooks define the field as the study of intelligent agents: any device that perceives its environment and takes actions that maximize its chance of successfully achieving its goals."
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": "AI is machine-based intelligence that enables devices to perceive environments and take goal-oriented actions, distinguishing it from natural intelligence in humans and animals.",
    "metadata": {
      "model": "claude-sonnet-4-6",
      "usage": {
        "inputTokens": 52,
        "outputTokens": 28,
        "totalTokens": 80
      },
      "processingTimeMs": 1234,
      "stopReason": "end_turn"
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 2. Summarization with Options

```bash
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Machine learning is a subset of artificial intelligence that focuses on building applications that learn from data and improve their accuracy over time without being programmed to do so. In the real world, machine learning is used to analyze massive amounts of data and identify patterns to make predictions.",
    "length": "short",
    "format": "bullets",
    "language": "Spanish"
  }'
```

### 3. Idempotent Request (Safe Retry)

```bash
# Generate idempotency key
IDEMPOTENCY_KEY=$(uuidgen)

# First request
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "text": "Your text here..."
  }'

# Retry (returns cached response, no duplicate processing)
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "text": "Your text here..."
  }'
```

**Response Headers:**
```
X-Idempotency-Cache: HIT
X-Idempotency-Age: 5
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

### 4. Batch Summarization

```bash
curl -X POST http://localhost:3000/api/summarize/batch \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "text": "First text to summarize (minimum 50 characters required for validation)...",
        "length": "short",
        "format": "bullets"
      },
      {
        "text": "Second text to summarize (also meeting the minimum length requirement)...",
        "length": "medium",
        "format": "paragraph",
        "language": "French"
      }
    ]
  }'
```

**Response (200 - All Success):**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "index": 0,
        "data": {
          "summary": "• Summary point 1\n• Summary point 2",
          "metadata": { "model": "claude-sonnet-4-6", "usage": {...} }
        }
      },
      {
        "index": 1,
        "data": {
          "summary": "Résumé en français...",
          "metadata": {...}
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
  }
}
```

**Response (207 - Partial Success):**
```json
{
  "success": false,
  "data": {
    "results": [
      {
        "index": 0,
        "data": { "summary": "Success...", "metadata": {...} }
      }
    ],
    "errors": [
      {
        "index": 1,
        "error": {
          "code": "RATE_LIMIT_EXCEEDED",
          "message": "Rate limit exceeded",
          "retryable": true
        }
      }
    ],
    "summary": {
      "total": 2,
      "successful": 1,
      "failed": 1,
      "processingTimeMs": 2345
    }
  }
}
```

### 5. Health Checks

```bash
# Server health (memory, uptime)
curl http://localhost:3000/health

# Service health (circuit breaker state)
curl http://localhost:3000/api/summarize/health

# Readiness probe (Kubernetes)
curl http://localhost:3000/ready

# Liveness probe (Kubernetes)
curl http://localhost:3000/live
```

### 6. Prometheus Metrics

```bash
# Get metrics
curl http://localhost:3000/metrics

# Sample output:
# http_requests_total{method="POST",route="/api/summarize",status_code="200"} 42
# summarization_tokens_total{type="input"} 12543
# summarization_cost_usd_total 1.23
# circuit_breaker_state 0
```

### 7. API Options Discovery

```bash
curl http://localhost:3000/api/summarize/options
```

---

## ⚙️ Configuration

All configuration is via environment variables. See [.env.example](.env.example) for full details.

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | `sk-ant-...` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment (`development` \| `production`) |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Claude model to use |
| `RATE_LIMIT_MAX_REQUESTS` | `10` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (1 minute) |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | Failures before circuit opens |

### Request/Response Options

#### Length Options
- `short` - 1-2 sentences
- `medium` - 3-5 sentences (default)
- `long` - 2-3 paragraphs

#### Format Options
- `paragraph` - Continuous text (default)
- `bullets` - Bullet points

#### Language
Any language supported by Claude (e.g., English, Spanish, French, German, Japanese, Chinese, etc.)

---

## 📊 Monitoring

### Prometheus Metrics

The API exports comprehensive metrics at `/metrics`:

#### HTTP Metrics
- `http_requests_total` - Total requests by method, route, status
- `http_request_duration_seconds` - Request latency histogram

#### Summarization Metrics
- `summarization_requests_total` - Requests by length/format/status
- `summarization_duration_seconds` - Processing time
- `summarization_tokens_total` - Token usage (input/output)
- `summarization_cost_usd_total` - Estimated cost

#### System Metrics
- `circuit_breaker_state` - Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)
- `rate_limit_exceeded_total` - Rate limit violations
- `idempotency_cache_hits_total` - Cache hit rate
- `nodejs_*` - Node.js process metrics

### Grafana Dashboard Queries

```promql
# Request rate (req/sec)
rate(http_requests_total[5m])

# Error rate (%)
(rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m])) * 100

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Daily cost
increase(summarization_cost_usd_total[24h])

# Circuit breaker alert
circuit_breaker_state > 0
```

### Alerting Examples

```yaml
# Prometheus alerting rules
groups:
  - name: api_alerts
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

      - alert: HighCost
        expr: rate(summarization_cost_usd_total[1h]) > 10
        annotations:
          summary: "Cost exceeding $10/hour"
```

See [PRODUCTION_FEATURES.md](PRODUCTION_FEATURES.md) for monitoring setup guide.

---

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Coverage

- **73 tests total** (39 unit + 34 integration)
- Unit tests: `__tests__/utils/claudeClient.test.js`
- Integration tests: `__tests__/routes/summarize.test.js`

**Coverage:**
- ✅ Retry logic with exponential backoff
- ✅ Circuit breaker states (CLOSED, HALF_OPEN, OPEN)
- ✅ Error mapping (429, 503, timeout, etc.)
- ✅ Input validation (all edge cases)
- ✅ Rate limiting
- ✅ Batch processing

### Manual Testing

```bash
# Test basic summarization
npm start &
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{"text":"'$(python3 -c "print('AI is amazing. ' * 20)")'"}'

# Test rate limiting (should return 429 after 10 requests)
for i in {1..12}; do
  curl -X POST http://localhost:3000/api/summarize \
    -H "Content-Type: application/json" \
    -d '{"text":"'$(python3 -c "print('Test. ' * 20)")'"}'
done
```

---

## 🔒 Security

### Features

✅ **Input Validation**
- Text length limits (50-10,000 characters)
- UTF-8 encoding validation
- Null byte detection
- Prompt injection pattern detection

✅ **Rate Limiting**
- Configurable per-IP or per-API-key
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

✅ **Security Headers**
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy (disables unnecessary features)

✅ **No Information Disclosure**
- Stack traces only in development
- Sanitized error messages
- No file paths in production errors
- No API keys in logs or errors
- IP addresses anonymized in logs

✅ **CORS**
- Whitelist-based in production
- No wildcards
- Configurable via `ALLOWED_ORIGINS` env var

### Best Practices

- **Use HTTPS** - Always in production (configure at load balancer)
- **Rotate API keys** - Regularly rotate Anthropic API key
- **Set ALLOWED_ORIGINS** - Whitelist your domains in production
- **Monitor metrics** - Alert on unusual patterns
- **Review logs** - Check for attack patterns

See [SECURITY.md](SECURITY.md) for full security documentation.

---

## 🚢 Production Deployment

### Pre-Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `ALLOWED_ORIGINS` (no wildcards)
- [ ] Enable HTTPS at load balancer
- [ ] Set up Redis for idempotency and rate limiting
- [ ] Configure structured logging (Winston/Bunyan)
- [ ] Set up Prometheus scraping
- [ ] Configure alerting rules
- [ ] Run load tests
- [ ] Set up health check monitoring
- [ ] Review security headers

### Docker Deployment

```bash
# Build image
docker build -t ai-summarizer-api .

# Run container
docker run -d \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e NODE_ENV=production \
  ai-summarizer-api
```

### Docker Compose

```bash
# Start all services (API + Redis + Prometheus + Grafana)
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

### Environment Variables for Production

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-your-production-key

# Production settings
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://yourapp.com,https://api.yourapp.com

# Rate limiting (adjust based on your tier)
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000

# Redis (for multi-instance deployment)
REDIS_URL=redis://redis:6379
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-summarizer-api
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: api
        image: ai-summarizer-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: anthropic-api-key
        livenessProbe:
          httpGet:
            path: /live
            port: 3000
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "ANTHROPIC_API_KEY is required"

**Cause**: Missing or invalid API key

**Solution**:
```bash
# Check .env file exists
cat .env

# Verify API key format (should start with sk-ant-)
echo $ANTHROPIC_API_KEY
```

#### 2. "Circuit breaker is OPEN"

**Cause**: Too many failures to Claude API

**Solution**:
```bash
# Check circuit breaker state
curl http://localhost:3000/api/summarize/health

# Wait for timeout (30 seconds default)
# Or restart server to reset
```

#### 3. "Rate limit exceeded"

**Cause**: Too many requests in time window

**Solution**:
```bash
# Wait for rate limit reset (check X-RateLimit-Reset header)
# Or increase limits in .env:
RATE_LIMIT_MAX_REQUESTS=100
```

#### 4. Tests hang / never exit

**Cause**: setInterval not cleared

**Solution**:
```bash
# Use test environment
NODE_ENV=test npm test

# Or fix cleanup in code (see CODE_REVIEW.md)
```

#### 5. "CORS policy" error in browser

**Cause**: Origin not whitelisted

**Solution**:
```bash
# Development: Already allows localhost
# Production: Set ALLOWED_ORIGINS
ALLOWED_ORIGINS=https://yourapp.com
```

### Debug Mode

```bash
# Enable verbose logging
NODE_ENV=development npm run dev

# Check metrics
curl http://localhost:3000/metrics | grep error

# Check circuit breaker
curl http://localhost:3000/api/summarize/health
```

---

## 🤝 Contributing

### Development Setup

```bash
# 1. Fork and clone
git clone <your-fork>

# 2. Create feature branch
git checkout -b feature/your-feature

# 3. Install dependencies
npm install

# 4. Run tests
npm test

# 5. Make changes
# ...

# 6. Run tests again
npm test

# 7. Commit with descriptive message
git commit -m "feat: add awesome feature"

# 8. Push and create PR
git push origin feature/your-feature
```

### Code Style

- Use 2 spaces for indentation
- Follow existing patterns
- Add tests for new features
- Update documentation
- Run `npm test` before committing

### Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] No secrets committed
- [ ] Code follows existing style

---

## 📄 License

ISC

---

## 📚 Additional Documentation

- **[PRODUCTION_FEATURES.md](PRODUCTION_FEATURES.md)** - OpenAPI, Prometheus, Idempotency
- **[SECURITY.md](SECURITY.md)** - Security features, OWASP Top 10, GDPR
- **[BATCH_API.md](BATCH_API.md)** - Batch endpoint documentation
- **[CODE_REVIEW.md](CODE_REVIEW.md)** - Critical issues before production
- **[OpenAPI Spec](openapi.yaml)** - Full API specification

---

## 🙋 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Documentation**: http://localhost:3000/docs
- **Security**: See [SECURITY.md](SECURITY.md)

---

## 🎯 Roadmap

### Completed ✅
- [x] Basic summarization endpoint
- [x] Batch processing with concurrency
- [x] OpenAPI/Swagger documentation
- [x] Prometheus metrics
- [x] Idempotency support
- [x] Circuit breaker pattern
- [x] Comprehensive testing

### Planned 🚧
- [ ] Redis for state management
- [ ] Structured logging (Winston)
- [ ] Response caching
- [ ] Webhook notifications
- [ ] API key management
- [ ] Cost control system
- [ ] Streaming responses (SSE)

---

## 🏆 Acknowledgments

- **Anthropic** - Claude API
- **Express.js** - Web framework
- **Prometheus** - Metrics collection
- **Swagger UI** - API documentation

---

**Built with ❤️ for production use**
