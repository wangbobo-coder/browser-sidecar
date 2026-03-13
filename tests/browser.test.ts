/**
 * Unit tests for BrowserManager
 */

import { BrowserManager, createBrowserManager } from '../src/browser/index.js';
import { ServerConfig, DEFAULT_CONFIG } from '../src/types.js';

// Mock playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      isConnected: jest.fn().mockReturnValue(true),
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          url: jest.fn().mockReturnValue('about:blank'),
          title: jest.fn().mockResolvedValue('Blank Page'),
          setDefaultTimeout: jest.fn(),
          goto: jest.fn().mockResolvedValue(undefined),
          close: jest.fn().mockResolvedValue(undefined),
        }),
        cookies: jest.fn().mockResolvedValue([]),
        close: jest.fn().mockResolvedValue(undefined),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('BrowserManager', () => {
  let browserManager: BrowserManager;
  let config: ServerConfig;

  beforeEach(() => {
    config = {
      ...DEFAULT_CONFIG,
      headless: true,
      defaultTimeout: 30000,
    };
    browserManager = createBrowserManager(config);
  });

  describe('createBrowserManager', () => {
    it('should create a BrowserManager instance', () => {
      expect(browserManager).toBeDefined();
      expect(browserManager.isConnected()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize browser successfully', async () => {
      await browserManager.initialize();
      expect(browserManager.isConnected()).toBe(true);
    });
  });

  describe('close', () => {
    it('should close browser without error', async () => {
      await browserManager.initialize();
      await browserManager.close();
      expect(browserManager.isConnected()).toBe(false);
    });
  });

  describe('getState', () => {
    it('should return empty state when not initialized', async () => {
      const state = await browserManager.getState();
      expect(state.isConnected).toBe(false);
      expect(state.url).toBe('');
      expect(state.title).toBe('');
    });
  });

  describe('navigate', () => {
    it('should throw error when browser not initialized', async () => {
      await expect(browserManager.navigate('https://example.com')).rejects.toThrow('Browser not initialized');
    });
  });
});