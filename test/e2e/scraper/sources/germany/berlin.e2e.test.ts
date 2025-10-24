import { describe, it, expect } from 'vitest';
import { parseBerlinPolice } from '@/scraper/sources/germany/berlin.js';
import type { ProtestEvent } from '@/scraper/scrape-protests.js';

/**
 * E2E Tests for Berlin Police Parser
 *
 * These tests make REAL API calls to the Berlin Police server.
 * They validate that the parser still works against the live API.
 *
 * Note: These tests may fail if:
 * - The Berlin Police website is down
 * - The HTML structure changes
 * - Network connectivity issues
 *
 * Run with: yarn test:e2e
 */
describe('Berlin Police Parser - E2E (Real API)', () => {
  it('should successfully fetch and parse real events from Berlin Police', async () => {
    const events: ProtestEvent[] = await parseBerlinPolice(90);

    // Should return an array (may be empty if no events in next 90 days)
    expect(Array.isArray(events)).toBe(true);

    // If there are events, validate structure
    if (events.length > 0) {
      const event: ProtestEvent = events[0];

      // Required fields
      expect(event).toHaveProperty('source');
      expect(event.source).toBe('www.berlin.de');
      expect(event).toHaveProperty('city');
      expect(event.city).toBe('Berlin');
      expect(event).toHaveProperty('country');
      expect(event.country).toBe('DE');
      expect(event).toHaveProperty('title');
      expect(event.title).toBeTruthy();
      expect(event).toHaveProperty('start');
      expect(event.start).toBeTruthy();
      expect(event).toHaveProperty('location');
      expect(event).toHaveProperty('url');

      // Validate date is parseable
      const startDate: Date = new Date(event.start!);
      expect(startDate.toString()).not.toBe('Invalid Date');

      // Berlin parser should extract postal codes if present
      if (event.location) {
        // Check if location is reasonable (not just "Berlin")
        expect(event.location.length).toBeGreaterThan(6);
      }

      console.log(`✓ Successfully parsed ${events.length} events from Berlin Police`);
      console.log(`  Example: "${event.title}" on ${startDate.toLocaleDateString()}`);
      if (event.attendees) {
        console.log(`  Expected attendees: ${event.attendees}`);
      }
    } else {
      console.log('⚠ No events returned from Berlin Police (may be expected if no upcoming events)');
    }
  }, 30000); // 30 second timeout for real API call

  it('should parse valid dates and locations', async () => {
    const events: ProtestEvent[] = await parseBerlinPolice(90);

    if (events.length > 0) {
      // Validate all events have valid dates
      events.forEach((event: ProtestEvent) => {
        const startDate: Date = new Date(event.start!);
        expect(startDate.toString()).not.toBe('Invalid Date');

        // All events should have location
        expect(event.location).toBeTruthy();

        // All events should be in Berlin
        expect(event.city).toBe('Berlin');
        expect(event.country).toBe('DE');
      });

      console.log(`  All ${events.length} events have valid dates and locations`);
    }
  }, 30000);
});
