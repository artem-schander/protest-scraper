import { describe, it, expect, beforeAll, vi } from 'vitest';
import { generateToken, verifyToken, verifyRefreshToken } from '../src/utils/jwt.js';
import { UserRole } from '../src/types/user.js';
import jwt from 'jsonwebtoken';

describe('JWT Utilities', () => {
  const testPayload = {
    userId: '123456',
    email: 'test@example.com',
    role: UserRole.USER,
  };

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(testPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include user payload in token', () => {
      const token = generateToken(testPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBe(testPayload.role);
    });

    it('should set 15-minute expiry', () => {
      const token = generateToken(testPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();

      const expiryDuration = decoded.exp - decoded.iat;
      expect(expiryDuration).toBe(15 * 60); // 15 minutes in seconds
    });

    it('should set 30-day refreshUntil claim', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = generateToken(testPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.refreshUntil).toBeDefined();

      const refreshDuration = decoded.refreshUntil - now;
      const thirtyDaysInSeconds = 30 * 24 * 60 * 60;

      // Allow 5 second tolerance for test execution time
      expect(refreshDuration).toBeGreaterThan(thirtyDaysInSeconds - 5);
      expect(refreshDuration).toBeLessThan(thirtyDaysInSeconds + 5);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const token = generateToken(testPayload);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBe(testPayload.role);
    });

    it('should reject invalid token', () => {
      expect(() => verifyToken('invalid-token')).toThrow('Invalid or expired token');
    });

    it('should reject expired token', () => {
      // Create a token that expires immediately
      const expiredToken = jwt.sign(
        { ...testPayload, refreshUntil: Math.floor(Date.now() / 1000) + 86400 },
        process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
        { expiresIn: '1ms' }
      );

      // Wait a bit to ensure expiry
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(() => verifyToken(expiredToken)).toThrow('Invalid or expired token');
          resolve(undefined);
        }, 10);
      });
    });

    it('should reject token with wrong signature', () => {
      const token = jwt.sign(testPayload, 'wrong-secret', { expiresIn: '15m' });

      expect(() => verifyToken(token)).toThrow('Invalid or expired token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify token with valid refreshUntil', () => {
      const token = generateToken(testPayload);
      const decoded = verifyRefreshToken(token);

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBe(testPayload.role);
    });

    it('should accept expired token if refreshUntil is still valid', () => {
      // Create a token with short exp but long refreshUntil
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = jwt.sign(
        {
          ...testPayload,
          refreshUntil: now + 86400, // 24 hours from now
        },
        process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
        { expiresIn: '1ms' }
      );

      // Wait for token to expire
      return new Promise((resolve) => {
        setTimeout(() => {
          // verifyToken should reject
          expect(() => verifyToken(expiredToken)).toThrow('Invalid or expired token');

          // But verifyRefreshToken should accept it
          const decoded = verifyRefreshToken(expiredToken);
          expect(decoded.userId).toBe(testPayload.userId);
          resolve(undefined);
        }, 10);
      });
    });

    it('should reject token with expired refreshUntil', () => {
      // Create token with past refreshUntil
      const now = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        {
          ...testPayload,
          refreshUntil: now - 1, // Already expired
        },
        process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
        { expiresIn: '1ms' }
      );

      expect(() => verifyRefreshToken(token)).toThrow('Invalid or expired refresh token');
    });

    it('should reject token without refreshUntil claim', () => {
      // Create token without refreshUntil
      const token = jwt.sign(
        testPayload,
        process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
        { expiresIn: '1ms' }
      );

      // Wait for token to expire
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(() => verifyRefreshToken(token)).toThrow('Invalid or expired refresh token');
          resolve(undefined);
        }, 10);
      });
    });

    it('should reject token with wrong signature', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        {
          ...testPayload,
          refreshUntil: now + 86400,
        },
        'wrong-secret',
        { expiresIn: '15m' }
      );

      expect(() => verifyRefreshToken(token)).toThrow('Invalid or expired refresh token');
    });
  });

  describe('Token Lifecycle', () => {
    it('should demonstrate full token lifecycle', async () => {
      // 1. Generate token
      const token = generateToken(testPayload);
      const decoded = jwt.decode(token) as any;

      // 2. Token is valid immediately
      expect(() => verifyToken(token)).not.toThrow();
      expect(() => verifyRefreshToken(token)).not.toThrow();

      // 3. Create expired token to simulate 15-minute passage
      const expiredToken = jwt.sign(
        {
          ...testPayload,
          refreshUntil: decoded.refreshUntil, // Keep original refreshUntil
        },
        process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
        { expiresIn: '1ms' }
      );

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 4. After 15 minutes, normal verify fails
      expect(() => verifyToken(expiredToken)).toThrow('Invalid or expired token');

      // 5. But refresh verify still works (within 30 days)
      const refreshDecoded = verifyRefreshToken(expiredToken);
      expect(refreshDecoded.userId).toBe(testPayload.userId);

      // 6. Generate new token (simulating refresh endpoint)
      const newToken = generateToken({
        userId: refreshDecoded.userId,
        email: refreshDecoded.email,
        role: refreshDecoded.role,
      });

      // 7. New token is valid again
      expect(() => verifyToken(newToken)).not.toThrow();
    });
  });
});
