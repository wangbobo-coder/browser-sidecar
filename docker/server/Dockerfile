# MCP Server Container Dockerfile
# Node.js based server for browser automation

FROM node:20-alpine

# Install minimal dependencies
RUN apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1000 -S nodejs && \
    adduser -S -u 1000 -G nodejs nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Create session storage directory
RUN mkdir -p /shared/sessions && \
    chown -R nodejs:nodejs /shared

# Switch to non-root user
USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV LOG_LEVEL=info

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start server
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]