import { describe, it, expect } from 'vitest';
import { parseAgendaMilitant } from '@/scraper/sources/france/agenda-militant.js';

describe('Agenda Militant Parser - E2E (Real API)', () => {
  it('should successfully fetch and parse real events', async () => {
    const events = await parseAgendaMilitant(90);

    expect(Array.isArray(events)).toBe(true);

    if (events.length > 0) {
      console.log(`✓ Agenda Militant: Successfully parsed ${events.length} events`);

      const firstEvent = events[0];
      expect(firstEvent).toHaveProperty('source');
      expect(firstEvent).toHaveProperty('title');
      expect(firstEvent).toHaveProperty('start');
      expect(firstEvent.source).toBe('agendamilitant.org');
      expect(firstEvent.country).toBe('FR');
      expect(firstEvent.language).toBe('fr-FR');
      expect(firstEvent.start).toBeTruthy();

      const date = new Date(firstEvent.start!);
      expect(date.toString()).not.toBe('Invalid Date');
    } else {
      console.log('⚠ Agenda Militant: No events found (may be legitimate if calendar is empty)');
    }
  }, 60000); // 60 seconds for pagination

  it('should have valid dates on all parsed events', async () => {
    const events = await parseAgendaMilitant(90);

    if (events.length > 0) {
      events.forEach((event) => {
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
  }, 60000);

  it('should have city set to Paris or IDF region', async () => {
    const events = await parseAgendaMilitant(90);

    if (events.length > 0) {
      const idfCities = [
        'Paris', 'Montreuil', 'Saint-Denis', 'Saint-Ouen', 'Nanterre', 'Aubervilliers',
        'Pantin', 'Ivry-sur-Seine', 'Vitry-sur-Seine', 'Bobigny', 'Créteil',
        'Versailles', 'Malakoff', 'Bagnolet', 'Gentilly',
        'Seine-et-Marne', 'Yvelines', 'Essonne',
        'Hauts-de-Seine', 'Seine-Saint-Denis', 'Val-de-Marne', "Val-d'Oise",
      ];

      events.forEach((event) => {
        expect(event.city).toBeTruthy();
        expect(idfCities).toContain(event.city);
      });
    }
  }, 60000);

  it('should have valid URLs on all parsed events', async () => {
    const events = await parseAgendaMilitant(90);

    if (events.length > 0) {
      events.forEach((event) => {
        expect(event.url).toBeTruthy();
        expect(event.url).toMatch(/^https?:\/\//);
        expect(event.url).toContain('agendamilitant.org');
      });
    }
  }, 60000);

  it('should properly set metadata fields', async () => {
    const events = await parseAgendaMilitant(90);

    if (events.length > 0) {
      events.forEach((event) => {
        expect(event.country).toBe('FR');
        expect(event.language).toBe('fr-FR');
        expect(event.source).toBe('agendamilitant.org');
        expect(typeof event.title).toBe('string');
        expect(event.title.length).toBeGreaterThan(0);
      });
    }
  }, 60000);
});
