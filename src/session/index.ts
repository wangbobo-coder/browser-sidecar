/**
 * Session Manager
 * 
 * Manages browser session storage with AES-256-GCM encryption.
 * Stores sessions in shared volume files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import pino from 'pino';
import type { SessionData, ServerConfig } from '../types.js';

const logger = pino({ name: 'session-manager' });

// PBKDF2 configuration for secure key derivation
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits for AES-256
const PBKDF2_SALT = Buffer.from('browser-sidecar-session-key-salt', 'utf-8');

// Cache configuration
const CACHE_TTL_MS = 60000; // 1 minute cache TTL

interface CachedSession {
  data: { cookies: Array<{ name: string; value: string; domain: string; path: string }>; localStorage?: Record<string, string> };
  timestamp: number;
}

/**
 * Session Manager class
 */
export class SessionManager {
  private storagePath: string;
  private encryptionKey: Buffer;
  // Memory cache for session data
  private sessionCache: Map<string, CachedSession> = new Map();

  constructor(config: ServerConfig) {
    this.storagePath = config.sessionStoragePath;
    
    // Get encryption key source from config or environment
    const keySource = config.encryptionKey ?? process.env.SESSION_ENCRYPTION_KEY;
    
    // Warn if no encryption key is configured
    if (!keySource) {
      logger.warn(
        '⚠️  No SESSION_ENCRYPTION_KEY configured! Using insecure default key. ' +
        'Set SESSION_ENCRYPTION_KEY environment variable or encryptionKey in config for production.'
      );
    }
    
    // Derive 32-byte key using PBKDF2 for secure key derivation
    const actualKeySource = keySource ?? 'insecure-default-key-for-development-only';
    this.encryptionKey = crypto.pbkdf2Sync(
      actualKeySource,
      PBKDF2_SALT,
      PBKDF2_ITERATIONS,
      PBKDF2_KEY_LENGTH,
      'sha256'
    );
    
    logger.info('Session manager initialized with PBKDF2 key derivation');
  }

  /**
   * Initialize session storage directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      logger.info({ path: this.storagePath }, 'Session storage initialized');
    } catch (err) {
      logger.error({ err }, 'Failed to create session storage directory');
      throw err;
    }
  }

  /**
   * Save session to encrypted file
   */
  async saveSession(
    profileName: string,
    cookies: Array<{ name: string; value: string; domain: string; path: string }>,
    localStorage?: Record<string, string>,
    domain?: string
  ): Promise<SessionData> {
    // Invalidate cache on save
    this.sessionCache.delete(profileName);

    const sessionData: SessionData = {
      id: crypto.randomUUID(),
      profileName,
      domain: domain ?? '',
      cookies: this.encrypt(JSON.stringify(cookies)),
      localStorage: localStorage ? this.encrypt(JSON.stringify(localStorage)) : undefined,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    const filePath = this.getSessionFilePath(profileName);
    await fs.writeFile(filePath, JSON.stringify(sessionData), 'utf-8');

    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
      logger.debug({ profileName, filePath }, 'Session saved');
    } else {
      logger.info({ profileName }, 'Session saved');
    }
    return sessionData;
  }

  /**
   * Restore session from encrypted file
   */
  async restoreSession(profileName: string): Promise<{
    cookies: Array<{ name: string; value: string; domain: string; path: string }>;
    localStorage?: Record<string, string>;
  }> {
    // Check cache first
    const cached = this.sessionCache.get(profileName);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
        logger.debug({ profileName, cacheHit: true }, 'Session restored from cache');
      } else {
        logger.info({ profileName, cacheHit: true }, 'Session restored from cache');
      }
      return cached.data;
    }

    const filePath = this.getSessionFilePath(profileName);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const sessionData: SessionData = JSON.parse(data);

      // Check expiration
      if (sessionData.expiresAt < Date.now()) {
        await fs.unlink(filePath);
        // Also clear from cache if present
        this.sessionCache.delete(profileName);
        throw new Error('Session expired');
      }

      const cookies = JSON.parse(this.decrypt(sessionData.cookies)) as Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
      }>;

      let localStorage: Record<string, string> | undefined;
      if (sessionData.localStorage) {
        localStorage = JSON.parse(this.decrypt(sessionData.localStorage)) as Record<string, string>;
      }

      // Cache the result
      const sessionResult = { cookies, localStorage };
      this.sessionCache.set(profileName, {
        data: sessionResult,
        timestamp: Date.now(),
      });

      if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
        logger.debug({ profileName, filePath }, 'Session restored');
      } else {
        logger.info({ profileName }, 'Session restored');
      }
      return sessionResult;
    } catch (err) {
      logger.error({ err, profileName }, 'Failed to restore session');
      throw err;
    }
  }

  /**
   * Check if session exists
   */
  async sessionExists(profileName: string): Promise<boolean> {
    const filePath = this.getSessionFilePath(profileName);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete session
   */
  async deleteSession(profileName: string): Promise<void> {
    // Clear from cache
    this.sessionCache.delete(profileName);
    
    const filePath = this.getSessionFilePath(profileName);
    try {
      await fs.unlink(filePath);
      if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
        logger.debug({ profileName, filePath }, 'Session deleted');
      } else {
        logger.info({ profileName }, 'Session deleted');
      }
    } catch (err) {
      const e = err as { code?: string };
      // If the file doesn't exist, treat as a successful delete
      if (e?.code === 'ENOENT') {
        return;
      }
      // For all other errors, preserve existing behavior
      logger.error({ err, profileName }, 'Failed to delete session');
      throw err;
    }
  }

  /**
   * Get session file path
   */
  private getSessionFilePath(profileName: string): string {
    // Sanitize profile name to prevent path traversal
    const safeName = profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storagePath, `${safeName}.json.enc`);
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private encrypt(data: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf-8'),
      cipher.final(),
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted (all base64)
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private decrypt(encryptedData: string): string {
    const buffer = Buffer.from(encryptedData, 'base64');
    
    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return decrypted.toString('utf-8');
  }
}

/**
 * Create session manager instance
 */
export function createSessionManager(config: ServerConfig): SessionManager {
  return new SessionManager(config);
}
