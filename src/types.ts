/**
 * Core types for the browser-sidecar MCP Server
 * 
 * This module defines all core types used throughout the application.
 * The server uses direct TCP/Unix Socket communication (NOT MCP protocol).
 */

// ============================================================================
// Operation Types
// ============================================================================

/**
 * Supported browser operations
 */
export type OperationType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'select'
  | 'wait'
  | 'screenshot'
  | 'auth_save'
  | 'auth_restore'
  | 'close'
  | 'get_state';

/**
 * Wait strategy options for SPA and dynamic content
 */
export interface WaitOptions {
  /** Wait for network to be idle */
  networkIdle?: boolean;
  /** Wait for specific selector */
  selector?: string;
  /** Wait for DOM content loaded */
  domContentLoaded?: boolean;
  /** Wait for load event */
  load?: boolean;
  /** Custom timeout in milliseconds */
  timeout?: number;
  /** Wait for function to return truthy value */
  function?: string;
  /** Wait for element to be visible */
  visible?: boolean;
  /** Wait for element to be enabled */
  enabled?: boolean;
  /** Wait for element to be clickable (visible and enabled) */
  clickable?: boolean;
}

/**
 * Element selector options
 */
export interface SelectorOptions {
  /** CSS selector */
  css?: string;
  /** XPath selector */
  xpath?: string;
  /** Text content to match */
  text?: string;
  /** Role-based selector */
  role?: string;
  /** Test ID selector */
  testId?: string;
  /** Label text */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Wait options for element to appear */
  wait?: WaitOptions;
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Base request structure for all operations
 */
export interface BaseRequest {
  /** Unique request ID for tracking */
  id: string;
  /** Operation type */
  operation: OperationType;
  /** Request timestamp */
  timestamp: number;
}

/**
 * Navigate request
 */
export interface NavigateRequest extends BaseRequest {
  operation: 'navigate';
  /** URL to navigate to */
  url: string;
  /** Wait options after navigation */
  wait?: WaitOptions;
}

/**
 * Click request
 */
export interface ClickRequest extends BaseRequest {
  operation: 'click';
  /** Element selector */
  selector: SelectorOptions;
  /** Click options */
  options?: {
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
    delay?: number;
    force?: boolean;
  };
}

/**
 * Type request
 */
export interface TypeRequest extends BaseRequest {
  operation: 'type';
  /** Element selector */
  selector: SelectorOptions;
  /** Text to type */
  text: string;
  /** Type options */
  options?: {
    delay?: number;
    noWaitAfter?: boolean;
  };
}

/**
 * Wait request
 */
export interface WaitRequest extends BaseRequest {
  operation: 'wait';
  /** Wait options */
  wait: WaitOptions;
}

/**
 * Screenshot request
 */
export interface ScreenshotRequest extends BaseRequest {
  operation: 'screenshot';
  /** Full page screenshot */
  fullPage?: boolean;
  /** Selector for element screenshot */
  selector?: SelectorOptions;
  /** Image type */
  type?: 'png' | 'jpeg';
}

/**
 * Auth save request
 */
export interface AuthSaveRequest extends BaseRequest {
  operation: 'auth_save';
  /** Profile name for saved session */
  profileName: string;
  /** Domain to save cookies for */
  domain?: string;
}

/**
 * Auth restore request
 */
export interface AuthRestoreRequest extends BaseRequest {
  operation: 'auth_restore';
  /** Profile name to restore */
  profileName: string;
}

/**
 * Get state request
 */
export interface GetStateRequest extends BaseRequest {
  operation: 'get_state';
}

/**
 * Close request
 */
export interface CloseRequest extends BaseRequest {
  operation: 'close';
}

/**
 * Union type of all request types
 */
export type Request =
  | NavigateRequest
  | ClickRequest
  | TypeRequest
  | WaitRequest
  | ScreenshotRequest
  | AuthSaveRequest
  | AuthRestoreRequest
  | GetStateRequest
  | CloseRequest;

// ============================================================================
// Response Types
// ============================================================================

/**
 * Base response structure
 */
export interface BaseResponse {
  /** Request ID this response corresponds to */
  id: string;
  /** Success status */
  success: boolean;
  /** Response timestamp */
  timestamp: number;
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Success response with data
 */
export interface SuccessResponse<T = unknown> extends BaseResponse {
  success: true;
  /** Response data */
  data: T;
}

/**
 * Error response
 */
export interface ErrorResponse extends BaseResponse {
  success: false;
  /** Error information */
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Navigate response
 */
export interface NavigateResponse extends BaseResponse {
  success: boolean;
  data?: {
    url: string;
    title: string;
  };
}

/**
 * Click response
 */
export interface ClickResponse extends BaseResponse {
  success: boolean;
}

/**
 * Type response
 */
export interface TypeResponse extends BaseResponse {
  success: boolean;
}

/**
 * Screenshot response
 */
export interface ScreenshotResponse extends BaseResponse {
  success: boolean;
  data?: {
    base64: string;
    type: 'png' | 'jpeg';
  };
}

/**
 * Auth save response
 */
export interface AuthSaveResponse extends BaseResponse {
  success: boolean;
  data?: {
    profileName: string;
    cookiesCount: number;
  };
}

/**
 * Auth restore response
 */
export interface AuthRestoreResponse extends BaseResponse {
  success: boolean;
  data?: {
    profileName: string;
    restored: boolean;
  };
}

/**
 * Get state response
 */
export interface GetStateResponse extends BaseResponse {
  success: boolean;
  data?: {
    url: string;
    title: string;
    cookies: number;
    isConnected: boolean;
  };
}

/**
 * Union type of all response types
 */
export type Response =
  | SuccessResponse
  | ErrorResponse
  | NavigateResponse
  | ClickResponse
  | TypeResponse
  | ScreenshotResponse
  | AuthSaveResponse
  | AuthRestoreResponse
  | GetStateResponse;

// ============================================================================
// Session Types
// ============================================================================

/**
 * Browser session data
 */
export interface SessionData {
  /** Session ID */
  id: string;
  /** Profile name */
  profileName: string;
  /** Domain for this session */
  domain: string;
  /** Encrypted cookies */
  cookies: string;
  /** Encrypted localStorage */
  localStorage?: string;
  /** Session creation timestamp */
  createdAt: number;
  /** Session expiration timestamp */
  expiresAt: number;
  /** Session metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Browser state
 */
export interface BrowserState {
  /** Current URL */
  url: string;
  /** Page title */
  title: string;
  /** Browser is connected */
  isConnected: boolean;
  /** Number of cookies */
  cookiesCount: number;
  /** Current session profile (if any) */
  currentProfile?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Server configuration
 */
export interface ServerConfig {
  /** TCP port to listen on */
  port: number;
  /** Health check endpoint port (optional) */
  healthPort?: number; // 健康检查端点端口，默认 8080
  /** Unix socket path (alternative to port) */
  socketPath?: string;
  /** Session storage directory */
  sessionStoragePath: string;
  /** Encryption key for sessions (from env) */
  encryptionKey?: string;
  /** Browser headless mode */
  headless: boolean;
  /** Default navigation timeout */
  defaultTimeout: number;
  /** Log level */
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** Monitor sampling interval in milliseconds (optional, defaults to 1000) */
  monitorIntervalMs?: number;
  /** Monitor history limit (optional, defaults to 60) */
  monitorHistoryLimit?: number;
}

/**
 * Default server configuration
 */
export const DEFAULT_CONFIG: ServerConfig = {
  port: 3001,
  sessionStoragePath: '/shared/sessions',
  headless: true,
  defaultTimeout: 30000,
  logLevel: 'info',
  monitorIntervalMs: 1000,
  monitorHistoryLimit: 60,
};

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes used in responses
 */
export enum ErrorCode {
  // Client errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNKNOWN_OPERATION = 'UNKNOWN_OPERATION',
  MISSING_PARAMETER = 'MISSING_PARAMETER',
  
  // Browser errors
  BROWSER_NOT_CONNECTED = 'BROWSER_NOT_CONNECTED',
  NAVIGATION_FAILED = 'NAVIGATION_FAILED',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  ELEMENT_NOT_VISIBLE = 'ELEMENT_NOT_VISIBLE',
  TIMEOUT = 'TIMEOUT',
  
  // Session errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_SAVE_FAILED = 'SESSION_SAVE_FAILED',
  SESSION_RESTORE_FAILED = 'SESSION_RESTORE_FAILED',
  
  // System errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
}
