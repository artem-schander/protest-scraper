import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db, Collection } from 'mongodb';
import { Protest } from '@/types/protest.js';

describe('Import fuzzy date matching', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let protests: Collection<Protest>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('test');
    protests = db.collection<Protest>('protests');
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  it('should match event with date changed by 1 day (rescheduled)', async () => {
    // Insert original event
    const originalEvent: Partial<Protest> = {
      url: 'https://example.com/event1',
      title: 'Climate March',
      city: 'Berlin',
      source: 'example.com',
      start: new Date('2025-11-01T14:00:00Z'),
      country: 'DE',
      language: 'de-DE',
      location: 'Potsdamer Platz',
      attendees: null,
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await protests.insertOne(originalEvent as Protest);

    // Try to find with date changed by 1 day (within ±3 days)
    const newDate = new Date('2025-11-02T14:00:00Z');
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    const found = await protests.findOne({
      url: 'https://example.com/event1',
      title: 'Climate March',
      city: 'Berlin',
      source: 'example.com',
      start: {
        $gte: new Date(newDate.getTime() - threeDaysMs),
        $lte: new Date(newDate.getTime() + threeDaysMs),
      },
    });

    expect(found).toBeDefined();
    expect(found?.title).toBe('Climate March');
  });

  it('should NOT match recurring event 7 days apart', async () => {
    // Insert first occurrence
    const firstOccurrence: Partial<Protest> = {
      url: 'https://example.com/weekly-vigil',
      title: 'Peace Vigil',
      city: 'Hamburg',
      source: 'example.com',
      start: new Date('2025-11-01T18:00:00Z'),
      country: 'DE',
      language: 'de-DE',
      location: 'Rathausmarkt',
      attendees: null,
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await protests.insertOne(firstOccurrence as Protest);

    // Try to find with date 7 days later (outside ±3 days window)
    const secondDate = new Date('2025-11-08T18:00:00Z');
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    const found = await protests.findOne({
      url: 'https://example.com/weekly-vigil',
      title: 'Peace Vigil',
      city: 'Hamburg',
      source: 'example.com',
      start: {
        $gte: new Date(secondDate.getTime() - threeDaysMs),
        $lte: new Date(secondDate.getTime() + threeDaysMs),
      },
    });

    expect(found).toBeNull();
  });

  it('should match event with date changed by 3 days (edge case)', async () => {
    const originalEvent: Partial<Protest> = {
      url: 'https://example.com/event2',
      title: 'Strike Action',
      city: 'München',
      source: 'example.com',
      start: new Date('2025-11-05T10:00:00Z'),
      country: 'DE',
      language: 'de-DE',
      location: 'Marienplatz',
      attendees: null,
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await protests.insertOne(originalEvent as Protest);

    // Try to find with date changed by exactly 3 days
    const newDate = new Date('2025-11-08T10:00:00Z');
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    const found = await protests.findOne({
      url: 'https://example.com/event2',
      title: 'Strike Action',
      city: 'München',
      source: 'example.com',
      start: {
        $gte: new Date(newDate.getTime() - threeDaysMs),
        $lte: new Date(newDate.getTime() + threeDaysMs),
      },
    });

    expect(found).toBeDefined();
    expect(found?.title).toBe('Strike Action');
  });

  it('should NOT match event with different title', async () => {
    const originalEvent: Partial<Protest> = {
      url: 'https://example.com/event3',
      title: 'Demo for Climate',
      city: 'Köln',
      source: 'example.com',
      start: new Date('2025-11-10T14:00:00Z'),
      country: 'DE',
      language: 'de-DE',
      location: 'Domplatte',
      attendees: null,
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await protests.insertOne(originalEvent as Protest);

    // Try to find with same date but different title
    const newDate = new Date('2025-11-10T14:00:00Z');
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    const found = await protests.findOne({
      url: 'https://example.com/event3',
      title: 'Different Event Title', // Different title
      city: 'Köln',
      source: 'example.com',
      start: {
        $gte: new Date(newDate.getTime() - threeDaysMs),
        $lte: new Date(newDate.getTime() + threeDaysMs),
      },
    });

    expect(found).toBeNull();
  });

  it('should NOT match event with different URL', async () => {
    const originalEvent: Partial<Protest> = {
      url: 'https://example.com/event4',
      title: 'Workers Rights March',
      city: 'Dresden',
      source: 'example.com',
      start: new Date('2025-11-12T12:00:00Z'),
      country: 'DE',
      language: 'de-DE',
      location: 'Altmarkt',
      attendees: null,
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await protests.insertOne(originalEvent as Protest);

    // Try to find with same title/date but different URL
    const newDate = new Date('2025-11-12T12:00:00Z');
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    const found = await protests.findOne({
      url: 'https://example.com/different-event', // Different URL
      title: 'Workers Rights March',
      city: 'Dresden',
      source: 'example.com',
      start: {
        $gte: new Date(newDate.getTime() - threeDaysMs),
        $lte: new Date(newDate.getTime() + threeDaysMs),
      },
    });

    expect(found).toBeNull();
  });

  it('should handle events without start date', async () => {
    const originalEvent: Partial<Protest> = {
      url: 'https://example.com/event5',
      title: 'TBA Event',
      city: 'Frankfurt',
      source: 'example.com',
      start: null,
      country: 'DE',
      language: 'de-DE',
      location: 'Römerberg',
      attendees: null,
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await protests.insertOne(originalEvent as Protest);

    // Try to find without date constraint
    const found = await protests.findOne({
      url: 'https://example.com/event5',
      title: 'TBA Event',
      city: 'Frankfurt',
      source: 'example.com',
    });

    expect(found).toBeDefined();
    expect(found?.title).toBe('TBA Event');
    expect(found?.start).toBeNull();
  });
});
