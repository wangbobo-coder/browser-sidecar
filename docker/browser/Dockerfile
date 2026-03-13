# Browser Container Dockerfile
# Based on Playwright official image for browser automation

FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Install minimal dependencies
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        fontconfig \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libwayland-client0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        xdg-utils && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r playwright && \
    useradd -m -r -g playwright -d /home/playwright -s /bin/bash playwright && \
    chown -R playwright:playwright /home/playwright

# Set working directory
WORKDIR /home/playwright

# Create session storage directory
RUN mkdir -p /shared/sessions && \
    chown -R playwright:playwright /shared

# Switch to non-root user
USER playwright

# Environment variables
ENV BROWSER_HEADLESS=true
ENV DISPLAY=:99
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep chromium || exit 1

# Default command (will be overridden by k8s)
CMD ["bash"]