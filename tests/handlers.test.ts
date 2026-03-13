/**
 * Unit tests for handler functions
 */
import {
  createNavigateHandler,
  createClickHandler,
  createTypeHandler,
  createWaitHandler,
  createGetStateHandler,
} from '../src/handlers/index.js';
import type { BrowserManager } from '../src/browser/index.js';
import type { SessionManager } from '../src/session/index.js';
import type { Request } from '../src/types.js';

// Mock BrowserManager
const createMockBrowserManager = (): jest.Mocked<BrowserManager> => ({
  initialize: jest.fn(),
  close: jest.fn(),
  getState: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  getPage: jest.fn(),
  getContext: jest.fn(),
  navigate: jest.fn(),
} as unknown as jest.Mocked<BrowserManager>);

// Mock SessionManager
const createMockSessionManager = (): jest.Mocked<SessionManager> => ({
  initialize: jest.fn(),
  saveSession: jest.fn(),
  restoreSession: jest.fn(),
  sessionExists: jest.fn(),
  deleteSession: jest.fn(),
} as unknown as jest.Mocked<SessionManager>);

describe('Handlers', () => {
  let mockBrowserManager: jest.Mocked<BrowserManager>;
  let mockSessionManager: jest.Mocked<SessionManager>;

  beforeEach(() => {
    mockBrowserManager = createMockBrowserManager();
    mockSessionManager = createMockSessionManager();
  });

  describe('createNavigateHandler', () => {
    it('should navigate to URL successfully', async () => {
      mockBrowserManager.navigate.mockResolvedValue({
        url: 'https://example.com',
        title: 'Example Domain',
      });

      const handler = createNavigateHandler({
        browserManager: mockBrowserManager,
        sessionManager: mockSessionManager,
      });

      const request = {
        id: 'test-1',
        operation: 'navigate' as const,
        url: 'https://example.com',
        timestamp: Date.now(),
      };

      const response = await handler(request as Request);

      expect(response.success).toBe(true);
      if (response.success) {
        const data = (response as any).data;
        expect(data).toEqual({
          url: 'https://example.com',
          title: 'Example Domain',
        });
      }
      expect(mockBrowserManager.navigate).toHaveBeenCalledWith('https://example.com', undefined);
    });

    it('should handle navigation with wait options', async () => {
      mockBrowserManager.navigate.mockResolvedValue({
        url: 'https://example.com',
        title: 'Example Domain',
      });

      const handler = createNavigateHandler({
        browserManager: mockBrowserManager,
        sessionManager: mockSessionManager,
      });

      const request = {
        id: 'test-2',
        operation: 'navigate' as const,
        url: 'https://example.com',
        wait: { networkIdle: true },
        timestamp: Date.now(),
      };

      const response = await handler(request as Request);

      expect(response.success).toBe(true);
      // Data assertion is not strictly needed here
      expect(mockBrowserManager.navigate).toHaveBeenCalledWith('https://example.com', { networkIdle: true });
    });

    it('should handle navigation failure', async () => {
      mockBrowserManager.navigate.mockRejectedValue(new Error('Network error'));

      const handler = createNavigateHandler({
        browserManager: mockBrowserManager,
        sessionManager: mockSessionManager,
      });

      const request = {
        id: 'test-3',
        operation: 'navigate' as const,
        url: 'https://invalid-url',
        timestamp: Date.now(),
      };

      const response = await handler(request as Request);

      expect(response.success).toBe(false);
      expect((response as any).error?.code).toBe('NAVIGATION_FAILED');
      expect((response as any).error?.message).toBe('Network error');
    });
  });

  describe('createClickHandler', () => {
    it('should return error when browser not connected', async () => {
      mockBrowserManager.getPage.mockReturnValue(null);

      const handler = createClickHandler({
        browserManager: mockBrowserManager,
        sessionManager: mockSessionManager,
      });

      const request = {
        id: 'test-4',
        operation: 'click' as const,
        selector: { css: '#button' },
        timestamp: Date.now(),
      };

      const response = await handler(request as Request);

      expect(response.success).toBe(false);
      expect((response as any).error?.code).toBe('BROWSER_NOT_CONNECTED');
    });
  });

  describe('createTypeHandler', () => {
    it('should return error when browser not connected', async () => {
      mockBrowserManager.getPage.mockReturnValue(null);

      const handler = createTypeHandler({
        browserManager: mockBrowserManager,
        sessionManager: mockSessionManager,
      });

      const request = {
        id: 'test-5',
        operation: 'type' as const,
        selector: { css: '#input' },
        text: 'hello',
        timestamp: Date.now(),
      };

      const response = await handler(request as Request);

      expect(response.success).toBe(false);
      expect((response as any).error?.code).toBe('BROWSER_NOT_CONNECTED');
    });
  });

  describe('createWaitHandler', () => {
    it('should return error when browser not connected', async () => {
      mockBrowserManager.getPage.mockReturnValue(null);

      const handler = createWaitHandler({
        browserManager: mockBrowserManager,
        sessionManager: mockSessionManager,
      });

      const request = {
        id: 'test-6',
        operation: 'wait' as const,
        wait: { selector: '#element' },
        timestamp: Date.now(),
      };

      const response = await handler(request as Request);

      expect(response.success).toBe(false);
      expect((response as any).error?.code).toBe('BROWSER_NOT_CONNECTED');
    });
  });

  describe('createGetStateHandler', () => {
    it('should return browser state successfully', async () => {
      mockBrowserManager.getState.mockResolvedValue({
        url: 'https://example.com',
        title: 'Example',
        isConnected: true,
        cookiesCount: 5,
      });

      const handler = createGetStateHandler({
        browserManager: mockBrowserManager,
        sessionManager: mockSessionManager,
      });

      const request = {
        id: 'test-7',
        operation: 'get_state' as const,
        timestamp: Date.now(),
      };

      const response = await handler(request as Request);

      expect(response.success).toBe(true);
      if (response.success) {
        const data = (response as any).data;
        expect(data).toEqual({
          url: 'https://example.com',
          title: 'Example',
          cookies: 5,
          isConnected: true,
        });
      }
    });
  });
});
