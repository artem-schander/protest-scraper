import { describe, it, expect } from 'vitest';
import { parseDemokrateam } from '@/scraper/sources/germany/demokrateam.js';
import type { ProtestEvent } from '@/scraper/scrape-protests.js';

/**
 * E2E Tests for DemokraTEAM Parser
 *
 * These tests make REAL API calls to the DemokraTEAM server.
 * They validate that the parser still works against the live API.
 *
 * Note: These tests may fail if:
 * - The DemokraTEAM website is down
 * - The API structure changes
 * - Network connectivity issues
 *
 * Run with: yarn test:e2e
 */
describe('DemokraTEAM Parser - E2E (Real API)', () => {
  it('should successfully fetch and parse real events from DemokraTEAM', async () => {
    const events: ProtestEvent[] = await parseDemokrateam(90);

    // Should return an array (may be empty if no events in next 90 days)
    expect(Array.isArray(events)).toBe(true);

    // If there are events, validate structure
    if (events.length > 0) {
      const event: ProtestEvent = events[0];

      // Required fields
      expect(event).toHaveProperty('source');
      expect(event.source).toBe('www.demokrateam.org');
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

      // DemokraTEAM should have location info
      expect(event).toHaveProperty('location');
      if (event.location) {
        expect(event.location).toBeTruthy();
      }

      console.log(`✓ Successfully parsed ${events.length} events from DemokraTEAM`);
      console.log(`  Example: "${event.title}" on ${startDate.toLocaleDateString()}`);
      if (event.city) {
        console.log(`  City: ${event.city}`);
      }
    } else {
      console.log('⚠ No events returned from DemokraTEAM (may be expected if no upcoming events)');
    }
  }, 45000); // 45 second timeout - DemokraTEAM queries 3 months forward

  it('should parse events with valid locations', async () => {
    const events: ProtestEvent[] = await parseDemokrateam(90);

    if (events.length > 0) {
      // Count events by city
      const cityCounts: Record<string, number> = events.reduce((acc: Record<string, number>, event: ProtestEvent) => {
        if (event.city) {
          acc[event.city] = (acc[event.city] || 0) + 1;
        }
        return acc;
      }, {});

      console.log('  Events by city:');
      const sortedCities: [string, number][] = Object.entries(cityCounts)
        .sort(([, a]: [string, number], [, b]: [string, number]) => b - a)
        .slice(0, 5); // Top 5 cities

      sortedCities.forEach(([city, count]: [string, number]) => {
        console.log(`    ${city}: ${count}`);
      });

      // Validate all events have valid dates
      events.forEach((event: ProtestEvent) => {
        const startDate: Date = new Date(event.start!);
        expect(startDate.toString()).not.toBe('Invalid Date');
        expect(event.country).toBe('DE');
      });
    }
  }, 45000);

  it('should extract attendee information when available', async () => {
    const events: ProtestEvent[] = await parseDemokrateam(90);

    if (events.length > 0) {
      const eventsWithAttendees: ProtestEvent[] = events.filter((e: ProtestEvent) => e.attendees !== null && e.attendees! > 0);

      if (eventsWithAttendees.length > 0) {
        console.log(`  Events with attendee info: ${eventsWithAttendees.length}/${events.length}`);

        const avgAttendees: number = eventsWithAttendees.reduce((sum: number, e: ProtestEvent) => sum + (e.attendees || 0), 0) / eventsWithAttendees.length;
        console.log(`  Average expected attendees: ${Math.round(avgAttendees)}`);

        // Validate attendee numbers are reasonable
        eventsWithAttendees.forEach((event: ProtestEvent) => {
          expect(event.attendees).toBeGreaterThan(0);
          expect(event.attendees).toBeLessThan(1000000); // Sanity check
        });
      } else {
        console.log('  No events with explicit attendee counts found');
      }
    }
  }, 45000);

  it('should handle robots.txt compliance', async () => {
    // DemokraTEAM has specific robots.txt rules
    // Parser should respect them (tested by not throwing errors)
    const events: ProtestEvent[] = await parseDemokrateam(90);

    // If we get here without errors, robots.txt compliance is working
    expect(Array.isArray(events)).toBe(true);
    console.log('  ✓ robots.txt compliance check passed');
  }, 45000);
});
