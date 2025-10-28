import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { Protest } from '@/types/protest.js';
import { cleanupDuplicates } from '@/scripts/cleanup-duplicates.js';

describe('Cleanup duplicates script', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let protests: Collection<Protest>;

  beforeEach(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGODB_URI = uri;

    client = new MongoClient(uri);
    await client.connect();
    db = client.db('test');
    protests = db.collection<Protest>('protests');
  });

  afterAll(async () => {
    if (client) await client.close();
    if (mongod) await mongod.stop();
  });

  it('should find and remove duplicates with date changed by 1 day', async () => {
    const baseDate = new Date('2025-11-15T14:00:00Z');
    const oneDayLater = new Date('2025-11-16T14:00:00Z');

    // Insert original event
    const original: Partial<Protest> = {
      _id: new ObjectId(),
      url: 'https://example.com/event1',
      title: 'Climate March',
      city: 'Berlin',
      source: 'example.com',
      start: baseDate,
      country: 'DE',
      language: 'de-DE',
      location: 'Brandenburg Gate',
      attendees: null,
      verified: true,
      createdAt: new Date('2025-11-01T10:00:00Z'), // Older
      updatedAt: new Date('2025-11-01T10:00:00Z'),
    };

    // Insert duplicate (1 day later, created more recently)
    const duplicate: Partial<Protest> = {
      _id: new ObjectId(),
      url: 'https://example.com/event1',
      title: 'Climate March',
      city: 'Berlin',
      source: 'example.com',
      start: oneDayLater,
      country: 'DE',
      language: 'de-DE',
      location: 'Brandenburg Gate',
      attendees: null,
      verified: true,
      createdAt: new Date('2025-11-02T10:00:00Z'), // Newer
      updatedAt: new Date('2025-11-02T10:00:00Z'),
    };

    await protests.insertMany([original as Protest, duplicate as Protest]);

    // Run cleanup
    const result = await cleanupDuplicates(false);

    expect(result.totalEvents).toBe(2);
    expect(result.duplicatesFound).toBe(1);
    expect(result.eventsDeleted).toBe(1);

    // Verify only original remains
    const remaining = await protests.find({}).toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]._id.toString()).toBe(original._id!.toString());
  });

  it('should NOT remove recurring events 7 days apart', async () => {
    const firstDate = new Date('2025-11-15T18:00:00Z');
    const secondDate = new Date('2025-11-22T18:00:00Z'); // 7 days later

    const first: Partial<Protest> = {
      _id: new ObjectId(),
      url: 'https://example.com/weekly-vigil',
      title: 'Peace Vigil',
      city: 'Hamburg',
      source: 'example.com',
      start: firstDate,
      country: 'DE',
      language: 'de-DE',
      location: 'Rathausmarkt',
      attendees: null,
      verified: true,
      createdAt: new Date('2025-11-01T10:00:00Z'),
      updatedAt: new Date('2025-11-01T10:00:00Z'),
    };

    const second: Partial<Protest> = {
      _id: new ObjectId(),
      url: 'https://example.com/weekly-vigil',
      title: 'Peace Vigil',
      city: 'Hamburg',
      source: 'example.com',
      start: secondDate,
      country: 'DE',
      language: 'de-DE',
      location: 'Rathausmarkt',
      attendees: null,
      verified: true,
      createdAt: new Date('2025-11-08T10:00:00Z'),
      updatedAt: new Date('2025-11-08T10:00:00Z'),
    };

    await protests.insertMany([first as Protest, second as Protest]);

    // Run cleanup
    const result = await cleanupDuplicates(false);

    expect(result.totalEvents).toBe(2);
    expect(result.duplicatesFound).toBe(0); // Should NOT find duplicates
    expect(result.eventsDeleted).toBe(0);

    // Verify both remain
    const remaining = await protests.find({}).toArray();
    expect(remaining).toHaveLength(2);
  });

  it('should merge manual edits from duplicate before deleting', async () => {
    const baseDate = new Date('2025-11-20T12:00:00Z');
    const twoDaysLater = new Date('2025-11-22T12:00:00Z');

    // Original event without edits
    const original: Partial<Protest> = {
      _id: new ObjectId(),
      url: 'https://example.com/event2',
      title: 'Strike Action',
      city: 'München',
      source: 'example.com',
      start: baseDate,
      location: 'Marienplatz',
      country: 'DE',
      language: 'de-DE',
      attendees: null,
      verified: true,
      createdAt: new Date('2025-11-01T10:00:00Z'),
      updatedAt: new Date('2025-11-01T10:00:00Z'),
    };

    // Duplicate with manual edits (same title, but other fields edited)
    const duplicateWithEdits: Partial<Protest> = {
      _id: new ObjectId(),
      url: 'https://example.com/event2',
      title: 'Strike Action', // Same title (title changes would be a different event)
      city: 'München',
      source: 'example.com',
      start: twoDaysLater,
      location: 'Marienplatz - Updated', // Manually edited
      country: 'DE',
      language: 'de-DE',
      attendees: 500, // Manually edited
      verified: true,
      manuallyEdited: true,
      editedFields: ['location', 'attendees'],
      createdAt: new Date('2025-11-02T10:00:00Z'),
      updatedAt: new Date('2025-11-10T15:00:00Z'),
    };

    await protests.insertMany([original as Protest, duplicateWithEdits as Protest]);

    // Run cleanup
    const result = await cleanupDuplicates(false);

    expect(result.duplicatesFound).toBe(1);
    expect(result.eventsDeleted).toBe(1);

    // Verify original has merged edits
    const remaining = await protests.findOne({ _id: original._id });
    expect(remaining).toBeDefined();
    expect(remaining?.title).toBe('Strike Action'); // Title unchanged
    expect(remaining?.location).toBe('Marienplatz - Updated'); // Merged from duplicate
    expect(remaining?.attendees).toBe(500); // Merged from duplicate
    expect(remaining?.manuallyEdited).toBe(true);
    expect(remaining?.editedFields).toContain('location');
    expect(remaining?.editedFields).toContain('attendees');
  });

  it('should skip deleted events', async () => {
    const baseDate = new Date('2025-11-25T10:00:00Z');

    const deletedEvent: Partial<Protest> = {
      _id: new ObjectId(),
      url: 'https://example.com/event3',
      title: 'Cancelled Event',
      city: 'Köln',
      source: 'example.com',
      start: baseDate,
      country: 'DE',
      language: 'de-DE',
      location: 'Domplatte',
      attendees: null,
      verified: true,
      deleted: true, // Soft deleted
      createdAt: new Date('2025-11-01T10:00:00Z'),
      updatedAt: new Date('2025-11-01T10:00:00Z'),
    };

    await protests.insertOne(deletedEvent as Protest);

    // Run cleanup
    const result = await cleanupDuplicates(false);

    expect(result.totalEvents).toBe(0); // Should not check deleted events
    expect(result.duplicatesFound).toBe(0);
  });

  it('should skip fully manual events', async () => {
    const baseDate = new Date('2025-11-30T14:00:00Z');

    const fullyManualEvent: Partial<Protest> = {
      _id: new ObjectId(),
      url: 'https://example.com/manual-event',
      title: 'Manual Event',
      city: 'Dresden',
      source: 'example.com',
      start: baseDate,
      country: 'DE',
      language: 'de-DE',
      location: 'Altmarkt',
      attendees: null,
      verified: true,
      fullyManual: true, // Fully manual
      createdAt: new Date('2025-11-01T10:00:00Z'),
      updatedAt: new Date('2025-11-01T10:00:00Z'),
    };

    await protests.insertOne(fullyManualEvent as Protest);

    // Run cleanup
    const result = await cleanupDuplicates(false);

    expect(result.totalEvents).toBe(0); // Should not check fully manual events
    expect(result.duplicatesFound).toBe(0);
  });

  it('should handle dry run without making changes', async () => {
    const baseDate = new Date('2025-12-01T14:00:00Z');
    const oneDayLater = new Date('2025-12-02T14:00:00Z');

    const original: Partial<Protest> = {
      _id: new ObjectId(),
      url: 'https://example.com/event4',
      title: 'Demo',
      city: 'Frankfurt',
      source: 'example.com',
      start: baseDate,
      country: 'DE',
      language: 'de-DE',
      location: 'Römerberg',
      attendees: null,
      verified: true,
      createdAt: new Date('2025-11-01T10:00:00Z'),
      updatedAt: new Date('2025-11-01T10:00:00Z'),
    };

    const duplicate: Partial<Protest> = {
      _id: new ObjectId(),
      url: 'https://example.com/event4',
      title: 'Demo',
      city: 'Frankfurt',
      source: 'example.com',
      start: oneDayLater,
      country: 'DE',
      language: 'de-DE',
      location: 'Römerberg',
      attendees: null,
      verified: true,
      createdAt: new Date('2025-11-02T10:00:00Z'),
      updatedAt: new Date('2025-11-02T10:00:00Z'),
    };

    await protests.insertMany([original as Protest, duplicate as Protest]);

    // Run cleanup in dry-run mode
    const result = await cleanupDuplicates(true);

    expect(result.duplicatesFound).toBe(1);
    expect(result.eventsDeleted).toBe(0); // Should NOT delete in dry run

    // Verify both still exist
    const remaining = await protests.find({}).toArray();
    expect(remaining).toHaveLength(2);
  });
});
