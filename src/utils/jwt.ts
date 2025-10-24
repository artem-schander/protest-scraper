import jwt, { SignOptions } from 'jsonwebtoken';
import { JWTPayload } from '@/types/user.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const ACCESS_TOKEN_EXPIRES_IN = '15m'; // 15 minutes for access
const REFRESH_TOKEN_TTL_DAYS = 30; // 30 days to allow refresh

export function generateToken(payload: JWTPayload): string {
  // Add refreshUntil timestamp (30 days from now)
  const refreshUntil = Math.floor(Date.now() / 1000) + (REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60);

  const tokenPayload = {
    ...payload,
    refreshUntil
  };

  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN } as SignOptions);
}

export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function verifyRefreshToken(token: string): JWTPayload {
  try {
    // Verify the token signature and decode it, ignoring expiration
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as JWTPayload;

    // Check if refreshUntil is still valid
    const now = Math.floor(Date.now() / 1000);
    if (!decoded.refreshUntil || decoded.refreshUntil < now) {
      throw new Error('Refresh period expired');
    }

    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
}
