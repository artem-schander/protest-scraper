import { Router, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { Google, Apple } from 'arctic';
import { getDatabase } from '../db/connection.js';
import { User, UserRole, UserLoginInput, UserRegistrationInput } from '../types/user.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateToken, verifyRefreshToken } from '../utils/jwt.js';
import { sendVerificationEmail, sendWelcomeEmail, isEmailConfigured } from '../services/email.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { generateVerificationCode, hashVerificationCode, VERIFICATION_CODE_EXPIRY_MINUTES } from '../utils/verification.js';

const router = Router();

// Helper function to set auth cookie
function setAuthCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('auth-token', token, {
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    secure: isProduction, // HTTPS only in production
    sameSite: 'lax', // CSRF protection
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds (matches refresh period)
    path: '/',
  });
}

const MAX_VERIFICATION_ATTEMPTS = 5;

// Rate limiters for spam protection
// In test environment, use shorter window to allow rate limit tests to work without interference
const isTestEnv = process.env.NODE_ENV === 'test';

const registerLimiter = rateLimit({
  windowMs: isTestEnv ? 1000 : 15 * 60 * 1000, // 1 second in tests, 15 minutes in production
  max: isTestEnv ? 8 : 5, // 8 in tests (allows rate limit test + some margin), 5 in production
  message: { error: 'Too many accounts created from this IP, please try again after 15 minutes' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: false, // Count all requests, not just failed ones
});

const loginLimiter = rateLimit({
  windowMs: isTestEnv ? 1000 : 15 * 60 * 1000, // 1 second in tests, 15 minutes in production
  max: isTestEnv ? 12 : 10, // 12 in tests (allows rate limit test + some margin), 10 in production
  message: { error: 'Too many login attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Initialize Google OAuth (if configured)
let google: Google | null = null;
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI) {
  google = new Google(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Initialize Apple OAuth (if configured)
let apple: Apple | null = null;
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY_PATH) {
  try {
    // Skip if using placeholder path from .env.example
    if (process.env.APPLE_PRIVATE_KEY_PATH.includes('path/to/')) {
      console.log('Apple OAuth: Skipping initialization (placeholder path detected)');
    } else {
      const privateKey = readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, 'utf-8');
      const privateKeyBuffer = new TextEncoder().encode(privateKey);
      apple = new Apple(
        process.env.APPLE_CLIENT_ID,
        process.env.APPLE_TEAM_ID,
        process.env.APPLE_KEY_ID,
        privateKeyBuffer,
        process.env.APPLE_REDIRECT_URI || 'http://localhost:3000/api/auth/apple/callback'
      );
      console.log('✅ Apple OAuth initialized');
    }
  } catch (error) {
    console.error('Failed to initialize Apple OAuth:', error);
  }
}

// Store OAuth states temporarily (in production, use Redis or database)
const oauthStates = new Map<string, { createdAt: number; codeVerifier?: string }>();

// Clean up expired states every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.createdAt > 10 * 60 * 1000) { // 10 minutes
      oauthStates.delete(state);
    }
  }
}, 10 * 60 * 1000);

// POST /api/auth/register - Register new user
router.post('/register', registerLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, role }: UserRegistrationInput = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const db = getDatabase();
    const users = db.collection<User>('users');

    // Check if user already exists
    const existingUser = await users.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(409).json({ error: 'User already exists' });
      return;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate email verification code
    const verificationCode = generateVerificationCode();
    const verificationCodeHash = hashVerificationCode(verificationCode);
    const verificationCodeExpires = new Date(
      Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000
    );

    // Create user
    const newUser: Omit<User, '_id'> = {
      email: normalizedEmail,
      password: hashedPassword,
      role: role || UserRole.USER,
      emailVerified: false,
      verificationCodeHash,
      verificationCodeExpires,
      verificationCodeAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await users.insertOne(newUser as User);

    // Send verification email (non-blocking)
    if (isEmailConfigured()) {
      sendVerificationEmail(normalizedEmail, verificationCode).catch((error) =>
        console.error('Failed to send verification email:', error)
      );
    }

    const responseBody: Record<string, unknown> = {
      message: 'Registration successful. Enter the verification code sent to your email address.',
      requiresVerification: true,
      email: normalizedEmail,
    };

    if (!isEmailConfigured() || process.env.NODE_ENV !== 'production') {
      responseBody.debugVerificationCode = verificationCode;
    }

    // Include generated user id for client-side reference if needed
    responseBody.userId = result.insertedId.toString();

    res.status(201).json(responseBody);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login - User login
router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password }: UserLoginInput = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const db = getDatabase();
    const users = db.collection<User>('users');

    // Find user
    const user = await users.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password (skip for OAuth users who don't have password)
    if (user.password) {
      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
    }

    // Check ban status before allowing login
    if (user.bannedUntil && user.bannedUntil > new Date()) {
      res.status(403).json({
        error: 'Account is currently banned.',
        bannedUntil: user.bannedUntil,
        bannedReason: user.bannedReason || undefined,
        banned: true
      });
      return;
    }

    // Enforce email verification unless explicitly disabled
    const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== 'false';
    if (requireEmailVerification && !user.emailVerified) {
      res.status(403).json({
        error: 'Email not verified. Please enter the verification code that was sent to you.',
        emailVerified: false,
        requiresVerification: true,
        email: normalizedEmail
      });
      return;
    }

    // Generate JWT
    const token = generateToken({
      userId: user._id!.toString(),
      email: user.email,
      role: user.role,
    });

    // Set HTTP-only cookie
    setAuthCookie(res, token);

    res.json({
      message: 'Login successful',
      token, // Include token in response for backwards compatibility
      user: {
        id: user._id!.toString(),
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        bannedUntil: user.bannedUntil ?? null,
        bannedReason: user.bannedReason,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/verify-email - Verify email with 6-character code
router.post('/verify-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code }: { email?: string; code?: string } = req.body || {};

    if (!email || !code) {
      res.status(400).json({ error: 'Email and verification code are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim().toUpperCase();

    const db = getDatabase();
    const users = db.collection<User>('users');

    const user = await users.findOne({ email: normalizedEmail });

    if (!user) {
      res.status(400).json({ error: 'Invalid verification code.' });
      return;
    }

    if (user.emailVerified) {
      // Already verified – just issue a fresh token to keep UX simple
      const token = generateToken({
        userId: user._id!.toString(),
        email: user.email,
        role: user.role,
      });
      setAuthCookie(res, token);
      res.json({
        message: 'Email already verified.',
        user: {
          id: user._id!.toString(),
          email: user.email,
          role: user.role,
          emailVerified: true,
        },
      });
      return;
    }

    if (!user.verificationCodeHash || !user.verificationCodeExpires) {
      res.status(400).json({
        error: 'No verification code is registered for this account. Please request a new code.',
        requiresResend: true,
      });
      return;
    }

    if (user.verificationCodeExpires < new Date()) {
      res.status(410).json({
        error: 'Verification code has expired. Please request a new code.',
        expired: true,
        requiresResend: true,
      });
      return;
    }

    const attempts = (user.verificationCodeAttempts || 0) + 1;
    const codeMatches = hashVerificationCode(normalizedCode) === user.verificationCodeHash;

    if (!codeMatches) {
      await users.updateOne(
        { _id: user._id },
        {
          $set: {
            verificationCodeAttempts: attempts,
            updatedAt: new Date(),
          },
        }
      );

      if (attempts >= MAX_VERIFICATION_ATTEMPTS) {
        res.status(429).json({
          error: 'Too many incorrect attempts. Please request a new verification code.',
          locked: true,
          requiresResend: true,
        });
        return;
      }

      res.status(400).json({
        error: 'Invalid verification code. Please try again.',
        attemptsRemaining: Math.max(MAX_VERIFICATION_ATTEMPTS - attempts, 0),
      });
      return;
    }

    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerified: true,
          updatedAt: new Date(),
        },
        $unset: {
          verificationCodeHash: '',
          verificationCodeExpires: '',
          verificationCodeAttempts: '',
        },
      }
    );

    if (isEmailConfigured()) {
      sendWelcomeEmail(user.email).catch((error) =>
        console.error('Failed to send welcome email:', error)
      );
    }

    const token = generateToken({
      userId: user._id!.toString(),
      email: user.email,
      role: user.role,
    });
    setAuthCookie(res, token);

    res.json({
      message: 'Email verified successfully.',
      user: {
        id: user._id!.toString(),
        email: user.email,
        role: user.role,
        emailVerified: true,
        bannedUntil: user.bannedUntil ?? null,
        bannedReason: user.bannedReason,
      },
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

// POST /api/auth/resend-verification - Resend verification email
const resendVerificationLimiter = rateLimit({
  windowMs: isTestEnv ? 1000 : 15 * 60 * 1000, // 1 second in tests, 15 minutes in production
  max: isTestEnv ? 10 : 3, // 10 in tests, 3 in production
  message: { error: 'Too many verification emails sent, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/resend-verification', resendVerificationLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email }: { email: string } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const db = getDatabase();
    const users = db.collection<User>('users');

    // Find user
    const user = await users.findOne({ email: normalizedEmail });
    if (!user) {
      // Don't reveal if user exists - security best practice
      res.json({ message: 'If an account exists with this email, a verification email has been sent.' });
      return;
    }

    // Check if already verified
    if (user.emailVerified) {
      res.status(400).json({ error: 'Email already verified' });
      return;
    }

    const verificationCode = generateVerificationCode();
    const verificationCodeHash = hashVerificationCode(verificationCode);
    const verificationCodeExpires = new Date(
      Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000
    );

    // Update user with new token
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          verificationCodeHash,
          verificationCodeExpires,
          verificationCodeAttempts: 0,
          updatedAt: new Date(),
        },
      }
    );

    if (isEmailConfigured()) {
      await sendVerificationEmail(normalizedEmail, verificationCode);
    }

    const responseBody: Record<string, unknown> = {
      message: 'A new verification code has been issued. Please check your inbox.',
      requiresVerification: true,
      email: normalizedEmail,
    };

    if (!isEmailConfigured() || process.env.NODE_ENV !== 'production') {
      responseBody.debugVerificationCode = verificationCode;
    }

    res.json(responseBody);
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// GET /api/auth/google - Initiate Google OAuth flow
router.get('/google', (_req: Request, res: Response): void => {
  if (!google) {
    res.status(503).json({ error: 'Google OAuth not configured' });
    return;
  }

  try {
    // Generate random state for CSRF protection and code verifier for PKCE
    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('hex');

    // Store state and code verifier
    oauthStates.set(state, { createdAt: Date.now(), codeVerifier });

    // Create authorization URL with PKCE
    const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);

    // Redirect user to Google
    res.redirect(url.toString());
  } catch (error) {
    console.error('Google OAuth init error:', error);
    res.status(500).json({ error: 'Failed to initiate Google login' });
  }
});

// GET /api/auth/google/callback - Handle Google OAuth callback
router.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
  if (!google) {
    res.status(503).json({ error: 'Google OAuth not configured' });
    return;
  }

  try {
    const { code, state } = req.query;

    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
      res.status(400).json({ error: 'Invalid OAuth callback parameters' });
      return;
    }

    // Verify state to prevent CSRF
    const stateData = oauthStates.get(state);
    if (!stateData || !stateData.codeVerifier) {
      res.status(400).json({ error: 'Invalid or expired OAuth state' });
      return;
    }
    const codeVerifier = stateData.codeVerifier;
    oauthStates.delete(state);

    // Exchange code for tokens using PKCE
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);

    // Fetch user info from Google
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.accessToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Google user info');
    }

    const googleUser = (await response.json()) as {
      id: string;
      email: string;
      verified_email: boolean;
      name: string;
      picture: string;
    };

    // Find or create user
    const db = getDatabase();
    const users = db.collection<User>('users');

    let user = await users.findOne({ email: googleUser.email });

    if (!user) {
      // Create new user from Google account
      const newUser: Omit<User, '_id'> = {
        email: googleUser.email,
        role: UserRole.USER,
        emailVerified: googleUser.verified_email, // Trust Google's verification
        oauthProvider: 'google',
        oauthId: googleUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await users.insertOne(newUser as User);
      // Fetch the inserted user to get the complete document
      user = await users.findOne({ _id: result.insertedId });
      if (!user) {
        throw new Error('Failed to create user');
      }
    } else {
      // Update existing user with OAuth info if not set
      if (!user.oauthProvider) {
        const updateResult = await users.findOneAndUpdate(
          { _id: user._id },
          {
            $set: {
              oauthProvider: 'google' as const,
              oauthId: googleUser.id,
              emailVerified: googleUser.verified_email || user.emailVerified,
              updatedAt: new Date(),
            },
          },
          { returnDocument: 'after' }
        );
        user = updateResult || user;
      }
    }

    // Generate JWT
    const token = generateToken({
      userId: user._id!.toString(),
      email: user.email,
      role: user.role,
    });

    // Set HTTP-only cookie
    setAuthCookie(res, token);

    // Redirect to frontend with user info in query string
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const userParam = encodeURIComponent(JSON.stringify({
      id: user._id!.toString(),
      email: user.email,
      role: user.role,
    }));
    res.redirect(`${frontendUrl}/auth/callback?user=${userParam}`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({ error: 'Google login failed' });
  }
});

// GET /api/auth/apple - Initiate Apple OAuth flow
router.get('/apple', (_req: Request, res: Response): void => {
  if (!apple) {
    res.status(503).json({ error: 'Apple OAuth not configured' });
    return;
  }

  try {
    // Generate random state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Store state
    oauthStates.set(state, { createdAt: Date.now() });

    // Create authorization URL
    const url = apple.createAuthorizationURL(state, ['email', 'name']);

    // Redirect user to Apple
    res.redirect(url.toString());
  } catch (error) {
    console.error('Apple OAuth init error:', error);
    res.status(500).json({ error: 'Failed to initiate Apple login' });
  }
});

// GET /api/auth/apple/callback - Handle Apple OAuth callback
router.post('/apple/callback', async (req: Request, res: Response): Promise<void> => {
  if (!apple) {
    res.status(503).json({ error: 'Apple OAuth not configured' });
    return;
  }

  try {
    const { code, state } = req.body;

    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
      res.status(400).json({ error: 'Invalid OAuth callback parameters' });
      return;
    }

    // Verify state to prevent CSRF
    const stateData = oauthStates.get(state);
    if (!stateData) {
      res.status(400).json({ error: 'Invalid or expired OAuth state' });
      return;
    }
    oauthStates.delete(state);

    // Exchange code for tokens
    const tokens = await apple.validateAuthorizationCode(code);

    // Decode ID token to get user info
    // Apple provides user info in the ID token claims
    const idTokenPayload = JSON.parse(
      Buffer.from(tokens.idToken().split('.')[1], 'base64').toString()
    ) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
    };

    if (!idTokenPayload.email) {
      throw new Error('Email not provided by Apple');
    }

    // Find or create user
    const db = getDatabase();
    const users = db.collection<User>('users');

    let user = await users.findOne({ email: idTokenPayload.email });

    if (!user) {
      // Create new user from Apple account
      const newUser: Omit<User, '_id'> = {
        email: idTokenPayload.email,
        role: UserRole.USER,
        emailVerified: idTokenPayload.email_verified || true, // Apple emails are verified
        oauthProvider: 'apple',
        oauthId: idTokenPayload.sub,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await users.insertOne(newUser as User);
      // Fetch the inserted user to get the complete document
      user = await users.findOne({ _id: result.insertedId });
      if (!user) {
        throw new Error('Failed to create user');
      }
    } else {
      // Update existing user with OAuth info if not set
      if (!user.oauthProvider) {
        const updateResult = await users.findOneAndUpdate(
          { _id: user._id },
          {
            $set: {
              oauthProvider: 'apple' as const,
              oauthId: idTokenPayload.sub,
              emailVerified: idTokenPayload.email_verified || user.emailVerified,
              updatedAt: new Date(),
            },
          },
          { returnDocument: 'after' }
        );
        user = updateResult || user;
      }
    }

    // Generate JWT
    const token = generateToken({
      userId: user._id!.toString(),
      email: user.email,
      role: user.role,
    });

    // Set HTTP-only cookie
    setAuthCookie(res, token);

    // Redirect to frontend with user info in query string
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const userParam = encodeURIComponent(JSON.stringify({
      id: user._id!.toString(),
      email: user.email,
      role: user.role,
    }));
    res.redirect(`${frontendUrl}/auth/callback?user=${userParam}`);
  } catch (error) {
    console.error('Apple OAuth callback error:', error);
    res.status(500).json({ error: 'Apple login failed' });
  }
});

// POST /api/auth/logout - Clear auth cookie
router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie('auth-token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me - Get current user from token
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const users = db.collection<User>('users');

    const user = await users.findOne({ _id: new (await import('mongodb')).ObjectId(req.user!.userId) });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: user._id!.toString(),
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// POST /api/auth/refresh - Refresh auth token
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    // Get token from cookie
    const token = req.cookies && req.cookies['auth-token'];

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    // Verify refresh token (checks refreshUntil, ignores exp)
    const payload = verifyRefreshToken(token);

    // Generate new token with same user info
    const newToken = generateToken({
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    });

    // Set new cookie
    setAuthCookie(res, newToken);

    res.json({
      message: 'Token refreshed successfully',
      token: newToken // Include in response for backwards compatibility
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: error instanceof Error ? error.message : 'Failed to refresh token' });
  }
});

export default router;
