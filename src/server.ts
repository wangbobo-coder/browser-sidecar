/**
 * TCP Server for browser-sidecar
 * 
 * Direct TCP/Unix Socket communication (NOT MCP protocol).
 * Listens on port 3001 or Unix socket for incoming requests.
 */

import * as net from 'net';
import * as http from 'http';
import * as os from 'os';
import pino from 'pino';
import type { Request, Response, ServerConfig } from './types.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

/**
 * Request handler function type
 */
type RequestHandler = (request: Request) => Promise<Response>;

// Resource monitoring types
type MemUsage = {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers?: number;
};

/**
 * TCP Server class
 */
export class TCPServer {
  private server: net.Server | null = null;
  private handlers: Map<string, RequestHandler> = new Map();
  private config: ServerConfig;
  // Resource monitoring state
  private _monitorIntervalMs: number;
  private _monitorTimer?: NodeJS.Timeout;
  private _prevCpuUsage?: any;
  private _lastCpuSampleTime?: number;
  private _monitorSamples: Array<{ ts: number; mem: MemUsage; cpuPercent: number }> = [];
  private _monitorHistoryLimit: number;
  private _healthEndpointAttached: boolean = false;
  // Health HTTP server (exposed via Node's http module) for Kubernetes probes
  private _healthHttpServer?: http.Server;

  constructor(config: ServerConfig) {
    this.config = config;
    this._monitorIntervalMs = config.monitorIntervalMs ?? 1000;
    this._monitorHistoryLimit = config.monitorHistoryLimit ?? 60;
  }

  /**
   * Register a handler for a specific operation
   */
  registerHandler(operation: string, handler: RequestHandler): void {
    this.handlers.set(operation, handler);
    logger.debug({ operation }, 'Handler registered');
  }

  /**
   * Start the TCP server
   */
  async start(): Promise<void> {
    this._initMonitoring();
    // Initialize health HTTP endpoint if configured
    this._maybeInitHealthEndpoint();
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        logger.error({ err }, 'Server error');
        reject(err);
      });

      if (this.config.socketPath && os.platform() !== 'win32') {
        // Use Unix socket on non-Windows platforms
        this.server.listen(this.config.socketPath, () => {
          logger.info({ socketPath: this.config.socketPath }, 'Server listening on Unix socket');
          resolve();
        });
      } else {
        // Use TCP port
        this.server.listen(this.config.port, () => {
          logger.info({ port: this.config.port }, 'Server listening on TCP port');
          resolve();
        });
      }
    });
  }

  // Initialize a lightweight HTTP health server on config.healthPort if provided
  private _maybeInitHealthEndpoint(): void {
    const port = (this.config as any)?.healthPort as number | undefined;
    if (!port) return;
    if (this._healthHttpServer) return; // already created
    this._healthHttpServer = http.createServer((req, res) => {
      const url = (req as any).url || '/';
      if (url.startsWith('/health')) {
        const snapshot = (this as any).getMonitoringSnapshot?.() ?? {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', monitoring: snapshot }));
        return;
      }
      if (url.startsWith('/ready')) {
        let ready = false;
        try {
          const anyThis: any = this;
          if (typeof anyThis.isBrowserConnected === 'function') {
            ready = !!anyThis.isBrowserConnected();
          } else if (typeof anyThis.getBrowserConnectionCount === 'function') {
            ready = anyThis.getBrowserConnectionCount() > 0;
          } else if (typeof anyThis.activeConnections === 'number') {
            ready = anyThis.activeConnections > 0;
          } else {
            ready = true; // best-effort if probe can't determine
          }
        } catch {
          ready = false;
        }
        res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: ready ? 'ready' : 'not_ready' }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    this._healthHttpServer.listen(port, () => {
      // health endpoint listening
    });
  }

  /**
   * Stop the TCP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Cleanup monitoring resources before closing
      this._cleanupMonitoring();
      this.server.close((err) => {
        if (err) {
          logger.error({ err }, 'Error closing server');
          reject(err);
        } else {
          logger.info('Server stopped');
          // Close health HTTP server if running
          if (this._healthHttpServer) {
            try {
              this._healthHttpServer.close();
            } catch {
              // ignore close errors
            }
            this._healthHttpServer = undefined;
          }
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming connection
   */
  private _initMonitoring(): void {
    if (this._monitorTimer) return;
    this._prevCpuUsage = process.cpuUsage();
    this._lastCpuSampleTime = Date.now();
    this._collectMonitoringSample();
    this._monitorTimer = setInterval(() => this._collectMonitoringSample(), this._monitorIntervalMs);
    this._attachHealthEndpoint();
  }
  private _collectMonitoringSample(): void {
    try {
      const mem = process.memoryUsage();
      const now = Date.now();
      let cpuPercent = 0;
      if (this._prevCpuUsage && this._lastCpuSampleTime != null) {
        const delta = process.cpuUsage(this._prevCpuUsage);
        const elapsed = (now - this._lastCpuSampleTime) * 1000;
        const cpuMicros = delta.user + delta.system;
        cpuPercent = elapsed > 0 ? (cpuMicros / elapsed) * 100 : 0;
      }
      this._prevCpuUsage = process.cpuUsage();
      this._lastCpuSampleTime = now;
      const sample: any = {
        ts: now,
        mem: {
          rss: mem.rss,
          heapTotal: mem.heapTotal,
          heapUsed: mem.heapUsed,
          external: (mem as any).external ?? 0,
        },
        cpuPercent,
      };
      this._monitorSamples.push(sample);
      if (this._monitorSamples.length > this._monitorHistoryLimit) this._monitorSamples.shift();
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('Monitoring error', err);
    }
  }
  public getMonitoringSnapshot(): any {
    return {
      latest: this._monitorSamples[this._monitorSamples.length - 1] ?? null,
      history: this._monitorSamples,
    };
  }
  private _attachHealthEndpoint(): void {
    if (this._healthEndpointAttached) return;
    try {
      const self: any = this;
      const app = self.app;
      if (!app) return;
      if (typeof app.get === 'function') {
        app.get('/health', (_req: any, res: any) => {
          res.status(200).json({ status: 'ok', monitoring: this.getMonitoringSnapshot() });
        });
      } else if (typeof app.use === 'function') {
        app.use('/health', (_req: any, res: any) => {
          res.status(200).json({ status: 'ok', monitoring: this.getMonitoringSnapshot() });
        });
      }
      this._healthEndpointAttached = true;
    } catch {
      // Ignore if no HTTP layer is present
    }
  }
  private _cleanupMonitoring(): void {
    if (this._monitorTimer) {
      clearInterval(this._monitorTimer);
      this._monitorTimer = undefined;
    }
  }
  private handleConnection(socket: net.Socket): void {
    const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.debug({ clientAddr }, 'Client connected');

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // Process complete messages (newline-delimited JSON)
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          this.processRequest(line, socket);
        }
      }
    });

    socket.on('error', (err) => {
      logger.error({ err, clientAddr }, 'Socket error');
    });

    socket.on('close', () => {
      logger.debug({ clientAddr }, 'Client disconnected');
    });
  }

  /**
   * Process a single request
   */
  private async processRequest(data: string, socket: net.Socket): Promise<void> {
    const startTime = Date.now();

    try {
      const request: Request = JSON.parse(data);
      logger.debug({ requestId: request.id, operation: request.operation }, 'Processing request');

      const handler = this.handlers.get(request.operation);
      if (!handler) {
        const response: Response = {
          id: request.id,
          success: false,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          error: {
            code: 'UNKNOWN_OPERATION',
            message: `Unknown operation: ${request.operation}`,
          },
        };
        socket.write(JSON.stringify(response) + '\n');
        return;
      }

      const response = await handler(request);
      response.duration = Date.now() - startTime;
      socket.write(JSON.stringify(response) + '\n');

      logger.info(
        { requestId: request.id, operation: request.operation, duration: response.duration },
        'Request completed'
      );
    } catch (err) {
      logger.error({ err }, 'Failed to process request');
      const errorResponse: Response = {
        id: 'unknown',
        success: false,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        error: {
          code: 'INVALID_REQUEST',
          message: err instanceof Error ? err.message : 'Invalid request format',
        },
      };
      socket.write(JSON.stringify(errorResponse) + '\n');
    }
  }
}

/**
 * Create and configure the TCP server
 */
export function createServer(config: ServerConfig): TCPServer {
  return new TCPServer(config);
}
