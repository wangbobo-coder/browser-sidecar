/**
 * Unit tests for SessionManager
 */
import { SessionManager, createSessionManager } from '../src/session/index.js';
import { ServerConfig, DEFAULT_CONFIG } from '../src/types.js';

// Mock crypto for consistent encryption in tests
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

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let config: ServerConfig;
  const testDir = '/tmp/test-sessions';

  beforeEach(() => {
    // Reset crypto plaintext queue between tests to avoid cross-test contamination
    // @ts-ignore
    if (typeof (globalThis as any).resetCryptoPlaintextQueue === 'function') {
      (globalThis as any).resetCryptoPlaintextQueue();
    }
    config = {
      ...DEFAULT_CONFIG,
      sessionStoragePath: testDir,
    };
    sessionManager = createSessionManager(config);
  });

  afterEach(async () => {
    // Clean up test directory
    const fs = await import('fs/promises');
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore if directory doesn't exist
    }
  });

  describe('createSessionManager', () => {
    it('should create a SessionManager instance', () => {
      expect(sessionManager).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should create session storage directory', async () => {
      await sessionManager.initialize();
      const fs = await import('fs/promises');
      await expect(fs.access(testDir)).resolves.toBeUndefined();
    });
  });

  describe('saveSession', () => {
    it('should save session with encryption', async () => {
      await sessionManager.initialize();

      const cookies = [
        { name: 'sessionid', value: 'abc123', domain: 'example.com', path: '/' },
        { name: 'user_pref', value: 'dark_mode', domain: '.example.com', path: '/' },
      ];
      const localStorage = { theme: 'dark', lang: 'en' };

      const session = await sessionManager.saveSession(
        'test-user',
        cookies,
        localStorage,
        'example.com'
      );

      expect(session).toHaveProperty('id');
      expect(session.profileName).toBe('test-user');
      expect(session.domain).toBe('example.com');
      expect(session.cookies).toBeDefined(); // Encrypted
      expect(session.localStorage).toBeDefined(); // Encrypted
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.expiresAt).toBeGreaterThan(session.createdAt);
    });

    it('should save session without localStorage', async () => {
      await sessionManager.initialize();

      const cookies = [{ name: 'test', value: 'value', domain: 'example.com', path: '/' }];

      const session = await sessionManager.saveSession(
        'test-user-no-storage',
        cookies,
        undefined,
        'example.com'
      );

      expect(session.localStorage).toBeUndefined();
    });
  });

  describe('restoreSession', () => {
    it('should restore saved session', async () => {
      await sessionManager.initialize();

      const originalCookies = [
        { name: 'sessionid', value: 'xyz789', domain: 'example.com', path: '/' },
      ];
      const originalLocalStorage = { userId: '123' };

      // Save session
      await sessionManager.saveSession(
        'restore-test',
        originalCookies,
        originalLocalStorage,
        'example.com'
      );

      // Restore session
      const restored = await sessionManager.restoreSession('restore-test');

      expect(restored.cookies).toHaveLength(1);
      expect(restored.cookies[0]).toMatchObject({
        name: 'sessionid',
        value: 'xyz789',
        domain: 'example.com',
        path: '/',
      });
      expect(restored.localStorage).toEqual(originalLocalStorage);
    });

    it('should throw error for non-existent session', async () => {
      await sessionManager.initialize();

      await expect(
        sessionManager.restoreSession('non-existent-session')
      ).rejects.toThrow();
    });

    it('should delete expired session', async () => {
      await sessionManager.initialize();

      // Manually create an expired session file
      const fs = await import('fs/promises');
      const path = await import('path');
      const expiredSession = {
        id: 'expired-id',
        profileName: 'expired-user',
        domain: 'example.com',
        cookies: 'encrypted-cookies',
        localStorage: 'encrypted-storage',
        createdAt: Date.now() - 86400000, // 1 day ago
        expiresAt: Date.now() - 3600000, // 1 hour ago (expired)
      };
      const filePath = path.join(testDir, 'expired-user.json.enc');
      await fs.writeFile(filePath, JSON.stringify(expiredSession), 'utf-8');

      // Attempt to restore should fail and delete the file
      await expect(
        sessionManager.restoreSession('expired-user')
      ).rejects.toThrow();

      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(false);
    });
  });

  describe('sessionExists', () => {
    it('should return true for existing session', async () => {
      await sessionManager.initialize();

      await sessionManager.saveSession(
        'exists-test',
        [{ name: 'test', value: 'value', domain: 'example.com', path: '/' }],
      );

      const exists = await sessionManager.sessionExists('exists-test');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      await sessionManager.initialize();

      const exists = await sessionManager.sessionExists('does-not-exist');
      expect(exists).toBe(false);
    });
  });

  describe('deleteSession', () => {
    it('should delete existing session', async () => {
      await sessionManager.initialize();

      await sessionManager.saveSession(
        'delete-test',
        [{ name: 'test', value: 'value', domain: 'example.com', path: '/' }],
      );

      let exists = await sessionManager.sessionExists('delete-test');
      expect(exists).toBe(true);

      await sessionManager.deleteSession('delete-test');

      exists = await sessionManager.sessionExists('delete-test');
      expect(exists).toBe(false);
    });

    it('should not throw error for non-existent session', async () => {
      await sessionManager.initialize();

      await expect(
        sessionManager.deleteSession('non-existent-session')
      ).resolves.toBeUndefined();
    });
  });
});
