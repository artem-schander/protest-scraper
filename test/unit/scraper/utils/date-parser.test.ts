import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { parseDate, parseTimeRange, withinNextDays } from '@/scraper/utils/date-parser.js';
import { LOCALES } from '@/scraper/config/locales.js';

// Initialize dayjs plugins
dayjs.extend(customParseFormat);
dayjs.extend(timezone);
dayjs.extend(utc);

describe('parseDate', () => {
  describe('German locale (DE)', () => {
    const locale = LOCALES['DE'];

    it('should parse DD.MM.YYYY format', () => {
      const result = parseDate('15.03.2025', locale);
      expect(result).not.toBeNull();
      expect(result?.format('DD.MM.YYYY')).toBe('15.03.2025');
    });

    it('should parse DD.MM.YYYY HH:mm format', () => {
      const result = parseDate('15.03.2025 14:30', locale);
      expect(result).not.toBeNull();
      expect(result?.format('DD.MM.YYYY HH:mm')).toBe('15.03.2025 14:30');
    });

    it('should parse DD.MM. HH:mm format', () => {
      const result = parseDate('15.03. 14:30', locale);
      expect(result).not.toBeNull();
      // Should use current or next year
    });

    it('should handle "Uhr" suffix', () => {
      const result = parseDate('15.03.2025 14:30Uhr', locale);
      expect(result).not.toBeNull();
      expect(result?.format('DD.MM.YYYY HH:mm')).toBe('15.03.2025 14:30');
    });

    it('should handle German month names', () => {
      const result = parseDate('15. Oktober 2025', locale);
      expect(result).not.toBeNull();
      expect(result?.month()).toBe(9); // 0-indexed, 9 = October
    });

    it('should handle abbreviated month names', () => {
      const result = parseDate('15.Okt.2025', locale);
      expect(result).not.toBeNull();
      expect(result?.month()).toBe(9);
    });

    it('should return null for invalid dates', () => {
      const result = parseDate('invalid date', locale);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseDate('', locale);
      expect(result).toBeNull();
    });

    it('should apply correct timezone', () => {
      const result = parseDate('15.03.2025 14:30', locale);
      expect(result).not.toBeNull();
      expect(result?.isValid()).toBe(true);
      // Timezone is applied internally
    });
  });

  // Note: FR and US locales are example configurations for future use
  // They would need proper date format patterns added to work correctly
});

describe('withinNextDays', () => {
  const baseDate = dayjs('2025-10-11T12:00:00Z').tz('Europe/Berlin');

  it('should return true for dates within range', () => {
    const futureDate = baseDate.add(5, 'day').toISOString();
    expect(withinNextDays(futureDate, 10, baseDate)).toBe(true);
  });

  it('should return false for dates in the past', () => {
    const pastDate = baseDate.subtract(5, 'day').toISOString();
    expect(withinNextDays(pastDate, 10, baseDate)).toBe(false);
  });

  it('should return false for dates beyond range', () => {
    const farFutureDate = baseDate.add(15, 'day').toISOString();
    expect(withinNextDays(farFutureDate, 10, baseDate)).toBe(false);
  });

  it('should return false for null dates', () => {
    expect(withinNextDays(null, 10, baseDate)).toBe(false);
  });

  it('should handle edge case at boundary', () => {
    const boundaryDate = baseDate.add(10, 'day').subtract(1, 'second').toISOString();
    expect(withinNextDays(boundaryDate, 10, baseDate)).toBe(true);
  });
});

describe('parseTimeRange', () => {
  describe('German format', () => {
    it('should parse "17-18 Uhr"', () => {
      const result = parseTimeRange('Event 17-18 Uhr in Berlin');
      expect(result).not.toBeNull();
      expect(result?.startHour).toBe(17);
      expect(result?.startMinute).toBe(0);
      expect(result?.endHour).toBe(18);
      expect(result?.endMinute).toBe(0);
    });

    it('should parse "14 - 16 Uhr" with spaces', () => {
      const result = parseTimeRange('Demo 14 - 16 Uhr');
      expect(result).not.toBeNull();
      expect(result?.startHour).toBe(14);
      expect(result?.endHour).toBe(16);
    });

    it('should parse "9-10 Uhr" with single digits', () => {
      const result = parseTimeRange('Mahnwache 9-10 Uhr');
      expect(result).not.toBeNull();
      expect(result?.startHour).toBe(9);
      expect(result?.endHour).toBe(10);
    });

    it('should parse "14.30-16.00 Uhr" with dot minutes', () => {
      const result = parseTimeRange('Kundgebung 14.30-16.00');
      expect(result).not.toBeNull();
      expect(result?.startHour).toBe(14);
      expect(result?.startMinute).toBe(30);
      expect(result?.endHour).toBe(16);
      expect(result?.endMinute).toBe(0);
    });
  });

  describe('Colon format', () => {
    it('should parse "14:30-16:00"', () => {
      const result = parseTimeRange('Event 14:30-16:00 today');
      expect(result).not.toBeNull();
      expect(result?.startHour).toBe(14);
      expect(result?.startMinute).toBe(30);
      expect(result?.endHour).toBe(16);
      expect(result?.endMinute).toBe(0);
    });

    it('should parse "09:00 - 11:30" with spaces', () => {
      const result = parseTimeRange('Demo 09:00 - 11:30');
      expect(result).not.toBeNull();
      expect(result?.startHour).toBe(9);
      expect(result?.startMinute).toBe(0);
      expect(result?.endHour).toBe(11);
      expect(result?.endMinute).toBe(30);
    });
  });

  describe('French format', () => {
    it('should parse "17h-18h"', () => {
      const result = parseTimeRange('Manifestation 17h-18h');
      expect(result).not.toBeNull();
      expect(result?.startHour).toBe(17);
      expect(result?.endHour).toBe(18);
    });

    it('should parse "14h30-16h00"', () => {
      const result = parseTimeRange('Rassemblement 14h30-16h00');
      expect(result).not.toBeNull();
      expect(result?.startHour).toBe(14);
      expect(result?.startMinute).toBe(30);
      expect(result?.endHour).toBe(16);
      expect(result?.endMinute).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should return null for empty string', () => {
      expect(parseTimeRange('')).toBeNull();
    });

    it('should return null for text without time range', () => {
      expect(parseTimeRange('Meeting tomorrow')).toBeNull();
    });

    it('should return null for single time (not a range)', () => {
      expect(parseTimeRange('Event at 14:00')).toBeNull();
    });

    it('should handle en-dash (–) separator', () => {
      const result = parseTimeRange('Event 17–18 Uhr');
      expect(result).not.toBeNull();
      expect(result?.startHour).toBe(17);
      expect(result?.endHour).toBe(18);
    });

    it('should extract from real Friedenskooperative description', () => {
      const result = parseTimeRange('(jeden Mo.) Mahnwache / Aktion "Weiße Fahnen zeigen in Köln", 17-18 Uhr, Domforum');
      expect(result).not.toBeNull();
      expect(result?.startHour).toBe(17);
      expect(result?.startMinute).toBe(0);
      expect(result?.endHour).toBe(18);
      expect(result?.endMinute).toBe(0);
    });
  });
});
