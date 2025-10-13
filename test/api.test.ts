import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/utils/password.js';
import { UserRole } from '../src/types/user.js';
import { Protest } from '../src/types/protest.js';
import * as dbConnection from '../src/db/connection.js';

let mongoServer: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const app = createApp();

// Mock database connection
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  // Set MongoDB URI for tests
  process.env.MONGODB_URI = uri;

  client = new MongoClient(uri);
  await client.connect();
  db = client.db('test');

  // Mock getDatabase using vitest
  vi.spyOn(dbConnection, 'getDatabase').mockReturnValue(db);

  // Create indexes
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('protests').createIndex({ geoLocation: '2dsphere' }, { sparse: true });
});

afterAll(async () => {
  await client.close();
  await mongoServer.stop();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  // Clear collections before each test
  await db.collection('users').deleteMany({});
  await db.collection('protests').deleteMany({});
});

describe('Auth API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('User registered successfully');
      expect(res.body.user.email).toBe('test@example.com');
      expect(res.body.user.role).toBe('USER');
    });

    it('should reject duplicate email', async () => {
      await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
      });

      const res = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password456',
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('User already exists');
    });

    it('should reject weak password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'short',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least 8 characters');
    });

    it('should reject invalid email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'invalid-email',
        password: 'password123',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid email');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create test user
      await db.collection('users').insertOne({
        email: 'test@example.com',
        password: await hashPassword('password123'),
        role: UserRole.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should login with valid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Login successful');
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('test@example.com');
    });

    it('should reject invalid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'wrongpassword',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });
  });
});

describe('Protests API', () => {
  let userToken: string;
  let moderatorToken: string;
  let adminToken: string;

  beforeEach(async () => {
    // Create test users
    const hashedPassword = await hashPassword('password123');

    await db.collection('users').insertOne({
      email: 'user@example.com',
      password: hashedPassword,
      role: UserRole.USER,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection('users').insertOne({
      email: 'moderator@example.com',
      password: hashedPassword,
      role: UserRole.MODERATOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection('users').insertOne({
      email: 'admin@example.com',
      password: hashedPassword,
      role: UserRole.ADMIN,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Get tokens
    const userRes = await request(app).post('/api/auth/login').send({
      email: 'user@example.com',
      password: 'password123',
    });
    userToken = userRes.body.token;

    const moderatorRes = await request(app).post('/api/auth/login').send({
      email: 'moderator@example.com',
      password: 'password123',
    });
    moderatorToken = moderatorRes.body.token;

    const adminRes = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'password123',
    });
    adminToken = adminRes.body.token;

    // Add test protests
    await db.collection<Protest>('protests').insertMany([
      {
        source: 'Test Source',
        city: 'Berlin',
        title: 'Test Protest 1',
        start: new Date('2025-12-01T14:00:00Z'),
        end: null,
        location: 'Brandenburger Tor',
        geoLocation: {
          type: 'Point',
          coordinates: [13.377704, 52.516275], // Berlin coordinates [lon, lat]
        },
        url: 'https://example.com/protest1',
        attendees: 500,
        verified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        source: 'Test Source',
        city: 'Munich',
        title: 'Test Protest 2',
        start: new Date('2025-12-02T15:00:00Z'),
        end: null,
        location: 'Marienplatz',
        geoLocation: {
          type: 'Point',
          coordinates: [11.576124, 48.137154], // Munich coordinates [lon, lat]
        },
        url: 'https://example.com/protest2',
        attendees: 300,
        verified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  describe('GET /api/protests', () => {
    it('should list verified protests', async () => {
      const res = await request(app).get('/api/protests');

      expect(res.status).toBe(200);
      expect(res.body.protests).toBeInstanceOf(Array);
      expect(res.body.protests.length).toBe(2);
      expect(res.body.pagination.total).toBe(2);
    });

    it('should filter by city', async () => {
      const res = await request(app).get('/api/protests?city=Berlin');

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(1);
      expect(res.body.protests[0].city).toBe('Berlin');
    });

    it('should search by geolocation', async () => {
      // Search near Berlin (52.52, 13.405)
      const res = await request(app).get(
        '/api/protests?lat=52.52&lon=13.405&radius=10'
      );

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBeGreaterThan(0);
      expect(res.body.protests[0].coordinates).toBeDefined();
      expect(res.body.protests[0].coordinates.lat).toBeCloseTo(52.516275, 1);
    });

    it('should not find protests outside radius', async () => {
      // Search near Hamburg (53.55, 9.99) - far from test protests
      const res = await request(app).get(
        '/api/protests?lat=53.55&lon=9.99&radius=50'
      );

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(0);
    });
  });

  describe('GET /api/protests - Comprehensive Filter Tests', () => {
    beforeEach(async () => {
      // Clear existing protests and add comprehensive test data
      await db.collection('protests').deleteMany({});

      await db.collection<Protest>('protests').insertMany([
        // German protests
        {
          source: 'www.berlin.de',
          city: 'Berlin',
          country: 'DE',
          language: 'de-DE',
          title: 'Climate Protest Berlin',
          start: new Date('2025-10-15T14:00:00Z'),
          end: null,
          location: 'Brandenburger Tor',
          geoLocation: {
            type: 'Point',
            coordinates: [13.377704, 52.516275],
          },
          url: 'https://example.com/berlin1',
          attendees: 1000,
          verified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          source: 'www.friedenskooperative.de',
          city: 'Munich',
          country: 'DE',
          language: 'de-DE',
          title: 'Peace March Munich',
          start: new Date('2025-11-01T15:00:00Z'),
          end: null,
          location: 'Marienplatz',
          geoLocation: {
            type: 'Point',
            coordinates: [11.576124, 48.137154],
          },
          url: 'https://example.com/munich1',
          attendees: 500,
          verified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        // Austrian protest
        {
          source: 'www.example.at',
          city: 'Vienna',
          country: 'AT',
          language: 'de-AT',
          title: 'Democracy Rally Vienna',
          start: new Date('2025-10-20T16:00:00Z'),
          end: null,
          location: 'Stephansplatz',
          geoLocation: {
            type: 'Point',
            coordinates: [16.373064, 48.208176],
          },
          url: 'https://example.com/vienna1',
          attendees: 300,
          verified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        // Unverified protest
        {
          source: 'user-submission',
          city: 'Dresden',
          country: 'DE',
          language: 'de-DE',
          title: 'Unverified Protest Dresden',
          start: new Date('2025-10-25T17:00:00Z'),
          end: null,
          location: 'Altmarkt',
          url: 'https://example.com/dresden1',
          attendees: 200,
          verified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        // December protest (outside October range)
        {
          source: 'www.berlin.de',
          city: 'Berlin',
          country: 'DE',
          language: 'de-DE',
          title: 'December Protest',
          start: new Date('2025-12-05T14:00:00Z'),
          end: null,
          location: 'Alexanderplatz',
          url: 'https://example.com/berlin2',
          attendees: 800,
          verified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    });

    it('should filter by source', async () => {
      const res = await request(app).get('/api/protests?source=www.berlin.de');

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(2);
      expect(res.body.protests.every((p: any) => p.source === 'www.berlin.de')).toBe(true);
    });

    it('should filter by country code (case-insensitive)', async () => {
      const res = await request(app).get('/api/protests?country=de');

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(3); // Berlin, Munich, December (excludes unverified Dresden)
      expect(res.body.protests.every((p: any) => p.country === 'DE')).toBe(true);
    });

    it('should filter by country code uppercase', async () => {
      const res = await request(app).get('/api/protests?country=AT');

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(1);
      expect(res.body.protests[0].country).toBe('AT');
      expect(res.body.protests[0].city).toBe('Vienna');
    });

    it('should filter by language', async () => {
      const res = await request(app).get('/api/protests?language=de-AT');

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(1);
      expect(res.body.protests[0].language).toBe('de-AT');
      expect(res.body.protests[0].city).toBe('Vienna');
    });

    it('should filter by explicit date range', async () => {
      const res = await request(app).get(
        '/api/protests?startDate=2025-10-15&endDate=2025-10-31'
      );

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(2); // Berlin (Oct 15) and Vienna (Oct 20), excludes unverified Dresden
      expect(res.body.protests.every((p: any) => {
        const start = new Date(p.start);
        return start >= new Date('2025-10-15') && start <= new Date('2025-10-31T23:59:59.999Z');
      })).toBe(true);
    });

    it('should filter by start date only', async () => {
      const res = await request(app).get('/api/protests?startDate=2025-11-01');

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(2); // Munich (Nov 1) and Berlin (Dec 5)
      expect(res.body.protests.every((p: any) => {
        const start = new Date(p.start);
        return start >= new Date('2025-11-01');
      })).toBe(true);
    });

    it('should filter by end date only', async () => {
      const res = await request(app).get('/api/protests?endDate=2025-10-20');

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(2); // Berlin (Oct 15) and Vienna (Oct 20)
      expect(res.body.protests.every((p: any) => {
        const start = new Date(p.start);
        return start <= new Date('2025-10-20T23:59:59.999Z');
      })).toBe(true);
    });

    it('should include unverified protests when verified=false', async () => {
      const res = await request(app).get('/api/protests?verified=false');

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(1);
      expect(res.body.protests[0].verified).toBe(false);
      expect(res.body.protests[0].title).toBe('Unverified Protest Dresden');
    });

    it('should combine multiple filters', async () => {
      const res = await request(app).get(
        '/api/protests?country=DE&startDate=2025-10-01&endDate=2025-10-31&source=www.berlin.de'
      );

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(1);
      expect(res.body.protests[0].city).toBe('Berlin');
      expect(res.body.protests[0].title).toBe('Climate Protest Berlin');
    });

    it('should prioritize startDate/endDate over days parameter', async () => {
      // Add a protest for tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await db.collection<Protest>('protests').insertOne({
        source: 'test',
        city: 'Test City',
        country: 'DE',
        title: 'Tomorrow Protest',
        start: tomorrow,
        end: null,
        location: 'Test Location',
        url: 'https://example.com/tomorrow',
        attendees: 100,
        verified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Using both days and explicit dates - explicit dates should win
      const res = await request(app).get(
        '/api/protests?days=365&startDate=2025-10-15&endDate=2025-10-31'
      );

      expect(res.status).toBe(200);
      // Should only return October protests, not the tomorrow protest or December
      const titles = res.body.protests.map((p: any) => p.title);
      expect(titles).not.toContain('Tomorrow Protest');
      expect(titles).not.toContain('December Protest');
    });

    it('should handle geolocation filter with other filters', async () => {
      // Search near Berlin with country filter
      const res = await request(app).get(
        '/api/protests?lat=52.52&lon=13.405&radius=50&country=DE&startDate=2025-10-01&endDate=2025-10-31'
      );

      expect(res.status).toBe(200);
      expect(res.body.protests.length).toBe(1);
      expect(res.body.protests[0].city).toBe('Berlin');
      expect(res.body.protests[0].title).toBe('Climate Protest Berlin');
    });
  });

  describe('POST /api/protests', () => {
    it('should create unverified protest for USER', async () => {
      const res = await request(app)
        .post('/api/protests')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'New Protest',
          city: 'Hamburg',
          location: 'Rathausmarkt',
          start: '2025-12-15T16:00:00Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('pending verification');
      expect(res.body.protest.verified).toBe(false);
    });

    it('should create verified protest for MODERATOR', async () => {
      const res = await request(app)
        .post('/api/protests')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({
          title: 'New Protest',
          city: 'Hamburg',
          location: 'Rathausmarkt',
          start: '2025-12-15T16:00:00Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('verified');
      expect(res.body.protest.verified).toBe(true);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app).post('/api/protests').send({
        title: 'New Protest',
        city: 'Hamburg',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/protests/:id', () => {
    let protestId: string;

    beforeEach(async () => {
      const result = await db.collection('protests').insertOne({
        source: 'Test',
        city: 'Test City',
        title: 'Original Title',
        start: new Date('2025-12-20T10:00:00Z'),
        end: null,
        location: 'Test Location',
        url: 'https://example.com/test',
        attendees: 100,
        verified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      protestId = result.insertedId.toString();
    });

    it('should update protest as MODERATOR', async () => {
      const res = await request(app)
        .put(`/api/protests/${protestId}`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({
          title: 'Updated Title',
          verified: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Protest updated successfully');
      expect(res.body.protest.title).toBe('Updated Title');
      expect(res.body.protest.verified).toBe(true);
    });

    it('should set manuallyEdited flag when updating', async () => {
      const res = await request(app)
        .put(`/api/protests/${protestId}`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({
          title: 'Updated Title',
        });

      expect(res.status).toBe(200);
      expect(res.body.protest.manuallyEdited).toBe(true);

      // Verify in database
      const protest = await db.collection('protests').findOne({ _id: new (await import('mongodb')).ObjectId(protestId) });
      expect(protest?.manuallyEdited).toBe(true);
    });

    it('should reject update from USER', async () => {
      const res = await request(app)
        .put(`/api/protests/${protestId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Updated Title',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/protests/:id', () => {
    let protestId: string;

    beforeEach(async () => {
      const result = await db.collection('protests').insertOne({
        source: 'Test',
        city: 'Test City',
        title: 'To Be Deleted',
        start: new Date('2025-12-20T10:00:00Z'),
        end: null,
        location: 'Test Location',
        url: 'https://example.com/test',
        attendees: 100,
        verified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      protestId = result.insertedId.toString();
    });

    it('should delete protest as ADMIN', async () => {
      const res = await request(app)
        .delete(`/api/protests/${protestId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Protest deleted successfully');
    });

    it('should soft-delete (not remove from database)', async () => {
      await request(app)
        .delete(`/api/protests/${protestId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Verify still exists in database with deleted flag
      const protest = await db.collection('protests').findOne({ _id: new (await import('mongodb')).ObjectId(protestId) });
      expect(protest).toBeDefined();
      expect(protest?.deleted).toBe(true);
      expect(protest?.manuallyEdited).toBe(true);
    });

    it('should exclude deleted protests from GET endpoint', async () => {
      // Delete the protest
      await request(app)
        .delete(`/api/protests/${protestId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Query all protests - deleted one should not appear
      const res = await request(app).get('/api/protests');

      expect(res.status).toBe(200);
      const deletedProtest = res.body.protests.find((p: any) => p.id === protestId);
      expect(deletedProtest).toBeUndefined();
    });

    it('should reject delete from MODERATOR', async () => {
      const res = await request(app)
        .delete(`/api/protests/${protestId}`)
        .set('Authorization', `Bearer ${moderatorToken}`);

      expect(res.status).toBe(403);
    });
  });
});

describe('Export API', () => {
  beforeEach(async () => {
    // Add test protests
    await db.collection<Protest>('protests').insertMany([
      {
        source: 'Test Source',
        city: 'Berlin',
        title: 'Export Test 1',
        start: new Date('2025-12-01T14:00:00Z'),
        end: null,
        location: 'Berlin',
        url: 'https://example.com/1',
        attendees: 100,
        verified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        source: 'Test Source',
        city: 'Munich',
        title: 'Export Test 2',
        start: new Date('2025-12-02T15:00:00Z'),
        end: null,
        location: 'Munich',
        url: 'https://example.com/2',
        attendees: 200,
        verified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  describe('GET /api/export/csv', () => {
    it('should export protests as CSV', async () => {
      const res = await request(app).get('/api/export/csv');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Export Test 1');
      expect(res.text).toContain('Berlin');
    });

    it('should filter CSV export by city', async () => {
      const res = await request(app).get('/api/export/csv?city=Berlin');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Export Test 1');
      expect(res.text).not.toContain('Export Test 2');
    });
  });

  describe('GET /api/export/json', () => {
    it('should export protests as JSON', async () => {
      const res = await request(app).get('/api/export/json');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      const protests = JSON.parse(res.text);
      expect(protests).toBeInstanceOf(Array);
      expect(protests.length).toBe(2);
    });
  });

  describe('GET /api/export/ics', () => {
    it('should export protests as ICS', async () => {
      const res = await request(app).get('/api/export/ics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/calendar');
      expect(res.text).toContain('BEGIN:VCALENDAR');
      expect(res.text).toContain('Export Test 1');
    });
  });

  describe('Deleted protests in exports', () => {
    it('should exclude deleted protests from CSV export', async () => {
      // Mark one protest as deleted
      await db.collection('protests').updateOne(
        { title: 'Export Test 1' },
        { $set: { deleted: true } }
      );

      const res = await request(app).get('/api/export/csv');

      expect(res.status).toBe(200);
      expect(res.text).not.toContain('Export Test 1');
      expect(res.text).toContain('Export Test 2');
    });

    it('should exclude deleted protests from JSON export', async () => {
      // Mark one protest as deleted
      await db.collection('protests').updateOne(
        { title: 'Export Test 1' },
        { $set: { deleted: true } }
      );

      const res = await request(app).get('/api/export/json');

      expect(res.status).toBe(200);
      const protests = JSON.parse(res.text);
      expect(protests.some((p: any) => p.title === 'Export Test 1')).toBe(false);
      expect(protests.some((p: any) => p.title === 'Export Test 2')).toBe(true);
    });
  });

  describe('Export API - Filter Support', () => {
    beforeEach(async () => {
      // Clear and add comprehensive test data
      await db.collection('protests').deleteMany({});

      await db.collection<Protest>('protests').insertMany([
        {
          source: 'www.berlin.de',
          city: 'Berlin',
          country: 'DE',
          language: 'de-DE',
          title: 'Berlin Climate Protest',
          start: new Date('2025-10-15T14:00:00Z'),
          end: null,
          location: 'Brandenburger Tor',
          geoLocation: {
            type: 'Point',
            coordinates: [13.377704, 52.516275],
          },
          url: 'https://example.com/berlin1',
          attendees: 1000,
          verified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          source: 'www.friedenskooperative.de',
          city: 'Munich',
          country: 'DE',
          language: 'de-DE',
          title: 'Munich Peace March',
          start: new Date('2025-11-01T15:00:00Z'),
          end: null,
          location: 'Marienplatz',
          url: 'https://example.com/munich1',
          attendees: 500,
          verified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          source: 'www.example.at',
          city: 'Vienna',
          country: 'AT',
          language: 'de-AT',
          title: 'Vienna Democracy Rally',
          start: new Date('2025-10-20T16:00:00Z'),
          end: null,
          location: 'Stephansplatz',
          url: 'https://example.com/vienna1',
          attendees: 300,
          verified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    });

    describe('CSV export filters', () => {
      it('should filter by source', async () => {
        const res = await request(app).get('/api/export/csv?source=www.berlin.de');

        expect(res.status).toBe(200);
        expect(res.text).toContain('Berlin Climate Protest');
        expect(res.text).not.toContain('Munich Peace March');
      });

      it('should filter by country', async () => {
        const res = await request(app).get('/api/export/csv?country=AT');

        expect(res.status).toBe(200);
        expect(res.text).toContain('Vienna Democracy Rally');
        expect(res.text).not.toContain('Berlin Climate Protest');
      });

      it('should filter by language', async () => {
        const res = await request(app).get('/api/export/csv?language=de-AT');

        expect(res.status).toBe(200);
        expect(res.text).toContain('Vienna Democracy Rally');
        expect(res.text).not.toContain('Berlin Climate Protest');
      });

      it('should filter by date range', async () => {
        const res = await request(app).get(
          '/api/export/csv?startDate=2025-10-15&endDate=2025-10-31'
        );

        expect(res.status).toBe(200);
        expect(res.text).toContain('Berlin Climate Protest');
        expect(res.text).toContain('Vienna Democracy Rally');
        expect(res.text).not.toContain('Munich Peace March'); // Nov 1
      });

      it('should combine multiple filters', async () => {
        const res = await request(app).get(
          '/api/export/csv?country=DE&startDate=2025-10-01&endDate=2025-10-31'
        );

        expect(res.status).toBe(200);
        expect(res.text).toContain('Berlin Climate Protest');
        expect(res.text).not.toContain('Munich Peace March'); // Outside date range
        expect(res.text).not.toContain('Vienna Democracy Rally'); // Wrong country
      });
    });

    describe('JSON export filters', () => {
      it('should filter by source', async () => {
        const res = await request(app).get('/api/export/json?source=www.friedenskooperative.de');

        expect(res.status).toBe(200);
        const protests = JSON.parse(res.text);
        expect(protests.length).toBe(1);
        expect(protests[0].title).toBe('Munich Peace March');
      });

      it('should filter by country and date range', async () => {
        const res = await request(app).get(
          '/api/export/json?country=DE&startDate=2025-10-01&endDate=2025-10-31'
        );

        expect(res.status).toBe(200);
        const protests = JSON.parse(res.text);
        expect(protests.length).toBe(1);
        expect(protests[0].title).toBe('Berlin Climate Protest');
      });
    });

    describe('ICS export filters', () => {
      it('should filter by country', async () => {
        const res = await request(app).get('/api/export/ics?country=AT');

        expect(res.status).toBe(200);
        expect(res.text).toContain('BEGIN:VCALENDAR');
        expect(res.text).toContain('Vienna Democracy Rally');
        expect(res.text).not.toContain('Berlin Climate Protest');
      });

      it('should filter by date range', async () => {
        const res = await request(app).get(
          '/api/export/ics?startDate=2025-10-15&endDate=2025-10-31'
        );

        expect(res.status).toBe(200);
        expect(res.text).toContain('Berlin Climate Protest');
        expect(res.text).toContain('Vienna Democracy Rally');
        expect(res.text).not.toContain('Munich Peace March');
      });

      it('should combine source and language filters', async () => {
        const res = await request(app).get(
          '/api/export/ics?language=de-DE&source=www.berlin.de'
        );

        expect(res.status).toBe(200);
        expect(res.text).toContain('Berlin Climate Protest');
        expect(res.text).not.toContain('Munich Peace March'); // Different source
        expect(res.text).not.toContain('Vienna Democracy Rally'); // Different language
      });
    });
  });
});
