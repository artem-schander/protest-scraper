import { describe, it, expect } from 'vitest';
import {
  parseAttendees,
  parseGermanAttendees,
  parseEnglishAttendees,
  parseFrenchAttendees,
} from '@/scraper/utils/attendee-parser.js';
import { LOCALES } from '@/scraper/config/locales.js';

describe('parseAttendees', () => {
  describe('German locale', () => {
    const locale = LOCALES['DE'];

    it('should parse exact number with keyword', () => {
      const result = parseGermanAttendees('1000 Teilnehmer', locale);
      expect(result).toBe(1000);
    });

    it('should parse approximate number with "ca."', () => {
      const result = parseGermanAttendees('ca. 1000 Teilnehmer', locale);
      expect(result).toBe(1000);
    });

    it('should parse approximate number with "etwa"', () => {
      const result = parseGermanAttendees('etwa 500 Personen', locale);
      expect(result).toBe(500);
    });

    it('should parse number with thousand separator', () => {
      const result = parseGermanAttendees('5.000 Menschen', locale);
      expect(result).toBe(5000);
    });

    it('should parse range and return maximum', () => {
      const result = parseGermanAttendees('1000-2000 Teilnehmer', locale);
      expect(result).toBe(2000);
    });

    it('should parse range with spaces', () => {
      const result = parseGermanAttendees('500 - 800 Leute', locale);
      expect(result).toBe(800);
    });

    it('should parse "bis zu" pattern', () => {
      const result = parseGermanAttendees('bis zu 3000 Teilnehmer', locale);
      expect(result).toBe(3000);
    });

    it('should handle "Teilnehmer*innen" (gender-neutral)', () => {
      const result = parseGermanAttendees('ca. 2000 Teilnehmer*innen', locale);
      expect(result).toBe(2000);
    });

    it('should return null for text without numbers', () => {
      const result = parseGermanAttendees('Viele Teilnehmer', locale);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseGermanAttendees('', locale);
      expect(result).toBeNull();
    });
  });

  describe('English locale', () => {
    const locale = LOCALES['US'];

    it('should parse exact number with keyword', () => {
      const result = parseEnglishAttendees('1000 attendees', locale);
      expect(result).toBe(1000);
    });

    it('should parse approximate number with "approx"', () => {
      const result = parseEnglishAttendees('approx 500 people', locale);
      expect(result).toBe(500);
    });

    it('should parse approximate number with "about"', () => {
      const result = parseEnglishAttendees('about 2000 protesters', locale);
      expect(result).toBe(2000);
    });

    it('should parse range and return maximum', () => {
      const result = parseEnglishAttendees('1000-1500 participants', locale);
      expect(result).toBe(1500);
    });

    it('should return null for text without numbers', () => {
      const result = parseEnglishAttendees('Many people', locale);
      expect(result).toBeNull();
    });
  });

  describe('French locale', () => {
    const locale = LOCALES['FR'];

    it('should parse exact number with keyword', () => {
      const result = parseFrenchAttendees('1000 participants', locale);
      expect(result).toBe(1000);
    });

    it('should parse approximate number with "environ"', () => {
      const result = parseFrenchAttendees('environ 500 personnes', locale);
      expect(result).toBe(500);
    });

    it('should parse number (space separator not yet supported)', () => {
      // French number format with space separator would need regex adjustment
      const result = parseFrenchAttendees('5000 manifestants', locale);
      expect(result).toBe(5000);
    });

    it('should parse range and return maximum', () => {
      const result = parseFrenchAttendees('1000-2000 participants', locale);
      expect(result).toBe(2000);
    });

    it('should return null for text without numbers', () => {
      const result = parseFrenchAttendees('Beaucoup de monde', locale);
      expect(result).toBeNull();
    });
  });

  describe('Generic parseAttendees', () => {
    const locale = LOCALES['DE'];

    it('should accept custom keywords', () => {
      const result = parseAttendees('100 demonstrators', locale, ['demonstrators']);
      expect(result).toBe(100);
    });

    it('should fallback to default German keywords when none provided', () => {
      const result = parseAttendees('200 Teilnehmer', locale);
      expect(result).toBe(200);
    });

    it('should handle multiple matches and return first', () => {
      const result = parseGermanAttendees('500 Personen und 1000 Teilnehmer', locale);
      expect(result).toBe(500); // Returns first match
    });
  });

  describe('Time range exclusion', () => {
    const locale = LOCALES['DE'];

    it('should NOT parse time ranges with "Uhr" as attendees', () => {
      const result = parseGermanAttendees('17-18 Uhr, Demo in Berlin', locale);
      expect(result).toBeNull();
    });

    it('should NOT parse time ranges like "14-15 Uhr" as attendees', () => {
      const result = parseGermanAttendees('Mahnwache 14-15 Uhr', locale);
      expect(result).toBeNull();
    });

    it('should NOT parse small number ranges (likely time) as attendees', () => {
      // Numbers <= 24 are likely time ranges
      const result = parseGermanAttendees('Event starts 9-10, come join!', locale);
      expect(result).toBeNull();
    });

    it('should still parse valid attendee ranges like 1000-2000', () => {
      const result = parseGermanAttendees('Event mit 1000-2000 Teilnehmer', locale);
      expect(result).toBe(2000);
    });

    it('should still parse attendee numbers when time is also present', () => {
      const result = parseGermanAttendees('17-18 Uhr, ca. 500 Teilnehmer', locale);
      expect(result).toBe(500);
    });

    it('should handle French time format "17-18h"', () => {
      const localeFR = LOCALES['FR'];
      const result = parseFrenchAttendees('Manifestation 17-18h', localeFR);
      expect(result).toBeNull();
    });

    it('should handle mixed content with time and real attendees', () => {
      const result = parseGermanAttendees('Kundgebung 10-12 Uhr mit etwa 300 Menschen', locale);
      expect(result).toBe(300);
    });
  });
});
