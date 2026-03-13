/**
 * Entry point for browser-sidecar server
 * 
 * Usage:
 *   npm run dev     # Development mode with ts-node
 *   npm run start   # Production mode (requires build first)
 */

import { createServer } from './server.js';
import { createBrowserManager } from './browser/index.js';
import { createSessionManager } from './session/index.js';
import { registerHandlers } from './handlers/index.js';
import { DEFAULT_CONFIG, ServerConfig } from './types.js';
import pino from 'pino';

const logger = pino({ name: 'main' });

/**
 * Main server configuration
 */
const config: ServerConfig = {
  ...DEFAULT_CONFIG,
  port: parseInt(process.env.PORT ?? '3001', 10),
  socketPath: process.env.SOCKET_PATH,
  sessionStoragePath: process.env.SESSION_STORAGE_PATH ?? DEFAULT_CONFIG.sessionStoragePath,
  encryptionKey: process.env.SESSION_ENCRYPTION_KEY,
  headless: process.env.BROWSER_HEADLESS !== 'false',
  logLevel: (process.env.LOG_LEVEL as ServerConfig['logLevel']) ?? DEFAULT_CONFIG.logLevel,
};

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string, server: ReturnType<typeof createServer>, browser: ReturnType<typeof createBrowserManager>) {
  logger.info({ signal }, 'Shutting down...');
  
  try {
    await browser.close();
    await server.stop();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main() {
  logger.info(config, 'Starting browser-sidecar server');
  
  // Create components
  const server = createServer(config);
  const browserManager = createBrowserManager(config);
  const sessionManager = createSessionManager(config);
  
  // Initialize browser
  try {
    await browserManager.initialize();
    logger.info('Browser initialized');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize browser');
    process.exit(1);
  }
  
  // Initialize session storage
  try {
    await sessionManager.initialize();
    logger.info('Session storage initialized');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize session storage');
    process.exit(1);
  }
  
  // Register handlers
  registerHandlers(server, {
    browserManager,
    sessionManager,
  });
  
  // Start TCP server
  try {
    await server.start();
    logger.info(`Server listening on port ${config.port}`);
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    await browserManager.close();
    process.exit(1);
  }
  
  // Setup graceful shutdown
  process.on('SIGINT', () => shutdown('SIGINT', server, browserManager));
  process.on('SIGTERM', () => shutdown('SIGTERM', server, browserManager));
  
  // Health check endpoints (simple HTTP server for k8s probes)
  const http = await import('http');
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      if (browserManager.isConnected()) {
        res.writeHead(200);
        res.end('OK');
      } else {
        res.writeHead(503);
        res.end('Browser not connected');
      }
    } else if (req.url === '/ready') {
      if (browserManager.isConnected()) {
        res.writeHead(200);
        res.end('Ready');
      } else {
        res.writeHead(503);
        res.end('Not ready');
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  
  healthServer.listen(8080, () => {
    logger.info('Health check server listening on port 8080');
  });
}

// Run main
main().catch((err) => {
  logger.error({ err }, 'Unhandled error');
  process.exit(1);
});