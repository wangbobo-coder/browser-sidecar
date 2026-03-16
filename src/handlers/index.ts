/**
 * Operation Handlers
 * 
 * Handles all browser operations.
 */

import type { BrowserManager } from '../browser/index.js';
import type { SessionManager } from '../session/index.js';
import type {
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
  ErrorCode,
  BaseRequest,
} from '../types.js';
import pino from 'pino';

const logger = pino({ name: 'handlers' });

/**
 * Handler context
 */
export interface HandlerContext {
  browserManager: BrowserManager;
  sessionManager: SessionManager;
}

// ============================================================================
// Response Utility Functions - Reduces code duplication
// ============================================================================

/**
 * Create a success response
 */
function createSuccessResponse<T>(req: BaseRequest, data?: T, startTime?: number): Response {
  return {
    id: req.id,
    success: true,
    timestamp: Date.now(),
    duration: startTime ? Date.now() - startTime : 0,
    data,
  };
}

/**
 * Create an error response
 */
function createErrorResponse(
  req: BaseRequest,
  code: ErrorCode,
  message: string,
  startTime?: number
): Response {
  return {
    id: req.id,
    success: false,
    timestamp: Date.now(),
    duration: startTime ? Date.now() - startTime : 0,
    error: { code, message },
  };
}

/**
 * Create a browser not connected response
 */
function createBrowserNotConnectedResponse(req: BaseRequest): Response {
  return createErrorResponse(req, 'BROWSER_NOT_CONNECTED' as ErrorCode, 'Browser not connected');
}

/**
 * Create navigate handler
 */
export function createNavigateHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as NavigateRequest;
    const startTime = Date.now();
    
    try {
      const result = await ctx.browserManager.navigate(req.url, req.wait);
      return createSuccessResponse(req, result, startTime);
    } catch (err) {
      logger.error({ err, url: req.url }, 'Navigate failed');
      return createErrorResponse(
        req,
        'NAVIGATION_FAILED' as ErrorCode,
        err instanceof Error ? err.message : 'Navigation failed',
        startTime
      );
    }
  };
}

/**
 * Create click handler
 */
export function createClickHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as ClickRequest;
    const page = ctx.browserManager.getPage();
    
    if (!page) {
      return createBrowserNotConnectedResponse(req);
    }
    
    try {
      const locator = getLocator(page, req.selector);
      await locator.click(req.options);
      
      return createSuccessResponse(req);
    } catch (err) {
      logger.error({ err, selector: req.selector }, 'Click failed');
      return createErrorResponse(
        req,
        'ELEMENT_NOT_FOUND' as ErrorCode,
        err instanceof Error ? err.message : 'Element not found'
      );
    }
  };
}

/**
 * Create type handler
 */
export function createTypeHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as TypeRequest;
    const page = ctx.browserManager.getPage();
    
    if (!page) {
      return createBrowserNotConnectedResponse(req);
    }
    
    try {
      const locator = getLocator(page, req.selector);
      await locator.fill(req.text);
      
      return createSuccessResponse(req);
    } catch (err) {
      logger.error({ err, selector: req.selector }, 'Type failed');
      return createErrorResponse(
        req,
        'ELEMENT_NOT_FOUND' as ErrorCode,
        err instanceof Error ? err.message : 'Element not found'
      );
    }
  };
}

/**
 * Create wait handler
 */
export function createWaitHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as WaitRequest;
    const page = ctx.browserManager.getPage();
    
    if (!page) {
      return createBrowserNotConnectedResponse(req);
    }
    
    const _waitForVisible = async (page: Page, selector: string, timeout: number): Promise<void> => {
      await page.waitForFunction(
        (sel: string) => {
          const element = document.querySelector(sel);
          return element ? (element as HTMLElement).offsetWidth > 0 && (element as HTMLElement).offsetHeight > 0 : false;
        },
        selector,
        { timeout }
      );
    };
    const _waitForEnabled = async (page: Page, selector: string, timeout: number): Promise<void> => {
      await page.waitForFunction(
        (sel: string) => {
          const element = document.querySelector(sel);
          return element ? !element.hasAttribute('disabled') : false;
        },
        selector,
        { timeout }
      );
    };
    
    try {
      if (req.wait.selector) {
        await page.waitForSelector(req.wait.selector, { timeout: req.wait.timeout });
      } else if (req.wait.function) {
        await page.waitForFunction(req.wait.function, { timeout: req.wait.timeout });
      } else if (req.wait.networkIdle) {
        await page.waitForLoadState('networkidle', { timeout: req.wait.timeout });
      } else if (req.wait.load) {
        await page.waitForLoadState('load', { timeout: req.wait.timeout });
      } else if (req.wait.domContentLoaded) {
        await page.waitForLoadState('domcontentloaded', { timeout: req.wait.timeout });
      }
      // Element state checks - now properly typed via WaitOptions
      else if (req.wait.visible) {
        await _waitForVisible(page, req.wait.selector ?? '', req.wait.timeout ?? 5000);
      } else if (req.wait.enabled) {
        await _waitForEnabled(page, req.wait.selector ?? '', req.wait.timeout ?? 5000);
      } else if (req.wait.clickable) {
        const sel = req.wait.selector ?? '';
        const to = req.wait.timeout ?? 5000;
        await _waitForVisible(page, sel, to);
        await _waitForEnabled(page, sel, to);
      }
      
      return createSuccessResponse(req);
    } catch (err) {
      logger.error({ err, wait: req.wait }, 'Wait failed');
      return createErrorResponse(
        req,
        'TIMEOUT' as ErrorCode,
        err instanceof Error ? err.message : 'Wait timeout'
      );
    }
  };
}

/**
 * Create screenshot handler
 */
export function createScreenshotHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as ScreenshotRequest;
    const page = ctx.browserManager.getPage();
    const startTime = Date.now();
    
    if (!page) {
      return createBrowserNotConnectedResponse(req);
    }
    
    try {
      let screenshot: Buffer;
      
      if (req.selector) {
        const locator = getLocator(page, req.selector);
        // Ensure the element is attached and visible before taking a screenshot
        try {
          await locator.waitFor({ state: 'visible', timeout: 5000 });
        } catch (e) {
          // If element is not visible in time, fall back to attempting screenshot anyway
        }
        screenshot = await locator.screenshot({ type: req.type ?? 'png' });
      } else {
        screenshot = await page.screenshot({
          fullPage: req.fullPage ?? false,
          type: req.type ?? 'png',
        });
      }
      
      return createSuccessResponse(req, {
        base64: screenshot.toString('base64'),
        type: req.type ?? 'png',
      }, startTime);
    } catch (err) {
      logger.error({ err }, 'Screenshot failed');
      return createErrorResponse(
        req,
        'INTERNAL_ERROR' as ErrorCode,
        err instanceof Error ? err.message : 'Screenshot failed',
        startTime
      );
    }
  };
}

/**
 * Create auth save handler
 */
export function createAuthSaveHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as AuthSaveRequest;
    const context = ctx.browserManager.getContext();
    const startTime = Date.now();
    
    if (!context) {
      return createBrowserNotConnectedResponse(req);
    }
    
    try {
      const cookies = await context.cookies();
      const domain = req.domain ?? new URL(context.pages()[0]?.url() ?? 'https://example.com').hostname;
      
      await ctx.sessionManager.saveSession(req.profileName, cookies, undefined, domain);
      
      return createSuccessResponse(req, {
        profileName: req.profileName,
        cookiesCount: cookies.length,
      }, startTime);
    } catch (err) {
      logger.error({ err, profileName: req.profileName }, 'Auth save failed');
      return createErrorResponse(
        req,
        'SESSION_SAVE_FAILED' as ErrorCode,
        err instanceof Error ? err.message : 'Failed to save session',
        startTime
      );
    }
  };
}

/**
 * Create auth restore handler
 */
export function createAuthRestoreHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as AuthRestoreRequest;
    const context = ctx.browserManager.getContext();
    const startTime = Date.now();
    
    if (!context) {
      return createBrowserNotConnectedResponse(req);
    }
    
    try {
      const { cookies, localStorage } = await ctx.sessionManager.restoreSession(req.profileName);
      
      await context.addCookies(cookies);
      
      if (localStorage && context.pages().length > 0) {
        const page = context.pages()[0];
        if (page) {
await page.evaluate((storageData) => {
  // @ts-ignore - running in browser context
  for (const [key, value] of Object.entries(storageData)) {
    // Use globalThis to avoid shadowing browser's localStorage and ensure safe access
    // @ts-ignore - running in browser context
    globalThis.localStorage.setItem(key, value);
  }
}, localStorage as unknown as Record<string, string>);
        }
      }
      
      return createSuccessResponse(req, {
        profileName: req.profileName,
        restored: true,
      }, startTime);
    } catch (err) {
      logger.error({ err, profileName: req.profileName }, 'Auth restore failed');
      return createErrorResponse(
        req,
        'SESSION_RESTORE_FAILED' as ErrorCode,
        err instanceof Error ? err.message : 'Failed to restore session',
        startTime
      );
    }
  };
}

/**
 * Create get state handler
 */
export function createGetStateHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as GetStateRequest;
    const startTime = Date.now();
    
    try {
      const state = await ctx.browserManager.getState();
      
      return createSuccessResponse(req, {
        url: state.url,
        title: state.title,
        cookies: state.cookiesCount,
        isConnected: state.isConnected,
      }, startTime);
    } catch (err) {
      logger.error({ err }, 'Get state failed');
      return createErrorResponse(
        req,
        'INTERNAL_ERROR' as ErrorCode,
        err instanceof Error ? err.message : 'Failed to get state',
        startTime
      );
    }
  };
}

/**
 * Create close handler
 */
export function createCloseHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as CloseRequest;
    const startTime = Date.now();
    
    try {
      await ctx.browserManager.close();
      
      return createSuccessResponse(req, undefined, startTime);
    } catch (err) {
      logger.error({ err }, 'Close failed');
      return createErrorResponse(
        req,
        'INTERNAL_ERROR' as ErrorCode,
        err instanceof Error ? err.message : 'Failed to close browser',
        startTime
      );
    }
  };
}

/**
 * Get Playwright locator from selector options
 */
import type { Page, Locator } from 'playwright';

function getLocator(page: Page, selector: { css?: string; xpath?: string; text?: string; role?: string; testId?: string; label?: string; placeholder?: string }): Locator {
  if (selector.css) return page.locator(selector.css);
  if (selector.xpath) return page.locator(`xpath=${selector.xpath}`);
  if (selector.text) return page.getByText(selector.text);
  if (selector.role) return page.getByRole(selector.role as any);
  if (selector.testId) return page.getByTestId(selector.testId);
  if (selector.label) return page.getByLabel(selector.label);
  if (selector.placeholder) return page.getByPlaceholder(selector.placeholder);
  
  throw new Error('No valid selector provided');
}

/**
 * Register all handlers
 */
export function registerHandlers(
  server: { registerHandler: (operation: string, handler: any) => void },
  ctx: HandlerContext
): void {
  server.registerHandler('navigate', createNavigateHandler(ctx));
  server.registerHandler('click', createClickHandler(ctx));
  server.registerHandler('type', createTypeHandler(ctx));
  server.registerHandler('wait', createWaitHandler(ctx));
  server.registerHandler('screenshot', createScreenshotHandler(ctx));
  server.registerHandler('auth_save', createAuthSaveHandler(ctx));
  server.registerHandler('auth_restore', createAuthRestoreHandler(ctx));
  server.registerHandler('get_state', createGetStateHandler(ctx));
  server.registerHandler('close', createCloseHandler(ctx));
  
  logger.info('All handlers registered');
}
