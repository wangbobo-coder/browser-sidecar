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
  HoverRequest,
  FillFormRequest,
  SubmitRequest,
  DiscoverRequest,
  SmartLoginRequest,
  AutoPerformRequest,
  DiscoveredElement,
  LoginFields,
  SelectorOptions,
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
// Response Utility Functions
// ============================================================================

function createSuccessResponse<T>(req: BaseRequest, data?: T, startTime?: number): Response {
  return {
    id: req.id,
    success: true,
    timestamp: Date.now(),
    duration: startTime ? Date.now() - startTime : 0,
    data,
  };
}

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

function createBrowserNotConnectedResponse(req: BaseRequest): Response {
  return createErrorResponse(req, 'BROWSER_NOT_CONNECTED' as ErrorCode, 'Browser not connected');
}

// ============================================================================
// Locator Helper
// ============================================================================

import type { Page, Locator } from 'playwright';

function getLocator(page: Page, selector: SelectorOptions): Locator {
  if (selector.css) return page.locator(selector.css);
  if (selector.xpath) return page.locator(`xpath=${selector.xpath}`);
  if (selector.text) return page.getByText(selector.text);
  if (selector.role) return page.getByRole(selector.role as any);
  if (selector.testId) return page.getByTestId(selector.testId);
  if (selector.label) return page.getByLabel(selector.label);
  if (selector.placeholder) return page.getByPlaceholder(selector.placeholder);
  throw new Error('No valid selector provided');
}

async function generateSelector(_page: Page, el: any): Promise<SelectorOptions> {
  const id = await el.getAttribute('id');
  if (id) return { css: `#${id}` };
  
  const name = await el.getAttribute('name');
  if (name) return { css: `[name="${name}"]` };
  
  return { css: el.tagName.toLowerCase() };
}

// ============================================================================
// Handler Factories
// ============================================================================

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

export function createWaitHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as WaitRequest;
    const page = ctx.browserManager.getPage();
    
    if (!page) {
      return createBrowserNotConnectedResponse(req);
    }
    
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
        await locator.waitFor({ state: 'visible', timeout: 5000 });
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
            for (const [key, value] of Object.entries(storageData as Record<string, string>)) {
              (globalThis as any).localStorage?.setItem(key, value);
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

export function createHoverHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as HoverRequest;
    const page = ctx.browserManager.getPage();
    
    if (!page) {
      return createBrowserNotConnectedResponse(req);
    }
    
    try {
      const locator = getLocator(page, req.selector);
      await locator.hover();
      return createSuccessResponse(req);
    } catch (err) {
      logger.error({ err, selector: req.selector }, 'Hover failed');
      return createErrorResponse(
        req,
        'ELEMENT_NOT_FOUND' as ErrorCode,
        err instanceof Error ? err.message : 'Element not found'
      );
    }
  };
}

export function createFillFormHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as FillFormRequest;
    const page = ctx.browserManager.getPage();
    const startTime = Date.now();
    
    if (!page) {
      return createBrowserNotConnectedResponse(req);
    }
    
    try {
      let filledCount = 0;
      
      for (const field of req.fields) {
        const locator = getLocator(page, field.selector);
        await locator.fill(field.value);
        filledCount++;
      }
      
      return createSuccessResponse(req, { filledCount }, startTime);
    } catch (err) {
      logger.error({ err, fields: req.fields }, 'Fill form failed');
      return createErrorResponse(
        req,
        'ELEMENT_NOT_FOUND' as ErrorCode,
        err instanceof Error ? err.message : 'Fill form failed'
      );
    }
  };
}

export function createSubmitHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as SubmitRequest;
    const page = ctx.browserManager.getPage();
    
    if (!page) {
      return createBrowserNotConnectedResponse(req);
    }
    
    try {
      if (req.selector) {
        const locator = getLocator(page, req.selector);
        await locator.evaluate((el: Element) => {
          const form = el.closest('form');
          if (form) {
            (form as HTMLFormElement).requestSubmit();
          }
        });
      } else {
        await page.locator('form').first().evaluate((form: HTMLFormElement) => {
          form.requestSubmit();
        });
      }
      
      return createSuccessResponse(req);
    } catch (err) {
      logger.error({ err, selector: req.selector }, 'Submit failed');
      return createErrorResponse(
        req,
        'ELEMENT_NOT_FOUND' as ErrorCode,
        err instanceof Error ? err.message : 'Submit failed'
      );
    }
  };
}

// ============================================================================
// NEW: Element Discovery & Smart Automation
// ============================================================================

export function createDiscoverHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as DiscoverRequest;
    const page = ctx.browserManager.getPage();
    const startTime = Date.now();
    
    if (!page) {
      return createBrowserNotConnectedResponse(req);
    }
    
    try {
      const elements: DiscoveredElement[] = [];
      let loginFields: LoginFields | undefined;
      
      // Discover input elements
      const inputs = await page.locator('input:not([type="hidden"]):not([type="submit"])').all();
      for (const input of inputs) {
        const type = await input.getAttribute('type') || 'text';
        if (type === 'checkbox' || type === 'radio') continue;
        
        const ariaLabel = await input.getAttribute('aria-label') || '';
        const placeholder = await input.getAttribute('placeholder') || '';
        const name = await input.getAttribute('name') || '';
        const id = await input.getAttribute('id') || '';
        
        elements.push({
          type: 'input',
          label: ariaLabel || placeholder || name || id,
          selector: await generateSelector(page, input),
          name: name || undefined,
          id: id || undefined,
          inputType: type,
          visible: await input.isVisible(),
          enabled: await input.isEnabled(),
        });
      }
      
      // Discover buttons
      const buttons = await page.locator('button, input[type="submit"], input[type="button"]').all();
      for (const button of buttons) {
        const ariaLabel = await button.getAttribute('aria-label') || '';
        const textContent = await button.textContent() || '';
        const value = await button.getAttribute('value') || '';
        const name = await button.getAttribute('name') || '';
        const id = await button.getAttribute('id') || '';
        
        const labelText = ariaLabel || textContent.trim() || value;
        if (labelText) {
          elements.push({
            type: 'button',
            label: labelText,
            selector: await generateSelector(page, button),
            name: name || undefined,
            id: id || undefined,
            visible: await button.isVisible(),
            enabled: await button.isEnabled(),
          });
        }
      }
      
      // Discover links
      const links = await page.locator('a[href]').all();
      for (const link of links) {
        const ariaLabel = await link.getAttribute('aria-label') || '';
        const textContent = await link.textContent() || '';
        const id = await link.getAttribute('id') || '';
        
        const labelText = ariaLabel || textContent.trim();
        if (labelText) {
          elements.push({
            type: 'link',
            label: labelText,
            selector: await generateSelector(page, link),
            id: id || undefined,
            visible: await link.isVisible(),
            enabled: true,
          });
        }
      }
      
      // Detect login fields
      const usernameInput = await page.locator('input[name*="user"], input[name*="email"], input[id*="user"], input[id*="email"]').first();
      const passwordInput = await page.locator('input[type="password"]').first();
      const submitBtn = await page.locator('button[type="submit"], input[type="submit"]').first();
      const rememberMe = await page.locator('input[type="checkbox"][name*="remember"]').first();
      
      if (await usernameInput.count() > 0 && await passwordInput.count() > 0) {
        loginFields = {
          username: {
            type: 'input',
            label: 'Username/Email',
            selector: await generateSelector(page, usernameInput),
            visible: await usernameInput.isVisible(),
            enabled: await usernameInput.isEnabled(),
          },
          password: {
            type: 'input',
            label: 'Password',
            selector: await generateSelector(page, passwordInput),
            visible: await passwordInput.isVisible(),
            enabled: await passwordInput.isEnabled(),
          },
        };
        
        if (await submitBtn.count() > 0) {
          loginFields.submitButton = {
            type: 'button',
            label: 'Submit',
            selector: await generateSelector(page, submitBtn),
            visible: await submitBtn.isVisible(),
            enabled: await submitBtn.isEnabled(),
          };
        }
        
        if (await rememberMe.count() > 0) {
          loginFields.rememberMe = {
            type: 'checkbox',
            label: 'Remember me',
            selector: await generateSelector(page, rememberMe),
            visible: await rememberMe.isVisible(),
            enabled: await rememberMe.isEnabled(),
          };
        }
      }
      
      return createSuccessResponse(req, { elements, loginFields }, startTime);
    } catch (err) {
      logger.error({ err }, 'Discover failed');
      return createErrorResponse(
        req,
        'INTERNAL_ERROR' as ErrorCode,
        err instanceof Error ? err.message : 'Discover failed',
        startTime
      );
    }
  };
}

export function createSmartLoginHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as SmartLoginRequest;
    const page = ctx.browserManager.getPage();
    const startTime = Date.now();
    
    if (!page) {
      return createBrowserNotConnectedResponse(req);
    }
    
    try {
      if (req.url) {
        await page.goto(req.url, { waitUntil: 'networkidle' });
      }
      
      // Discover login fields
      const discoverResponse = await createDiscoverHandler(ctx)({ operation: 'discover', id: req.id, timestamp: req.timestamp } as any);
      
      if (!discoverResponse.success || !(discoverResponse as any).data?.loginFields) {
        return createErrorResponse(
          req,
          'ELEMENT_NOT_FOUND' as ErrorCode,
          'Could not find login form on page',
          startTime
        );
      }
      
      const loginFields = (discoverResponse as any).data.loginFields as LoginFields;
      
      if (loginFields.username) {
        const locator = getLocator(page, loginFields.username.selector);
        await locator.fill(req.username);
      }
      
      if (loginFields.password) {
        const locator = getLocator(page, loginFields.password.selector);
        await locator.fill(req.password);
      }
      
      if (loginFields.submitButton) {
        const locator = getLocator(page, loginFields.submitButton.selector);
        await locator.click();
        await page.waitForLoadState('networkidle');
      }
      
      return createSuccessResponse(req, {
        loggedIn: true,
        currentUrl: page.url(),
      }, startTime);
    } catch (err) {
      logger.error({ err }, 'Smart login failed');
      return createErrorResponse(
        req,
        'NAVIGATION_FAILED' as ErrorCode,
        err instanceof Error ? err.message : 'Smart login failed',
        startTime
      );
    }
  };
}

export function createAutoPerformHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as AutoPerformRequest;
    const page = ctx.browserManager.getPage();
    const startTime = Date.now();
    
    if (!page) {
      return createBrowserNotConnectedResponse(req);
    }
    
    try {
      const steps: Array<{ action: string; selector?: SelectorOptions; success: boolean; error?: string }> = [];
      
      if (req.url) {
        await page.goto(req.url, { waitUntil: 'networkidle' });
        steps.push({ action: 'navigate', success: true });
      }
      
      // Discover elements for AI to decide next action
      const discoverResponse = await createDiscoverHandler(ctx)({ operation: 'discover', id: req.id, timestamp: req.timestamp } as any);
      
      // Return discovered elements for client-side AI to process
      return createSuccessResponse(req, {
        completed: false,
        steps,
        goal: req.goal,
        elements: (discoverResponse as any).data?.elements || [],
        loginFields: (discoverResponse as any).data?.loginFields,
        message: 'Elements discovered. Use client-side AI to determine next actions based on goal: ' + req.goal,
      }, startTime);
    } catch (err) {
      logger.error({ err }, 'Auto perform failed');
      return createErrorResponse(
        req,
        'INTERNAL_ERROR' as ErrorCode,
        err instanceof Error ? err.message : 'Auto perform failed',
        startTime
      );
    }
  };
}

// ============================================================================
// Register Handlers
// ============================================================================

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
  server.registerHandler('hover', createHoverHandler(ctx));
  server.registerHandler('fill_form', createFillFormHandler(ctx));
  server.registerHandler('submit', createSubmitHandler(ctx));
  server.registerHandler('discover', createDiscoverHandler(ctx));
  server.registerHandler('smart_login', createSmartLoginHandler(ctx));
  server.registerHandler('auto_perform', createAutoPerformHandler(ctx));
  
  logger.info('All handlers registered');
}
