import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { createApp } from '@/app.js';
import { hashPassword } from '@/utils/password.js';
import { UserRole } from '@/types/user.js';
import * as dbConnection from '@/db/connection.js';
import * as emailService from '@/services/email.js';

const app = createApp();
const FIXED_DATE = new Date('2024-01-01T12:00:00Z');

let mongoServer: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let adminToken: string;

async function createAndLoginAdmin() {
  const now = new Date();
  const adminEmail = 'admin@example.com';
  const password = 'adminpass123';

  await db.collection('users').insertOne({
    email: adminEmail,
    password: await hashPassword(password),
    role: UserRole.ADMIN,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });

  const loginRes = await request(app).post('/api/auth/login').send({
    email: adminEmail,
    password,
  });

  expect(loginRes.status).toBe(200);
  adminToken = loginRes.body.token;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_DATE);

  mongoServer = await MongoMemoryServer.create({
    instance: {
      ip: '127.0.0.1',
    },
  });
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;

  client = new MongoClient(uri);
  await client.connect();
  db = client.db('test-admin-users');

  vi.spyOn(dbConnection, 'getDatabase').mockReturnValue(db);
  vi.spyOn(emailService, 'sendVerificationEmail').mockResolvedValue();
  vi.spyOn(emailService, 'isEmailConfigured').mockReturnValue(true);

  await db.collection('users').createIndex({ email: 1 }, { unique: true });
});

afterAll(async () => {
  if (client) {
    await client.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await db.collection('users').deleteMany({});
  await createAndLoginAdmin();
});

describe('Admin Users API', () => {
  it('rejects access without admin credentials', async () => {
    const res = await request(app).get('/api/admin/users');

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('lists users without exposing sensitive fields', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users[0].email).toBe('admin@example.com');
    expect(res.body.users[0]).not.toHaveProperty('password');
  });

  it('creates a new user with default role USER', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'new-user@example.com',
        password: 'securepass123',
      });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new-user@example.com');
    expect(res.body.user.role).toBe(UserRole.USER);

    const created = await db.collection('users').findOne({ email: 'new-user@example.com' });
    expect(created).toBeTruthy();
    expect(created?.password).not.toBe('securepass123');
  });

  it("changes a user's role but prevents modifying other admins", async () => {
    const { insertedId } = await db.collection('users').insertOne({
      email: 'moderator@example.com',
      password: await hashPassword('moderatorpass'),
      role: UserRole.MODERATOR,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .patch(`/api/admin/users/${insertedId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: UserRole.USER, emailVerified: false });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(UserRole.USER);
    expect(res.body.user.emailVerified).toBe(false);

    const otherAdmin = await db.collection('users').insertOne({
      email: 'other-admin@example.com',
      password: await hashPassword('otheradmin'),
      role: UserRole.ADMIN,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const forbidden = await request(app)
      .patch(`/api/admin/users/${otherAdmin.insertedId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: UserRole.USER });

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toContain("admin's role");
  });

  it('refuses to delete other admins but allows deleting regular users', async () => {
    const userInsert = await db.collection('users').insertOne({
      email: 'deletable@example.com',
      password: await hashPassword('deletepass123'),
      role: UserRole.USER,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const deleteRes = await request(app)
      .delete(`/api/admin/users/${userInsert.insertedId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(204);
    const remainingUser = await db.collection('users').findOne({ _id: userInsert.insertedId });
    expect(remainingUser).toBeNull();

    const otherAdmin = await db.collection('users').insertOne({
      email: 'cant-delete@example.com',
      password: await hashPassword('otheradminpass'),
      role: UserRole.ADMIN,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const forbidden = await request(app)
      .delete(`/api/admin/users/${otherAdmin.insertedId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toContain('delete another admin');
  });

  it('bans users for a duration and forever, then unbans them', async () => {
    const userInsert = await db.collection('users').insertOne({
      email: 'ban-me@example.com',
      password: await hashPassword('banpass123'),
      role: UserRole.USER,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const durationBan = await request(app)
      .post(`/api/admin/users/${userInsert.insertedId}/ban`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hours: 2, reason: 'Testing ban' });

    expect(durationBan.status).toBe(200);
    expect(new Date(durationBan.body.user.bannedUntil).getTime()).toBeGreaterThan(FIXED_DATE.getTime());
    expect(durationBan.body.user.bannedReason).toBe('Testing ban');

    const foreverBan = await request(app)
      .post(`/api/admin/users/${userInsert.insertedId}/ban`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ forever: true });

    expect(foreverBan.status).toBe(200);
    expect(foreverBan.body.user.bannedUntil).toBe('9999-12-31T23:59:59.999Z');

    const unban = await request(app)
      .post(`/api/admin/users/${userInsert.insertedId}/unban`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(unban.status).toBe(200);
    expect(unban.body.user.bannedUntil).toBeNull();
    expect(unban.body.user.bannedReason).toBeNull();
  });

  it('blocks banning other admins', async () => {
    const otherAdmin = await db.collection('users').insertOne({
      email: 'noban-admin@example.com',
      password: await hashPassword('nobanpass'),
      role: UserRole.ADMIN,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/admin/users/${otherAdmin.insertedId}/ban`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hours: 1 });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('ban another admin');
  });

  it('resends verification email for unverified users', async () => {
    const { insertedId } = await db.collection('users').insertOne({
      email: 'needs-verify@example.com',
      password: await hashPassword('verifyPass123'),
      role: UserRole.USER,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resend = await request(app)
      .post(`/api/admin/users/${insertedId}/resend-verification`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resend.status).toBe(200);
    expect(resend.body.user.email).toBe('needs-verify@example.com');
    expect(resend.body.user.emailVerified).toBe(false);
    expect(resend.body.debugVerificationCode).toMatch(/^[A-Z0-9]{6}$/);

    const refreshedUser = await db.collection('users').findOne({ _id: insertedId });
    expect(refreshedUser?.verificationCodeHash).toBeTruthy();
    expect(refreshedUser?.verificationCodeAttempts).toBe(0);
    expect(refreshedUser?.verificationCodeExpires).toBeInstanceOf(Date);
  });

  it('rejects verification resend when already verified', async () => {
    const { insertedId } = await db.collection('users').insertOne({
      email: 'verified@example.com',
      password: await hashPassword('verifiedPass123'),
      role: UserRole.USER,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resend = await request(app)
      .post(`/api/admin/users/${insertedId}/resend-verification`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resend.status).toBe(400);
    expect(resend.body.error).toContain('already verified');
  });
});
