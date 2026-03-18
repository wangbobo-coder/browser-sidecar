/**
 * OpenClaw Browser Sidecar Client
 *
 * TCP Socket client for communicating with the browser-sidecar service.
 * Supports both TCP port and Unix socket connections.
 */

import * as net from 'node:net';
import type {
  SelectorOptions,
  WaitOptions,
  Request,
  Response,
  NavigateRequest,
  ClickRequest,
  TypeRequest,
  WaitRequest,
  ScreenshotRequest,
  AuthSaveRequest,
  AuthRestoreRequest,
  GetStateRequest,
  CloseRequest,
  NavigateResponse,
  ClickResponse,
  TypeResponse,
  ScreenshotResponse,
  AuthSaveResponse,
  AuthRestoreResponse,
  GetStateResponse,
  BaseResponse,
} from '../types.js';

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * Configuration options for the BrowserSidecarClient
 */
export interface ClientConfig {
  /** TCP host (default: 'localhost') */
  host?: string;
  /** TCP port (default: 3001) */
  port?: number;
  /** Unix socket path (alternative to host/port) */
  socketPath?: string;
  /** Connection timeout in milliseconds (default: 5000) */
  connectionTimeout?: number;
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeout?: number;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Max reconnect attempts (default: 3) */
  maxReconnectAttempts?: number;
  /** Auto connect on first operation (default: true) */
  autoConnect?: boolean;
}

/**
 * Client connection state
 */
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Pending request tracker
 */
interface PendingRequest {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  timestamp: number;
}

// ============================================================================
// Custom Errors
// ============================================================================

/**
 * Base error class for client errors
 */
export class BrowserSidecarError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'BrowserSidecarError';
  }
}

/**
 * Connection-related error
 */
export class ConnectionError extends BrowserSidecarError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'ConnectionError';
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends BrowserSidecarError {
  constructor(message: string, details?: unknown) {
    super(message, 'TIMEOUT', details);
    this.name = 'TimeoutError';
  }
}

/**
 * Request error from server
 */
export class RequestError extends BrowserSidecarError {
  constructor(
    message: string,
    public readonly errorCode: string,
    details?: unknown
  ) {
    super(message, errorCode, details);
    this.name = 'RequestError';
  }
}

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * BrowserSidecarClient - TCP client for browser automation
 *
 * @example
 * ```typescript
 * const client = new BrowserSidecarClient({ port: 3001 });
 * await client.navigate('https://example.com');
 * await client.click({ css: '#button' });
 * await client.close();
 * ```
 */
export class BrowserSidecarClient {
  private readonly config: Required<ClientConfig>;
  private socket: net.Socket | null = null;
  private state: ConnectionState = 'disconnected';
  private buffer: string = '';
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private reconnectAttempts = 0;
  private requestIdCounter = 0;

  constructor(config: ClientConfig = {}) {
    this.config = {
      host: config.host ?? 'localhost',
      port: config.port ?? 3001,
      socketPath: config.socketPath ?? '',
      connectionTimeout: config.connectionTimeout ?? 5000,
      requestTimeout: config.requestTimeout ?? 30000,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 3,
      autoConnect: config.autoConnect ?? true,
    };
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Get current connection state
   */
  get connectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if client is connected
   */
  get isConnected(): boolean {
    return this.state === 'connected' && this.socket !== null;
  }

  /**
   * Connect to the server
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.state = 'connecting';

      const socket = new net.Socket();
      const connectionTimeout = setTimeout(() => {
        socket.destroy();
        this.state = 'error';
        reject(new ConnectionError(`Connection timeout after ${this.config.connectionTimeout}ms`));
      }, this.config.connectionTimeout);

      socket.on('connect', () => {
        clearTimeout(connectionTimeout);
        this.socket = socket;
        this.state = 'connected';
        this.reconnectAttempts = 0;
        resolve();
      });

      socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      socket.on('error', (err: Error) => {
        clearTimeout(connectionTimeout);
        this.state = 'error';
        reject(new ConnectionError(`Connection failed: ${err.message}`, err));
      });

      socket.on('close', () => {
        this.handleDisconnect();
      });

      // Connect via TCP port or Unix socket
      if (this.config.socketPath) {
        socket.connect(this.config.socketPath);
      } else {
        socket.connect(this.config.port, this.config.host);
      }
    });
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (!this.socket) {
      return;
    }

    return new Promise((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }

      this.socket.once('close', () => {
        this.socket = null;
        this.state = 'disconnected';
        resolve();
      });

      this.socket.end();
    });
  }

  /**
   * Handle incoming data
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString('utf-8');

    // Process complete messages (newline-delimited JSON)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim()) {
        this.handleMessage(line);
      }
    }
  }

  // Create more specific error types based on error code
  private createError(errorCode: string, errorMessage: string, errorDetails?: unknown): Error {
    switch (errorCode) {
      case 'ELEMENT_NOT_FOUND':
        return new Error(errorMessage);
      case 'ELEMENT_NOT_VISIBLE':
        return new Error(errorMessage);
      case 'NAVIGATION_FAILED':
        return new Error(errorMessage);
      case 'SESSION_NOT_FOUND':
      case 'SESSION_EXPIRED':
      case 'SESSION_SAVE_FAILED':
      case 'SESSION_RESTORE_FAILED':
        return new Error(errorMessage);
      case 'TIMEOUT':
        return new TimeoutError(errorMessage, errorDetails);
      default:
        return new RequestError(errorMessage, errorCode, errorDetails);
    }
  }

  /**
   * Handle a complete message
   */
  private handleMessage(rawMessage: string): void {
    try {
      const response = JSON.parse(rawMessage) as Response;
      const pending = this.pendingRequests.get(response.id);

      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);

        if (response.success) {
          pending.resolve(response);
        } else {
          const errorResponse = response as { error: { code: string; message: string; details?: unknown } };
          const error = this.createError(
            errorResponse.error.code,
            errorResponse.error.message,
            errorResponse.error.details
          );
          pending.reject(error);
        }
      }
    } catch {
      // Ignore parse errors for unknown responses
      console.error('Failed to parse response:', rawMessage);
    }
  }

  /**
   * Handle unexpected disconnect
   */
  private handleDisconnect(): void {
    this.state = 'disconnected';

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new ConnectionError('Connection lost'));
      this.pendingRequests.delete(id);
    }

    // Attempt reconnect if configured
    if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch(() => {
          // Silently fail reconnect attempts
        });
      }, 1000 * this.reconnectAttempts);
    }
  }

  // ==========================================================================
  // Request/Response
  // ==========================================================================

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestIdCounter}`;
  }

  /**
   * Send a request and wait for response
   */
  private async sendRequest<T extends Response>(request: Omit<Request, 'id' | 'timestamp'>): Promise<T> {
    // Ensure connected
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise<T>((resolve, reject) => {
      const id = this.generateRequestId();
      const fullRequest: Request = {
        ...request,
        id,
        timestamp: Date.now(),
      } as Request;

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new TimeoutError(`Request timeout after ${this.config.requestTimeout}ms`, { request: fullRequest }));
      }, this.config.requestTimeout);

      // Track pending request
      this.pendingRequests.set(id, {
        resolve: resolve as (response: Response) => void,
        reject,
        timeout,
        timestamp: Date.now(),
      });

      // Send request
      const message = JSON.stringify(fullRequest) + '\n';
      this.socket?.write(message, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(new ConnectionError(`Failed to send request: ${err.message}`, err));
        }
      });
    });
  }

  // ==========================================================================
  // Browser Operations
  // ==========================================================================

  /**
   * Navigate to a URL
   *
   * @param url - The URL to navigate to
   * @param wait - Optional wait options after navigation
   * @returns Navigation response with URL and title
   */
  async navigate(url: string, wait?: WaitOptions): Promise<NavigateResponse> {
    const request: Omit<NavigateRequest, 'id' | 'timestamp'> = {
      operation: 'navigate',
      url,
      wait,
    };

    return this.sendRequest<NavigateResponse>(request);
  }

  /**
   * Click an element
   *
   * @param selector - Element selector options
   * @param options - Click options (button, clickCount, delay, force)
   * @returns Click response
   */
  async click(
    selector: SelectorOptions,
    options?: {
      button?: 'left' | 'right' | 'middle';
      clickCount?: number;
      delay?: number;
      force?: boolean;
    }
  ): Promise<ClickResponse> {
    const request: Omit<ClickRequest, 'id' | 'timestamp'> = {
      operation: 'click',
      selector,
      options,
    };

    return this.sendRequest<ClickResponse>(request);
  }

  /**
   * Type text into an element
   *
   * @param selector - Element selector options
   * @param text - Text to type
   * @param options - Type options (delay, noWaitAfter)
   * @returns Type response
   */
  async type(
    selector: SelectorOptions,
    text: string,
    options?: {
      delay?: number;
      noWaitAfter?: boolean;
    }
  ): Promise<TypeResponse> {
    const request: Omit<TypeRequest, 'id' | 'timestamp'> = {
      operation: 'type',
      selector,
      text,
      options,
    };

    return this.sendRequest<TypeResponse>(request);
  }

  /**
   * Wait for a condition
   *
   * @param wait - Wait options
   * @returns Base response
   */
  async wait(wait: WaitOptions): Promise<BaseResponse> {
    const request: Omit<WaitRequest, 'id' | 'timestamp'> = {
      operation: 'wait',
      wait,
    };

    return this.sendRequest<BaseResponse>(request);
  }

  /**
   * Take a screenshot
   *
   * @param options - Screenshot options
   * @returns Screenshot response with base64 image data
   */
  async screenshot(options?: {
    fullPage?: boolean;
    selector?: SelectorOptions;
    type?: 'png' | 'jpeg';
  }): Promise<ScreenshotResponse> {
    const request: Omit<ScreenshotRequest, 'id' | 'timestamp'> = {
      operation: 'screenshot',
      ...options,
    };

    return this.sendRequest<ScreenshotResponse>(request);
  }

  /**
   * Save authentication session
   *
   * @param profileName - Name for the saved session
   * @param domain - Optional domain to save cookies for
   * @returns Auth save response
   */
  async authSave(profileName: string, domain?: string): Promise<AuthSaveResponse> {
    const request: Omit<AuthSaveRequest, 'id' | 'timestamp'> = {
      operation: 'auth_save',
      profileName,
      domain,
    };

    return this.sendRequest<AuthSaveResponse>(request);
  }

  /**
   * Restore a saved authentication session
   *
   * @param profileName - Name of the session to restore
   * @returns Auth restore response
   */
  async authRestore(profileName: string): Promise<AuthRestoreResponse> {
    const request: Omit<AuthRestoreRequest, 'id' | 'timestamp'> = {
      operation: 'auth_restore',
      profileName,
    };

    return this.sendRequest<AuthRestoreResponse>(request);
  }

  /**
   * Get current browser state
   *
   * @returns State response with URL, title, cookie count, and connection status
   */
  async getState(): Promise<GetStateResponse> {
    const request: Omit<GetStateRequest, 'id' | 'timestamp'> = {
      operation: 'get_state',
    };

    return this.sendRequest<GetStateResponse>(request);
  }

  /**
   * Close the browser
   *
   * @returns Base response
   */
  async close(): Promise<BaseResponse> {
    const request: Omit<CloseRequest, 'id' | 'timestamp'> = {
      operation: 'close',
    };

    return this.sendRequest<BaseResponse>(request);
  }

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  /**
   * Execute multiple operations in sequence
   *
   * @param operations - Array of operations to execute
   * @returns Array of responses
   */
  async batch<T extends Response[]>(
    operations: Array<() => Promise<Response>>
  ): Promise<T> {
    const results: Response[] = [];

    for (const operation of operations) {
      results.push(await operation());
    }

    return results as T;
  }

  /**
   * Wait for a selector to appear
   *
   * @param selector - CSS selector to wait for
   * @param timeout - Timeout in milliseconds
   * @returns Base response
   */
  async waitForSelector(selector: string, timeout?: number): Promise<BaseResponse> {
    return this.wait({ selector, timeout });
  }

  /**
   * Wait for network to be idle
   *
   * @param timeout - Timeout in milliseconds
   * @returns Base response
   */
  async waitForNetworkIdle(timeout?: number): Promise<BaseResponse> {
    return this.wait({ networkIdle: true, timeout });
  }

  /**
   * Click by CSS selector (convenience method)
   *
   * @param css - CSS selector
   * @param options - Click options
   * @returns Click response
   */
  async clickByCss(css: string, options?: Parameters<typeof this.click>[1]): Promise<ClickResponse> {
    return this.click({ css }, options);
  }

  /**
   * Click by text content (convenience method)
   *
   * @param text - Text to match
   * @param options - Click options
   * @returns Click response
   */
  async clickByText(text: string, options?: Parameters<typeof this.click>[1]): Promise<ClickResponse> {
    return this.click({ text }, options);
  }

  /**
   * Click by role (convenience method)
   *
   * @param role - ARIA role
   * @param options - Click options
   * @returns Click response
   */
  async clickByRole(role: string, options?: Parameters<typeof this.click>[1]): Promise<ClickResponse> {
    return this.click({ role }, options);
  }

  /**
   * Type by CSS selector (convenience method)
   *
   * @param css - CSS selector
   * @param text - Text to type
   * @param options - Type options
   * @returns Type response
   */
  async typeByCss(
    css: string,
    text: string,
    options?: Parameters<typeof this.type>[2]
  ): Promise<TypeResponse> {
    return this.type({ css }, text, options);
  }

  /**
   * Type by label (convenience method)
   *
   * @param label - Label text
   * @param text - Text to type
   * @param options - Type options
   * @returns Type response
   */
  async typeByLabel(
    label: string,
    text: string,
    options?: Parameters<typeof this.type>[2]
  ): Promise<TypeResponse> {
    return this.type({ label }, text, options);
  }

  /**
   * Type by placeholder (convenience method)
   *
   * @param placeholder - Placeholder text
   * @param text - Text to type
   * @param options - Type options
   * @returns Type response
   */
  async typeByPlaceholder(
    placeholder: string,
    text: string,
    options?: Parameters<typeof this.type>[2]
  ): Promise<TypeResponse> {
    return this.type({ placeholder }, text, options);
  }

  /**
   * Hover over an element
   *
   * @param selector - Element selector options
   * @returns Base response
   */
  async hover(selector: SelectorOptions): Promise<BaseResponse> {
    const request: Omit<{ operation: 'hover'; selector: SelectorOptions } & Request, 'id' | 'timestamp'> = {
      operation: 'hover',
      selector,
    };

    return this.sendRequest<BaseResponse>(request);
  }

  /**
   * Fill multiple form fields at once
   *
   * @param fields - Array of field definitions with selector and value
   * @returns Fill form response with filled count
   */
  async fillForm(
    fields: Array<{ selector: SelectorOptions; value: string }>
  ): Promise<BaseResponse> {
    const request: Omit<{ operation: 'fill_form'; fields: Array<{ selector: SelectorOptions; value: string }> } & Request, 'id' | 'timestamp'> = {
      operation: 'fill_form',
      fields,
    };

    return this.sendRequest<BaseResponse>(request);
  }

  /**
   * Submit a form
   *
   * @param selector - Optional form selector
   * @returns Base response
   */
  async submit(selector?: SelectorOptions): Promise<BaseResponse> {
    const request: Omit<{ operation: 'submit'; selector?: SelectorOptions } & Request, 'id' | 'timestamp'> = {
      operation: 'submit',
      selector,
    };

    return this.sendRequest<BaseResponse>(request);
  }

  // ==========================================================================
  // Smart Operations - Auto-retry with fallback selectors
  // ==========================================================================

  /**
   * Smart click - tries multiple selectors until one works
   *
   * @param selectors - Array of selector options to try in order
   * @param options - Click options
   * @returns Click response
   */
  async smartClick(
    selectors: SelectorOptions[],
    options?: Parameters<typeof this.click>[1]
  ): Promise<ClickResponse> {
    let lastError: Error | undefined;
    
    for (const selector of selectors) {
      try {
        return await this.click(selector, options);
      } catch (err) {
        lastError = err as Error;
        // Continue to next selector
      }
    }
    
    throw lastError || new Error('All selectors failed');
  }

  /**
   * Smart type - tries multiple selectors until one works
   *
   * @param selectors - Array of selector options to try in order
   * @param text - Text to type
   * @param options - Type options
   * @returns Type response
   */
  async smartType(
    selectors: SelectorOptions[],
    text: string,
    options?: Parameters<typeof this.type>[2]
  ): Promise<TypeResponse> {
    let lastError: Error | undefined;
    
    for (const selector of selectors) {
      try {
        return await this.type(selector, text, options);
      } catch (err) {
        lastError = err as Error;
        // Continue to next selector
      }
    }
    
    throw lastError || new Error('All selectors failed');
  }

  /**
   * Retry an operation until it succeeds or max attempts reached
   *
   * @param operation - Operation to retry
   * @param maxAttempts - Maximum number of attempts (default: 3)
   * @param delayMs - Delay between attempts in milliseconds (default: 1000)
   * @returns Result of the operation
   */
  async retry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    throw lastError || new Error('Operation failed after retries');
  }

  // ==========================================================================
  // Debug Utilities
  // ==========================================================================

  /**
   * Debug mode - enables verbose logging
   */
  private debugMode: boolean = false;

  /**
   * Enable debug mode
   */
  enableDebug(): void {
    this.debugMode = true;
  }

  /**
   * Disable debug mode
   */
  disableDebug(): void {
    this.debugMode = false;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugEnabled(): boolean {
    return this.debugMode;
  }

  /**
   * Take a debug screenshot with timestamp
   *
   * @param label - Optional label for the screenshot
   * @returns Screenshot response
   */
  async debugScreenshot(label?: string): Promise<ScreenshotResponse> {
    if (this.debugMode) {
      console.log(`[DEBUG] Taking screenshot: ${label || 'untitled'}`);
    }
    return this.screenshot({ fullPage: true });
  }

  /**
   * Get current browser state for debugging
   *
   * @returns Current state
   */
  async debugState(): Promise<GetStateResponse> {
    if (this.debugMode) {
      console.log('[DEBUG] Getting browser state');
    }
    return this.getState();
  }

  // ==========================================================================
  // Element Discovery & Smart Automation
  // ==========================================================================

  /**
   * Discover all interactive elements on the current page
   *
   * @param types - Optional filter by element types
   * @returns Discover response with all elements and login fields
   */
  async discover(
    types?: Array<'input' | 'button' | 'link' | 'select' | 'checkbox' | 'radio'>
  ): Promise<any> {
    const request: Omit<{ operation: 'discover'; types?: Array<'input' | 'button' | 'link' | 'select' | 'checkbox' | 'radio'> } & Request, 'id' | 'timestamp'> = {
      operation: 'discover',
      types,
    };

    return this.sendRequest(request);
  }

  /**
   * Smart login - automatically detect login fields and login
   *
   * @param credentials - Username and password
   * @param url - Optional URL to navigate to first
   * @returns Login response
   */
  async smartLogin(
    credentials: { username: string; password: string },
    url?: string
  ): Promise<any> {
    const request: Omit<{ operation: 'smart_login'; username: string; password: string; url?: string } & Request, 'id' | 'timestamp'> = {
      operation: 'smart_login',
      username: credentials.username,
      password: credentials.password,
      url,
    };

    return this.sendRequest(request);
  }

  /**
   * Auto perform - AI-driven automation
   * Discovers elements and returns them for AI to decide next actions
   *
   * @param goal - Goal description in natural language
   * @param context - Additional context (e.g., credentials)
   * @param url - Optional URL to navigate to first
   * @returns Auto perform response with discovered elements
   */
  async autoPerform(
    goal: string,
    context?: Record<string, string>,
    url?: string
  ): Promise<any> {
    const request: Omit<{ operation: 'auto_perform'; goal: string; context?: Record<string, string>; url?: string } & Request, 'id' | 'timestamp'> = {
      operation: 'auto_perform',
      goal,
      context,
      url,
    };

    return this.sendRequest(request);
  }
}

// ============================================================================
// Exports
// ============================================================================

export default BrowserSidecarClient;


export type {
  OperationType,
  SelectorOptions,
  WaitOptions,
  Request,
  Response,
  NavigateRequest,
  ClickRequest,
  TypeRequest,
  WaitRequest,
  ScreenshotRequest,
  AuthSaveRequest,
  AuthRestoreRequest,
  GetStateRequest,
  CloseRequest,
  HoverRequest,
  FillFormRequest,
  SubmitRequest,
  NavigateResponse,
  ClickResponse,
  TypeResponse,
  ScreenshotResponse,
  AuthSaveResponse,
  AuthRestoreResponse,
  GetStateResponse,
  HoverResponse,
  FillFormResponse,
  SubmitResponse,
  BaseResponse,
  SessionData,
  BrowserState,
  ServerConfig,
} from '../types.js';

export { ErrorCode } from '../types.js';