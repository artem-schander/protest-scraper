import { Router, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db/connection.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { User, UserRole } from '../types/user.js';
import { hashPassword } from '../utils/password.js';
import { generateVerificationCode, hashVerificationCode, VERIFICATION_CODE_EXPIRY_MINUTES } from '../utils/verification.js';
import { sendVerificationEmail, isEmailConfigured } from '../services/email.js';

const router = Router();

router.use(authenticate, authorize(UserRole.ADMIN));

function sanitizeUser(user: User) {
  return {
    id: user._id!.toString(),
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    bannedUntil: user.bannedUntil ?? null,
    bannedReason: user.bannedReason || null
  };
}

function parseObjectId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch (error) {
    return null;
  }
}

router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const usersCollection = db.collection<User>('users');

  const users = await usersCollection
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  res.json({
    users: users.map(sanitizeUser)
  });
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password, role, emailVerified } = req.body || {};

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const db = getDatabase();
    const usersCollection = db.collection<User>('users');

    const existing = await usersCollection.findOne({ email: normalizedEmail });
    if (existing) {
      res.status(409).json({ error: 'User already exists' });
      return;
    }

    const roleValue = typeof role === 'string' ? role : undefined;
    const targetRole = roleValue && (Object.values(UserRole) as string[]).includes(roleValue)
      ? roleValue as UserRole
      : UserRole.USER;
    const hashedPassword = await hashPassword(password);
    const now = new Date();

    const newUser: Omit<User, '_id'> = {
      email: normalizedEmail,
      password: hashedPassword,
      role: targetRole,
      emailVerified: Boolean(emailVerified),
      verificationCodeHash: undefined,
      verificationCodeExpires: undefined,
      verificationCodeAttempts: 0,
      bannedUntil: null,
      bannedReason: undefined,
      createdAt: now,
      updatedAt: now
    };

    const result = await usersCollection.insertOne(newUser);
    const inserted = await usersCollection.findOne({ _id: result.insertedId });

    if (!inserted) {
      res.status(500).json({ error: 'Failed to create user' });
      return;
    }

    res.status(201).json({
      user: sanitizeUser(inserted)
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const objectId = parseObjectId(id);
    if (!objectId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const updates: Record<string, unknown> = {};
    const { email, password, role, emailVerified } = req.body || {};

    const db = getDatabase();
    const usersCollection = db.collection<User>('users');
    const targetUser = await usersCollection.findOne({ _id: objectId });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const requesterId = req.user?.userId;
    const isTargetAdmin = targetUser.role === UserRole.ADMIN;
    const isSelf = requesterId === targetUser._id?.toString();

    if (email && typeof email === 'string') {
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail !== targetUser.email) {
        const duplicate = await usersCollection.findOne({ email: normalizedEmail, _id: { $ne: objectId } });
        if (duplicate) {
          res.status(409).json({ error: 'Another user already uses this email' });
          return;
        }
        updates.email = normalizedEmail;
      }
    }

    if (password && typeof password === 'string') {
      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long' });
        return;
      }
      updates.password = await hashPassword(password);
    }

    if (emailVerified !== undefined) {
      updates.emailVerified = Boolean(emailVerified);
    }

    const roleValue = typeof role === 'string' ? role : undefined;
    if (roleValue && (Object.values(UserRole) as string[]).includes(roleValue)) {
      const newRole = roleValue as UserRole;
      if (isTargetAdmin && !isSelf && newRole !== UserRole.ADMIN) {
        res.status(403).json({ error: "You can't change another admin's role" });
        return;
      }
      updates.role = newRole;
    }

    if (Object.keys(updates).length === 0) {
      res.json({ user: sanitizeUser(targetUser) });
      return;
    }

    updates.updatedAt = new Date();

    await usersCollection.updateOne({ _id: objectId }, { $set: updates });
    const updatedUser = await usersCollection.findOne({ _id: objectId });
    if (!updatedUser) {
      res.status(500).json({ error: 'Failed to update user' });
      return;
    }

    res.json({ user: sanitizeUser(updatedUser) });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const objectId = parseObjectId(req.params.id);
    if (!objectId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const db = getDatabase();
    const usersCollection = db.collection<User>('users');
    const targetUser = await usersCollection.findOne({ _id: objectId });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const requesterId = req.user?.userId;
    const isSelf = requesterId === targetUser._id?.toString();

    if (targetUser.role === UserRole.ADMIN && !isSelf) {
      res.status(403).json({ error: "You can't delete another admin" });
      return;
    }

    await usersCollection.deleteOne({ _id: objectId });
    res.status(204).send();
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.post('/:id/resend-verification', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const objectId = parseObjectId(req.params.id);
    if (!objectId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const db = getDatabase();
    const usersCollection = db.collection<User>('users');
    const targetUser = await usersCollection.findOne({ _id: objectId });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUser.emailVerified) {
      res.status(400).json({ error: 'Email already verified' });
      return;
    }

    const verificationCode = generateVerificationCode();
    const verificationCodeHash = hashVerificationCode(verificationCode);
    const verificationCodeExpires = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);

    await usersCollection.updateOne(
      { _id: objectId },
      {
        $set: {
          verificationCodeHash,
          verificationCodeExpires,
          verificationCodeAttempts: 0,
          updatedAt: new Date()
        }
      }
    );

    if (isEmailConfigured()) {
      await sendVerificationEmail(targetUser.email, verificationCode);
    }

    const updatedUser = await usersCollection.findOne({ _id: objectId });
    if (!updatedUser) {
      res.status(500).json({ error: 'Failed to update user' });
      return;
    }

    const responseBody: Record<string, unknown> = {
      message: 'Verification email resent',
      user: sanitizeUser(updatedUser)
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

router.post('/:id/ban', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const objectId = parseObjectId(req.params.id);
    if (!objectId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const { minutes, hours, days, until, forever, reason } = req.body || {};

    const db = getDatabase();
    const usersCollection = db.collection<User>('users');
    const targetUser = await usersCollection.findOne({ _id: objectId });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUser.role === UserRole.ADMIN && targetUser._id?.toString() !== req.user?.userId) {
      res.status(403).json({ error: "You can't ban another admin" });
      return;
    }

    let bannedUntil: Date | null = null;

    const foreverFlag = typeof forever === 'boolean' ? forever : false;
    if (foreverFlag) {
      bannedUntil = new Date('9999-12-31T23:59:59.999Z');
    } else if (typeof until === 'string' || until instanceof Date) {
      const parsed = new Date(until);
      if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
        res.status(400).json({ error: 'Invalid ban until date' });
        return;
      }
      bannedUntil = parsed;
    } else {
      const minutesValue = typeof minutes === 'number' ? minutes : Number(minutes);
      const hoursValue = typeof hours === 'number' ? hours : Number(hours);
      const daysValue = typeof days === 'number' ? days : Number(days);
      const totalMinutes =
        (Number.isFinite(minutesValue) ? minutesValue : 0) +
        (Number.isFinite(hoursValue) ? hoursValue * 60 : 0) +
        (Number.isFinite(daysValue) ? daysValue * 24 * 60 : 0);
      if (totalMinutes <= 0) {
        res.status(400).json({ error: 'Provide a positive duration, until date, or set forever to true' });
        return;
      }
      bannedUntil = new Date(Date.now() + totalMinutes * 60 * 1000);
    }

    await usersCollection.updateOne(
      { _id: objectId },
      {
        $set: {
          bannedUntil,
          bannedReason: typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : undefined,
          updatedAt: new Date()
        }
      }
    );

    const updatedUser = await usersCollection.findOne({ _id: objectId });
    res.json({ user: sanitizeUser(updatedUser as User) });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

router.post('/:id/unban', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const objectId = parseObjectId(req.params.id);
    if (!objectId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const db = getDatabase();
    const usersCollection = db.collection<User>('users');
    const targetUser = await usersCollection.findOne({ _id: objectId });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await usersCollection.updateOne(
      { _id: objectId },
      {
        $set: {
          bannedUntil: null,
          bannedReason: undefined,
          updatedAt: new Date()
        }
      }
    );

    const updatedUser = await usersCollection.findOne({ _id: objectId });
    res.json({ user: sanitizeUser(updatedUser as User) });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

export default router;
