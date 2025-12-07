import { describe, it, expect } from 'vitest';
import {
  parseDemosphereToulouse,
  parseDemosphereLille,
  parseDemosphereNice,
  parseDemosphereRennes,
  parseDemosphereStrasbourg,
} from '@/scraper/sources/france/demosphere.js';

describe('Demosphere Parser - E2E (Real API)', () => {
  describe('Toulouse', () => {
    it('should successfully fetch and parse real events', async () => {
      const events = await parseDemosphereToulouse(90);

      expect(Array.isArray(events)).toBe(true);

      if (events.length > 0) {
        console.log(`✓ Toulouse: Successfully parsed ${events.length} events`);

        const firstEvent = events[0];
        expect(firstEvent).toHaveProperty('source');
        expect(firstEvent).toHaveProperty('title');
        expect(firstEvent).toHaveProperty('start');
        expect(firstEvent.source).toBe('toulouse.demosphere.net');
        expect(firstEvent.country).toBe('FR');
        expect(firstEvent.language).toBe('fr-FR');
        expect(firstEvent.start).toBeTruthy();

        const date = new Date(firstEvent.start!);
        expect(date.toString()).not.toBe('Invalid Date');
      } else {
        console.log('⚠ Toulouse: No events found (may be legitimate if calendar is empty)');
      }
    }, 30000);
  });

  describe('Lille', () => {
    it('should successfully fetch and parse real events', async () => {
      const events = await parseDemosphereLille(90);

      expect(Array.isArray(events)).toBe(true);

      if (events.length > 0) {
        console.log(`✓ Lille: Successfully parsed ${events.length} events`);

        const firstEvent = events[0];
        expect(firstEvent.source).toBe('lille.demosphere.net');
        expect(firstEvent.country).toBe('FR');
      } else {
        console.log('⚠ Lille: No events found');
      }
    }, 30000);
  });

  describe('Nice', () => {
    it('should successfully fetch and parse real events', async () => {
      const events = await parseDemosphereNice(90);

      expect(Array.isArray(events)).toBe(true);

      if (events.length > 0) {
        console.log(`✓ Nice: Successfully parsed ${events.length} events`);

        const firstEvent = events[0];
        expect(firstEvent.source).toBe('nice.demosphere.net');
        expect(firstEvent.country).toBe('FR');
      } else {
        console.log('⚠ Nice: No events found');
      }
    }, 30000);
  });

  describe('Rennes', () => {
    it('should successfully fetch and parse real events', async () => {
      const events = await parseDemosphereRennes(90);

      expect(Array.isArray(events)).toBe(true);

      if (events.length > 0) {
        console.log(`✓ Rennes: Successfully parsed ${events.length} events`);

        const firstEvent = events[0];
        expect(firstEvent.source).toBe('rennes.demosphere.net');
        expect(firstEvent.country).toBe('FR');
      } else {
        console.log('⚠ Rennes: No events found');
      }
    }, 30000);
  });

  describe('Strasbourg', () => {
    it('should successfully fetch and parse real events', async () => {
      const events = await parseDemosphereStrasbourg(90);

      expect(Array.isArray(events)).toBe(true);

      if (events.length > 0) {
        console.log(`✓ Strasbourg: Successfully parsed ${events.length} events`);

        const firstEvent = events[0];
        expect(firstEvent.source).toBe('strasbourg.demosphere.net');
        expect(firstEvent.country).toBe('FR');
      } else {
        console.log('⚠ Strasbourg: No events found');
      }
    }, 30000);
  });

  describe('All regions data validation', () => {
    it('should have valid dates on all parsed events', async () => {
      const events = await parseDemosphereToulouse(90);

      if (events.length > 0) {
        events.forEach((event, index) => {
          expect(event.start).toBeTruthy();

          const date = new Date(event.start!);
          expect(date.toString()).not.toBe('Invalid Date');

          // Event should be in the future (or very recent)
          const now = new Date();
          const eventDate = new Date(event.start!);
          const daysDiff = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          expect(daysDiff).toBeGreaterThan(-7); // Allow events from last week
          expect(daysDiff).toBeLessThan(100); // Should be within our date range
        });
      }
    }, 30000);

    it('should have valid cities on all parsed events', async () => {
      const events = await parseDemosphereToulouse(90);

      if (events.length > 0) {
        events.forEach((event) => {
          expect(event.city).toBeTruthy();
          expect(typeof event.city).toBe('string');
        });
      }
    }, 30000);

    it('should have valid URLs on all parsed events', async () => {
      const events = await parseDemosphereToulouse(90);

      if (events.length > 0) {
        events.forEach((event) => {
          expect(event.url).toBeTruthy();
          expect(event.url).toMatch(/^https?:\/\//);
          expect(event.url).toContain('demosphere.net');
        });
      }
    }, 30000);
  });
});
