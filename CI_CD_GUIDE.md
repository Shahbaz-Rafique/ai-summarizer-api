# CI/CD Pipeline Guide

**Purpose**: Comprehensive CI/CD setup with GitHub Actions

---

## Overview

### Workflows Created

1. **ci.yml** - Main CI pipeline (runs on every push/PR)
2. **release.yml** - Release automation (runs on version tags)
3. **codeql.yml** - Security scanning (weekly + on push)
4. **dependabot.yml** - Automated dependency updates

---

## CI Pipeline (.github/workflows/ci.yml)

### Triggers
```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
```

### Jobs (6 total)

#### 1. Lint (runs in parallel)
```bash
✅ Checkout code
✅ Setup Node.js 18
✅ Install dependencies (npm ci)
✅ Run ESLint
❌ Fail if linting errors found
```

**Time**: ~2 minutes

---

#### 2. Test & Coverage (runs in parallel)
```bash
✅ Checkout code
✅ Setup Node.js 18
✅ Install dependencies
✅ Run tests with coverage (npm run test:coverage)
✅ Check coverage >= 80%
✅ Upload coverage to Codecov
✅ Archive coverage report (30 days)
✅ Comment coverage on PR
```

**Coverage Check**:
```bash
if coverage < 80%:
  ❌ FAIL: "Coverage is below 80% (current: XX%)"
else:
  ✅ PASS: "Coverage check passed (XX% >= 80%)"
```

**Time**: ~3 minutes

---

#### 3. Security Audit (runs in parallel)
```bash
✅ npm audit --audit-level=high
✅ Snyk security scan (if token configured)
```

**Time**: ~1 minute  
**Note**: Continues even if vulnerabilities found (warning only)

---

#### 4. Docker Build (runs after lint + test)
```bash
✅ Setup Docker Buildx
✅ Build Docker image
✅ Test Docker image:
  - Start container
  - Wait for health check (30s timeout)
  - Test /health endpoint
  - Check response contains "healthy"
✅ Get image size
✅ Scan with Trivy (security vulnerabilities)
✅ Upload scan results to GitHub Security
✅ Comment build info on PR
```

**Time**: ~5 minutes

---

#### 5. Integration Tests (runs after docker-build, main branch only)
```bash
✅ Start services with docker-compose
✅ Wait for API to be ready (30s timeout)
✅ Run integration tests
✅ Stop services
```

**Time**: ~3 minutes  
**Condition**: Only runs on main branch

---

#### 6. Build Summary (runs after all jobs)
```bash
✅ Check all job statuses
✅ Create summary table
✅ Fail if any required job failed
```

**Time**: <1 minute

---

## Total Pipeline Time

| Scenario | Time | Notes |
|----------|------|-------|
| **PR (develop)** | ~8 min | Lint + Test + Docker (parallel) |
| **PR (main)** | ~11 min | + Integration tests |
| **All pass** | ✅ Green | Pipeline succeeds |
| **Any fail** | ❌ Red | Pipeline fails |

---

## Coverage Enforcement

### How It Works

1. **Run tests with coverage**:
   ```bash
   npm run test:coverage
   ```

2. **Extract coverage from JSON**:
   ```bash
   COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
   ```

3. **Check threshold**:
   ```bash
   if (( $(echo "$COVERAGE < 80" | bc -l) )); then
     exit 1  # Fail pipeline
   fi
   ```

4. **Comment on PR**:
   ```markdown
   ## 📊 Test Coverage Report
   
   | Metric | Coverage | Status |
   |--------|----------|--------|
   | Lines | 78% | ❌ |
   | Statements | 80% | ✅ |
   | Functions | 85% | ✅ |
   | Branches | 75% | ❌ |
   
   ❌ Coverage below threshold!
   ```

---

## PR Comments

### Coverage Comment Example
```markdown
## 📊 Test Coverage Report

| Metric | Coverage | Status |
|--------|----------|--------|
| **Lines** | 82.5% | ✅ |
| **Statements** | 83.1% | ✅ |
| **Functions** | 85.7% | ✅ |
| **Branches** | 78.9% | ❌ |

**Threshold**: 80%
✅ Coverage check passed!
```

### Docker Build Comment Example
```markdown
## 🐳 Docker Build Report

✅ Docker image built successfully!

**Image Details:**
- Tag: `ai-summarizer-api:abc123def456`
- Size: `185MB`
- Health Check: ✅ Passed
- Security Scan: ✅ Completed (see Security tab for details)
```

---

## Release Pipeline (.github/workflows/release.yml)

### Trigger
```bash
git tag v1.0.0
git push origin v1.0.0
```

### Jobs

#### 1. Create GitHub Release
```bash
✅ Generate changelog (commits since last tag)
✅ Create GitHub Release with:
  - Tag name (v1.0.0)
  - Changelog
  - Docker pull command
  - Installation instructions
```

#### 2. Build & Push Docker Image
```bash
✅ Build Docker image
✅ Push to GitHub Container Registry (ghcr.io)
✅ Tags created:
  - v1.0.0 (exact version)
  - v1.0 (minor version)
  - v1 (major version)
  - latest (if main branch)
✅ Multi-platform: linux/amd64, linux/arm64
✅ Generate SBOM (Software Bill of Materials)
✅ Upload SBOM as artifact
```

**Image Location**:
```bash
ghcr.io/<your-org>/ai-summarizer-api:v1.0.0
ghcr.io/<your-org>/ai-summarizer-api:v1.0
ghcr.io/<your-org>/ai-summarizer-api:v1
ghcr.io/<your-org>/ai-summarizer-api:latest
```

---

## Security Scanning (.github/workflows/codeql.yml)

### Triggers
- Push to main
- Pull requests to main
- Weekly (Mondays at 00:00 UTC)

### What It Does
```bash
✅ Initialize CodeQL
✅ Analyze JavaScript code
✅ Find security vulnerabilities:
  - SQL injection
  - XSS
  - Command injection
  - Path traversal
  - Hardcoded secrets
  - etc.
✅ Upload results to GitHub Security tab
```

**Results**: View in **Security > Code scanning alerts**

---

## Dependabot (.github/dependabot.yml)

### Automated Updates

1. **npm dependencies** (weekly, Mondays 09:00)
   - Groups patch updates together
   - Groups minor updates together
   - Ignores ESLint major updates
   - Max 10 open PRs

2. **GitHub Actions** (weekly, Mondays 09:00)
   - Updates action versions

3. **Docker base image** (weekly, Mondays 09:00)
   - Updates node:18-alpine

### PR Labels
- `dependencies`
- `javascript` or `github-actions` or `docker`

---

## Secrets Required

### GitHub Secrets (Settings > Secrets)

| Secret | Required | Purpose |
|--------|----------|---------|
| `CODECOV_TOKEN` | Optional | Upload coverage to Codecov |
| `SNYK_TOKEN` | Optional | Snyk security scanning |
| `GITHUB_TOKEN` | Auto | GitHub API access (provided automatically) |

### How to Add Secrets

1. Go to **Settings > Secrets and variables > Actions**
2. Click **New repository secret**
3. Add name and value
4. Click **Add secret**

---

## Branch Protection Rules

### Recommended Settings (Settings > Branches)

**For main branch**:
```yaml
✅ Require pull request reviews (1 approver)
✅ Require status checks to pass before merging:
  - Lint Code
  - Test & Coverage
  - Build Docker Image
✅ Require branches to be up to date
✅ Require conversation resolution before merging
✅ Require linear history
✅ Include administrators
```

**For develop branch**:
```yaml
✅ Require status checks to pass before merging:
  - Lint Code
  - Test & Coverage
✅ Require branches to be up to date
```

---

## Cache Strategy

### npm Cache
```yaml
uses: actions/setup-node@v4
with:
  cache: 'npm'
```
**Benefit**: Faster `npm ci` (dependencies cached)

### Docker Cache
```yaml
uses: docker/build-push-action@v5
with:
  cache-from: type=gha
  cache-to: type=gha,mode=max
```
**Benefit**: Faster Docker builds (layers cached)

---

## Concurrency Control

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Benefit**: New push cancels old workflow (saves CI minutes)

**Example**:
- Push commit A → CI starts
- Push commit B → CI for A cancelled, CI for B starts

---

## Artifacts & Reports

### Uploaded Artifacts (30-day retention)

1. **Coverage Report** (every run)
   - Location: `coverage/`
   - Format: HTML + JSON
   - Access: Actions > Workflow run > Artifacts

2. **SBOM** (releases only)
   - Location: `sbom.json`
   - Format: CycloneDX JSON
   - Access: Release > Assets

3. **Security Scan Results** (every run)
   - Location: Security tab
   - Format: SARIF
   - Access: Security > Code scanning alerts

---

## Local Testing

### Test the pipeline locally

```bash
# Install act (GitHub Actions local runner)
brew install act  # macOS
# or
choco install act  # Windows

# Run workflow locally
act push

# Run specific job
act -j test

# With secrets
act push --secret-file .env
```

---

## Monitoring CI/CD

### GitHub Insights

**Settings > Insights > Actions**:
- Workflow runs over time
- Success/failure rate
- Average run time
- Most active workflows

### Useful Queries

**Failed runs in last 7 days**:
```
is:failure created:>2026-05-30
```

**Runs taking > 10 minutes**:
```
is:completed created:>2026-05-30
```

---

## Troubleshooting

### Coverage check fails

**Problem**: `Coverage is below 80%`

**Solution**:
```bash
# Run coverage locally
npm run test:coverage

# Check report
open coverage/lcov-report/index.html

# Add tests for uncovered lines
# Re-run and verify
npm run test:coverage
```

---

### Docker build fails

**Problem**: `Container failed health check`

**Solution**:
```bash
# Test locally
docker build -t test .
docker run -d --name test -p 3000:3000 -e ANTHROPIC_API_KEY=test test
docker logs test

# Check health manually
curl http://localhost:3000/health

# Debug inside container
docker exec -it test sh
```

---

### Linting fails

**Problem**: `Linting failed`

**Solution**:
```bash
# Run linting locally
npm run lint

# Auto-fix
npm run lint:fix

# Check remaining errors
npm run lint
```

---

### Rate limit exceeded (GitHub API)

**Problem**: `API rate limit exceeded`

**Solution**:
- Wait 1 hour (rate limit resets)
- Or use GitHub token with higher limits
- Or reduce frequency of API calls

---

## Cost Optimization

### GitHub Actions Minutes

**Free tier**:
- Public repos: Unlimited
- Private repos: 2,000 minutes/month

**Optimization tips**:
1. ✅ Use caching (npm, Docker)
2. ✅ Cancel old workflows (concurrency control)
3. ✅ Skip integration tests on PRs (only on main)
4. ✅ Run security scans weekly (not every push)

**Typical usage per month**:
- CI pipeline: 8 min × 50 runs = 400 min
- Release pipeline: 10 min × 4 releases = 40 min
- CodeQL: 5 min × 4 weeks = 20 min
- **Total**: ~460 min/month (✅ Under free tier)

---

## Best Practices

### ✅ DO

1. **Keep workflows fast** (<10 min)
   - Use caching
   - Run jobs in parallel
   - Skip unnecessary steps

2. **Fail fast**
   - Run linting before tests
   - Run tests before Docker build
   - Use `needs` to control job order

3. **Provide clear feedback**
   - Use `::error::` for errors
   - Use `::notice::` for info
   - Comment coverage on PRs

4. **Secure secrets**
   - Never log secrets
   - Use GitHub Secrets
   - Rotate tokens regularly

5. **Monitor pipeline health**
   - Track success rate
   - Track run time
   - Set up alerts for failures

### ❌ DON'T

1. **Don't run everything on every push**
   - Skip integration tests on PRs
   - Run security scans weekly
   - Use branch filters

2. **Don't ignore failures**
   - Investigate failing jobs
   - Don't disable checks to "fix" CI

3. **Don't store secrets in code**
   - Use GitHub Secrets
   - Use environment variables
   - Never commit .env files

4. **Don't build twice**
   - Use artifacts between jobs
   - Cache Docker layers
   - Cache npm dependencies

---

## Summary

### ✅ What's Automated

| Action | When | Result |
|--------|------|--------|
| **Linting** | Every push/PR | ❌ Fail if errors |
| **Testing** | Every push/PR | ❌ Fail if <80% coverage |
| **Security** | Every push/PR | ⚠️ Warn if vulnerabilities |
| **Docker Build** | Every push/PR | ❌ Fail if build errors |
| **Integration** | Push to main | ❌ Fail if tests fail |
| **Release** | Version tag | 🚀 Create release + push image |
| **CodeQL** | Weekly + push | 🔒 Find security issues |
| **Dependencies** | Weekly | 📦 Open PRs for updates |

### 📊 Pipeline Statistics

| Metric | Value |
|--------|-------|
| **Total workflows** | 4 |
| **Total jobs** | 10 |
| **Avg run time** | 8-11 minutes |
| **Coverage threshold** | 80% |
| **Required checks** | 3 (lint, test, docker) |
| **Optional checks** | 2 (security, integration) |

---

**End of CI/CD Guide**
