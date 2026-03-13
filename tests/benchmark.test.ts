/**
 * Benchmark Test: Login Flow Performance
 *
 * This test uses the same setup and mocks as tests/integration.test.ts
 * but focuses on measuring the duration of the complete login flow.
 *
 * The test is skipped by default to avoid slowing down the main test suite.
 */

import { createServer } from '../src/server.js';
import { createBrowserManager } from '../src/browser/index.js';
import { createSessionManager } from '../src/session/index.js';
import { registerHandlers } from '../src/handlers/index.js';
import type { ServerConfig } from '../src/types.js';

// Mock playwright for integration test (copied from tests/integration.test.ts)
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      isConnected: jest.fn().mockReturnValue(true),
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          url: jest.fn().mockReturnValue('https://example.com/dashboard'),
          title: jest.fn().mockResolvedValue('Dashboard'),
          setDefaultTimeout: jest.fn(),
          goto: jest.fn().mockResolvedValue(undefined),
          waitForSelector: jest.fn().mockResolvedValue(undefined),
          close: jest.fn().mockResolvedValue(undefined),
        }),
        cookies: jest.fn().mockResolvedValue([
          { name: 'session', value: 'abc123', domain: 'example.com', path: '/' },
        ]),
        addCookies: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        pages: jest.fn().mockReturnValue([{}]),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Reuse the same configuration shape as the integration tests
const config: ServerConfig = {
  port: 3002, // Use a distinct port for tests
  sessionStoragePath: '/tmp/test-sessions',
  headless: true,
  defaultTimeout: 30000,
  logLevel: 'error',
};

describe('Login Flow Performance Benchmark', () => {
  let server: ReturnType<typeof createServer>;
  let browserManager: ReturnType<typeof createBrowserManager>;
  let sessionManager: ReturnType<typeof createSessionManager>;

  beforeAll(async () => {
    // Initialize components
    browserManager = createBrowserManager(config);
    sessionManager = createSessionManager(config);
    server = createServer(config);
    // Initialize browser
    await browserManager.initialize();
    // Initialize session storage
    await sessionManager.initialize();
    // Register handlers
    registerHandlers(server, {
      browserManager,
      sessionManager,
    });
  });

  afterAll(async () => {
    // Teardown
    await browserManager.close();
  });

  // Benchmark test: run by default
  test('complete login flow and measure duration', async () => {
    // Start timer for the entire login flow
    console.time('login-flow');

    // Step 1: Navigate to login page (via stored state)
    const state1 = await browserManager.getState();
    expect(state1.isConnected).toBe(true);

    // Step 2: Simulate successful login (mock returns dashboard URL)
    const state2 = await browserManager.getState();
    expect(state2.url).toBe('https://example.com/dashboard');

    // Step 3: Save session
    const context = browserManager.getContext();
    if (context) {
      const cookies = await context.cookies();
      await sessionManager.saveSession('test-user', cookies, undefined, 'example.com');
    }

    // Step 4: Verify session saved
    const exists = await sessionManager.sessionExists('test-user');
    expect(exists).toBe(true);

    // Step 5: Restore session
    const { cookies } = await sessionManager.restoreSession('test-user');
    expect(cookies).toBeDefined();
    if (cookies?.length) {
      expect(cookies[0]?.name).toBe('session');
    }

    // End timer and log duration
    console.timeEnd('login-flow');
  });
});
