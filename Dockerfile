# ============================================================================
# Multi-Stage Dockerfile for AI Summarizer API
# ============================================================================
# Stage 1: Builder - Install dependencies
# Stage 2: Production - Copy only production files
# ============================================================================

# Stage 1: Builder
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for potential build steps)
RUN npm ci --only=production

# ============================================================================
# Stage 2: Production
FROM node:18-alpine

# Metadata
LABEL maintainer="AI Summarizer API Team"
LABEL description="Production-ready REST API for text summarization using Claude AI"
LABEL version="1.0.0"

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files (for metadata)
COPY package*.json ./

# Copy dependencies from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy production source files
COPY --chown=nodejs:nodejs config/ ./config/
COPY --chown=nodejs:nodejs middleware/ ./middleware/
COPY --chown=nodejs:nodejs routes/ ./routes/
COPY --chown=nodejs:nodejs utils/ ./utils/
COPY --chown=nodejs:nodejs server.js ./
COPY --chown=nodejs:nodejs openapi.yaml ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Environment variables (can be overridden at runtime)
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info

# Health check
# Check /health endpoint every 30s, timeout after 3s, start checking after 10s, max 3 retries
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use dumb-init to handle signals properly (graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]
