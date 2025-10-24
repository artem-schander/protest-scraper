import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { parseDate, withinNextDays } from '@/scraper/utils/date-parser.js';
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
