/**
 * Integration Test: End-to-End Login Flow
 * 
 * This test demonstrates a complete login flow using the browser-sidecar.
 * It uses mock server and client to simulate the integration.
 */

import { createServer } from '../src/server.js';
import { createBrowserManager } from '../src/browser/index.js';
import { createSessionManager } from '../src/session/index.js';
import { registerHandlers } from '../src/handlers/index.js';
import type { ServerConfig } from '../src/types.js';

// Mock playwright for integration test
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

// Mock crypto for deterministic encryption in tests (match session.test.ts)
jest.mock('crypto', () => {
  // In-memory queue of plaintext payloads to simulate AES-GCM round-trips
  const plaintextQueue: string[] = [];
  // Expose a reset helper to clear the queue between tests
  (globalThis as any).resetCryptoPlaintextQueue = () => {
    plaintextQueue.length = 0;
  };
  // Also make the reset function available on the mock export for direct access if needed
  const resetPlaintextQueue = () => {
    plaintextQueue.length = 0;
  };
  return {
    createHash: () => ({
      update: () => ({
        digest: () => Buffer.from('fixed-key-for-testing', 'hex'),
      }),
    }),
    randomBytes: (size: number) => Buffer.alloc(size, 0xab), // Fixed IV
    randomUUID: () => 'fixed-uuid-for-testing',
    createCipheriv: (_algorithm: string, _key: Buffer, _iv: Buffer) => ({
      update: (data: any) => {
        // Capture plaintext for two sequential encryptions (cookies, then localStorage)
        const text = typeof data === 'string' ? data : data?.toString('utf8') ?? '';
        plaintextQueue.push(text);
        // Return empty cipher text to mimic AES behavior in tests
        return Buffer.alloc(0);
      },
      final: () => Buffer.alloc(0),
      getAuthTag: () => Buffer.from('auth-tag'),
    }),
    createDecipheriv: (_algorithm: string, _key: Buffer, _iv: Buffer) => ({
      setAuthTag: () => undefined,
      update: (_data: any) => {
        // Return the next plaintext payload from the queue, simulating decryption
        const next = plaintextQueue.shift() ?? '';
        return Buffer.from(next, 'utf8');
      },
      final: () => Buffer.alloc(0),
    }),
    // Optional: expose a callable to reset without reaching into global
    resetPlaintextQueue,
  };
});

describe('End-to-End Login Flow', () => {
  let server: ReturnType<typeof createServer>;
  let browserManager: ReturnType<typeof createBrowserManager>;
  let sessionManager: ReturnType<typeof createSessionManager>;

  const config: ServerConfig = {
    port: 3002, // Use different port for testing
    sessionStoragePath: '/tmp/test-sessions-integration',
    headless: true,
    defaultTimeout: 30000,
    logLevel: 'error',
  };

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
    await browserManager.close();
  });

  describe('Login Flow Integration', () => {
    it('should complete full login flow', async () => {
      // Step 1: Navigate to login page
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

      // Step 4: Verify session was saved
      const exists = await sessionManager.sessionExists('test-user');
      expect(exists).toBe(true);

      // Step 5: Restore session
      const { cookies } = await sessionManager.restoreSession('test-user');
      expect(cookies).toHaveLength(1);
expect(cookies[0]?.name).toBe('session');
    });

    it('should handle session persistence', async () => {
      // Save a session
      const context = browserManager.getContext();
      if (context) {
        const cookies = await context.cookies();
        await sessionManager.saveSession('persist-test', cookies);
      }

      // Verify it exists
      const exists = await sessionManager.sessionExists('persist-test');
      expect(exists).toBe(true);

      // Restore it
      const { cookies } = await sessionManager.restoreSession('persist-test');
      expect(cookies).toBeDefined();
    });

    it('should handle missing session gracefully', async () => {
      await expect(
        sessionManager.restoreSession('non-existent-session')
      ).rejects.toThrow();
    });
  });

  describe('Browser State Management', () => {
    it('should track browser connection state', async () => {
      expect(browserManager.isConnected()).toBe(true);
    });

    it('should return current browser state', async () => {
      const state = await browserManager.getState();
      expect(state).toHaveProperty('url');
      expect(state).toHaveProperty('title');
      expect(state).toHaveProperty('isConnected');
      expect(state).toHaveProperty('cookiesCount');
    });
  });
});
