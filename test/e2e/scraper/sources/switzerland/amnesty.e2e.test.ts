/**
 * E2E tests for Amnesty International Switzerland parser
 * Makes real API calls to validate parser works with live data
 *
 * NOTE: These tests call the real website and may fail if:
 * - The site is down or unreachable
 * - The site structure has changed
 * - Cloudflare blocks the request (rate limiting)
 * - There are no upcoming events
 *
 * Run with: yarn test:e2e
 */

import { describe, it, expect } from 'vitest';
import { parseAmnestySwiss } from '@/scraper/sources/switzerland/amnesty.js';

describe('Amnesty International Switzerland Parser (E2E)', () => {
  it('should fetch and parse real events from live website', async () => {
    // Set longer timeout for network request
    const events = await parseAmnestySwiss(90);

    // Should find at least some events (or zero if legitimately none scheduled)
    expect(Array.isArray(events)).toBe(true);

    if (events.length > 0) {
      console.log(`Found ${events.length} events from Amnesty Switzerland`);

      // Validate first event structure
      const firstEvent = events[0];

      expect(firstEvent).toHaveProperty('source', 'www.amnesty.ch');
      expect(firstEvent).toHaveProperty('country', 'CH');
      expect(firstEvent).toHaveProperty('language', 'de-CH');
      expect(firstEvent).toHaveProperty('title');
      expect(firstEvent).toHaveProperty('city');
      expect(firstEvent).toHaveProperty('start');
      expect(firstEvent).toHaveProperty('url');

      // Title should not be empty
      expect(firstEvent.title).toBeTruthy();
      expect(typeof firstEvent.title).toBe('string');

      // City should not be empty
      expect(firstEvent.city).toBeTruthy();
      expect(typeof firstEvent.city).toBe('string');

      // Start date should be valid ISO string
      expect(firstEvent.start).toBeTruthy();
      const date = new Date(firstEvent.start!);
      expect(date.toString()).not.toBe('Invalid Date');

      // URL should be valid
      expect(firstEvent.url).toBeTruthy();
      expect(firstEvent.url).toMatch(/^https?:\/\//);

      // Should not have "Verschiedene Städte"
      expect(firstEvent.city?.toLowerCase()).not.toContain('verschieden');

      console.log('Sample event:', {
        title: firstEvent.title,
        city: firstEvent.city,
        start: firstEvent.start,
        timeKnown: firstEvent.startTimeKnown,
      });
    } else {
      console.log('No events found (may be legitimate if calendar is empty)');
    }
  }, 30000); // 30 second timeout for network request

  it('should not include "Verschiedene Städte" events', async () => {
    const events = await parseAmnestySwiss(90);

    const hasVariousCities = events.some(e =>
      e.city?.toLowerCase().includes('verschieden')
    );

    expect(hasVariousCities).toBe(false);
  }, 30000);

  it('should parse dates correctly', async () => {
    const events = await parseAmnestySwiss(90);

    if (events.length > 0) {
      events.forEach(event => {
        // All events should have valid dates
        expect(event.start).toBeTruthy();

        const date = new Date(event.start!);
        expect(date.toString()).not.toBe('Invalid Date');

        // Dates should be in the future (within 90 days from now)
        const now = new Date();
        const maxDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

        expect(date.getTime()).toBeGreaterThanOrEqual(now.getTime() - 24 * 60 * 60 * 1000); // Allow 1 day grace
        expect(date.getTime()).toBeLessThanOrEqual(maxDate.getTime());
      });
    }
  }, 30000);

  it('should have consistent metadata across all events', async () => {
    const events = await parseAmnestySwiss(90);

    if (events.length > 0) {
      events.forEach(event => {
        expect(event.source).toBe('www.amnesty.ch');
        expect(event.country).toBe('CH');
        expect(event.language).toBe('de-CH');
        expect(event.categories).toContain('Demonstration');
      });
    }
  }, 30000);
});
