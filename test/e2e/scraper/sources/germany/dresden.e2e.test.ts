import { describe, it, expect } from 'vitest';
import { parseDresdenCity } from '@/scraper/sources/germany/dresden.js';
import type { ProtestEvent } from '@/scraper/scrape-protests.js';

/**
 * E2E Tests for Dresden City Parser
 *
 * These tests make REAL API calls to the Dresden City server.
 * They validate that the parser still works against the live API.
 *
 * Note: These tests may fail if:
 * - The Dresden API is down
 * - The API structure changes
 * - Network connectivity issues
 *
 * Run with: yarn test:e2e
 */
describe('Dresden City Parser - E2E (Real API)', () => {
  it('should successfully fetch and parse real events from Dresden API', async () => {
    const events: ProtestEvent[] = await parseDresdenCity(90);

    // Should return an array (may be empty if no events in next 90 days)
    expect(Array.isArray(events)).toBe(true);

    // If there are events, validate structure
    if (events.length > 0) {
      const event: ProtestEvent = events[0];

      // Required fields
      expect(event).toHaveProperty('source');
      expect(event.source).toBe('www.dresden.de');
      expect(event).toHaveProperty('city');
      expect(event.city).toBe('Dresden');
      expect(event).toHaveProperty('country');
      expect(event.country).toBe('DE');
      expect(event).toHaveProperty('title');
      expect(event.title).toBeTruthy();
      expect(event).toHaveProperty('start');
      expect(event.start).toBeTruthy();
      expect(event).toHaveProperty('location');
      expect(event).toHaveProperty('url');

      // Verify status-based verification is working
      expect(event).toHaveProperty('verified');
      expect(typeof event.verified).toBe('boolean');
      expect(event).toHaveProperty('shouldDelete');
      expect(typeof event.shouldDelete).toBe('boolean');

      // Validate date is parseable
      const startDate: Date = new Date(event.start!);
      expect(startDate.toString()).not.toBe('Invalid Date');

      console.log(`✓ Successfully parsed ${events.length} events from Dresden API`);
      console.log(`  Example: "${event.title}" on ${startDate.toLocaleDateString()}`);
      console.log(`  Verified: ${event.verified}, Should Delete: ${event.shouldDelete}`);
    } else {
      console.log('⚠ No events returned from Dresden API (may be expected if no upcoming events)');
    }
  }, 30000); // 30 second timeout for real API call

  it('should handle verified status correctly for real events', async () => {
    const events: ProtestEvent[] = await parseDresdenCity(90);

    if (events.length > 0) {
      // Find events with different statuses
      const verifiedEvents: ProtestEvent[] = events.filter((e: ProtestEvent) => e.verified === true);
      const unverifiedEvents: ProtestEvent[] = events.filter((e: ProtestEvent) => e.verified === false && !e.shouldDelete);
      const deletableEvents: ProtestEvent[] = events.filter((e: ProtestEvent) => e.shouldDelete === true);

      console.log(`  Verified (beschieden): ${verifiedEvents.length}`);
      console.log(`  Unverified (angemeldet): ${unverifiedEvents.length}`);
      console.log(`  Marked for deletion: ${deletableEvents.length}`);

      // At least one category should have events (unless all are deleted)
      expect(verifiedEvents.length + unverifiedEvents.length + deletableEvents.length).toBeGreaterThan(0);

      // Verify that verified and shouldDelete are never both true
      events.forEach((event: ProtestEvent) => {
        if (event.shouldDelete) {
          expect(event.verified).toBe(false);
        }
      });
    }
  }, 30000);
});
