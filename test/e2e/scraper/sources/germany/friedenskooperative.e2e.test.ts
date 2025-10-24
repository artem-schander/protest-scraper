import { describe, it, expect } from 'vitest';
import { parseFriedenskooperative } from '@/scraper/sources/germany/friedenskooperative.js';
import type { ProtestEvent } from '@/scraper/scrape-protests.js';

/**
 * E2E Tests for Friedenskooperative Parser
 *
 * These tests make REAL API calls to the Friedenskooperative server.
 * They validate that the parser still works against the live API.
 *
 * Note: These tests may fail if:
 * - The Friedenskooperative website is down
 * - The API/HTML structure changes
 * - Network connectivity issues
 *
 * Run with: yarn test:e2e
 */
describe('Friedenskooperative Parser - E2E (Real API)', () => {
  it('should successfully fetch and parse real events from Friedenskooperative', async () => {
    const events: ProtestEvent[] = await parseFriedenskooperative(90);

    // Should return an array (may be empty if no events in next 90 days)
    expect(Array.isArray(events)).toBe(true);

    // If there are events, validate structure
    if (events.length > 0) {
      const event: ProtestEvent = events[0];

      // Required fields
      expect(event).toHaveProperty('source');
      expect(event.source).toBe('www.friedenskooperative.de');
      expect(event).toHaveProperty('title');
      expect(event.title).toBeTruthy();
      expect(event).toHaveProperty('start');
      expect(event.start).toBeTruthy();
      expect(event).toHaveProperty('country');
      expect(event.country).toBe('DE');
      expect(event).toHaveProperty('url');

      // Validate date is parseable
      const startDate: Date = new Date(event.start!);
      expect(startDate.toString()).not.toBe('Invalid Date');

      // Check if categories are present (Friedenskooperative uses categories)
      if (event.categories && event.categories.length > 0) {
        console.log(`  Categories: ${event.categories.join(', ')}`);
      }

      console.log(`✓ Successfully parsed ${events.length} events from Friedenskooperative`);
      console.log(`  Example: "${event.title}" on ${startDate.toLocaleDateString()}`);
      if (event.city) {
        console.log(`  Location: ${event.city}`);
      }
    } else {
      console.log('⚠ No events returned from Friedenskooperative (may be expected if no upcoming events)');
    }
  }, 60000); // 60 second timeout - Friedenskooperative loops through categories

  it('should parse events from multiple categories', async () => {
    const events: ProtestEvent[] = await parseFriedenskooperative(90);

    if (events.length > 0) {
      // Count events by category
      const categoryCounts: Record<string, number> = events.reduce((acc: Record<string, number>, event: ProtestEvent) => {
        if (event.categories && event.categories.length > 0) {
          event.categories.forEach((cat: string) => {
            acc[cat] = (acc[cat] || 0) + 1;
          });
        }
        return acc;
      }, {});

      console.log('  Events by category:');
      Object.entries(categoryCounts).forEach(([cat, count]: [string, number]) => {
        console.log(`    ${cat}: ${count}`);
      });

      // Validate all events have valid dates
      events.forEach((event: ProtestEvent) => {
        const startDate: Date = new Date(event.start!);
        expect(startDate.toString()).not.toBe('Invalid Date');
      });
    }
  }, 60000);

  it('should handle different event types correctly', async () => {
    const events: ProtestEvent[] = await parseFriedenskooperative(90);

    if (events.length > 0) {
      // Expected categories from Friedenskooperative
      const expectedCategories: string[] = [
        'Demonstration',
        'Mahnwache',
        'Regierungsereignis',
        'Gegendemonstration',
        'Blockade'
      ];

      const foundCategories: Set<string> = new Set<string>();
      events.forEach((event: ProtestEvent) => {
        if (event.categories) {
          event.categories.forEach((cat: string) => foundCategories.add(cat));
        }
      });

      console.log(`  Found category types: ${Array.from(foundCategories).join(', ')}`);

      // At least some categories should match expected ones
      const hasExpectedCategory: boolean = Array.from(foundCategories).some((cat: string) =>
        expectedCategories.includes(cat)
      );
      expect(hasExpectedCategory).toBe(true);
    }
  }, 60000);
});
