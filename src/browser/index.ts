/**
 * Browser Manager
 * 
 * Manages Playwright browser instance lifecycle.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import pino from 'pino';
import type { ServerConfig, BrowserState, WaitOptions } from '../types.js';

const logger = pino({ name: 'browser-manager' });

/**
 * Browser Manager class
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  /**
   * Initialize browser instance
   */
  async initialize(): Promise<void> {
    logger.info('Initializing browser...');

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.defaultTimeout);

    logger.info('Browser initialized successfully');
  }

  /**
   * Close browser instance
   */
  async close(): Promise<void> {
    logger.info('Closing browser...');

    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    logger.info('Browser closed');
  }

  /**
   * Get current browser state
   */
  async getState(): Promise<BrowserState> {
    if (!this.page || !this.context) {
      return {
        url: '',
        title: '',
        isConnected: false,
        cookiesCount: 0,
      };
    }

    const cookies = await this.context.cookies();
    return {
      url: this.page.url(),
      title: await this.page.title(),
      isConnected: this.browser?.isConnected() ?? false,
      cookiesCount: cookies.length,
    };
  }

  /**
   * Check if browser is connected
   */
  isConnected(): boolean {
    return this.browser?.isConnected() ?? false;
  }

  /**
   * Get current page
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * Get browser context
   */
  getContext(): BrowserContext | null {
    return this.context;
  }

  /**
   * Navigate to URL
   */
  async navigate(url: string, wait?: WaitOptions): Promise<{ url: string; title: string }> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    await this.page.goto(url, {
      waitUntil: this.getWaitUntil(wait),
      timeout: wait?.timeout ?? this.config.defaultTimeout,
    });

    // Apply additional wait strategies
    if (wait?.selector) {
      await this.page.waitForSelector(wait.selector, { timeout: wait.timeout });
    }

    if (wait?.function) {
      await this.page.waitForFunction(wait.function, { timeout: wait.timeout });
    }

    return {
      url: this.page.url(),
      title: await this.page.title(),
    };
  }

  /**
   * Get Playwright waitUntil value from WaitOptions
   */
  private getWaitUntil(wait?: WaitOptions): 'load' | 'domcontentloaded' | 'networkidle' {
    if (wait?.networkIdle) return 'networkidle';
    if (wait?.domContentLoaded) return 'domcontentloaded';
    return 'load';
  }
}

/**
 * Create browser manager instance
 */
export function createBrowserManager(config: ServerConfig): BrowserManager {
  return new BrowserManager(config);
}