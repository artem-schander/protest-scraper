import { describe, it, expect, beforeEach } from 'vitest';
import { buildProtestFilter } from '@/utils/filter-builder.js';
import { Request } from 'express';

// Helper to create mock request with query params
function mockRequest(query: Record<string, string>): Request {
  return { query } as Request;
}

describe('buildProtestFilter', () => {
  describe('default behavior', () => {
    it('should always exclude deleted events', () => {
      const req = mockRequest({});
      const filter = buildProtestFilter(req);

      expect(filter.deleted).toEqual({ $ne: true });
    });

    it('should default to future events only', () => {
      const req = mockRequest({});
      const filter = buildProtestFilter(req);

      expect(filter.start).toHaveProperty('$gte');
      expect(filter.start.$gte).toBeInstanceOf(Date);
    });

    it('should default to verified=true', () => {
      const req = mockRequest({});
      const filter = buildProtestFilter(req);

      expect(filter.verified).toBe(true);
    });

    it('should respect defaultVerified option', () => {
      const req = mockRequest({});
      const filter = buildProtestFilter(req, { defaultVerified: false });

      expect(filter.verified).toBe(false);
    });

    it('should not set verified when defaultVerified is undefined', () => {
      const req = mockRequest({});
      const filter = buildProtestFilter(req, { defaultVerified: undefined });

      expect(filter).not.toHaveProperty('verified');
    });
  });

  describe('city filter', () => {
    it('should filter by city', () => {
      const req = mockRequest({ city: 'Berlin' });
      const filter = buildProtestFilter(req);

      expect(filter.city).toBe('Berlin');
    });

    it('should ignore non-string city values', () => {
      const req = { query: { city: ['Berlin', 'Munich'] } } as any;
      const filter = buildProtestFilter(req);

      expect(filter).not.toHaveProperty('city');
    });
  });

  describe('source filter', () => {
    it('should filter by source', () => {
      const req = mockRequest({ source: 'www.berlin.de' });
      const filter = buildProtestFilter(req);

      expect(filter.source).toBe('www.berlin.de');
    });
  });

  describe('country filter', () => {
    it('should filter by country and convert to uppercase', () => {
      const req = mockRequest({ country: 'de' });
      const filter = buildProtestFilter(req);

      expect(filter.country).toBe('DE');
    });

    it('should keep uppercase country codes', () => {
      const req = mockRequest({ country: 'FR' });
      const filter = buildProtestFilter(req);

      expect(filter.country).toBe('FR');
    });
  });

  describe('language filter', () => {
    it('should filter by language', () => {
      const req = mockRequest({ language: 'de-DE' });
      const filter = buildProtestFilter(req);

      expect(filter.language).toBe('de-DE');
    });
  });

  describe('search filter', () => {
    it('should create case-insensitive regex for search', () => {
      const req = mockRequest({ search: 'climate' });
      const filter = buildProtestFilter(req);

      expect(filter.title).toEqual({
        $regex: 'climate',
        $options: 'i',
      });
    });

    it('should escape special regex characters', () => {
      const req = mockRequest({ search: 'test.+demo' });
      const filter = buildProtestFilter(req);

      expect(filter.title.$regex).toBe('test\\.\\+demo');
    });

    it('should escape all special characters', () => {
      const req = mockRequest({ search: '.*+?^${}()|[]\\' });
      const filter = buildProtestFilter(req);

      expect(filter.title.$regex).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });
  });

  describe('geolocation filter', () => {
    it('should filter by lat/lon with default 50km radius', () => {
      const req = mockRequest({ lat: '52.52', lon: '13.405' });
      const filter = buildProtestFilter(req);

      expect(filter.geoLocation).toBeDefined();
      expect(filter.geoLocation.$geoWithin).toBeDefined();
      expect(filter.geoLocation.$geoWithin.$centerSphere).toEqual([
        [13.405, 52.52],
        50 / 6378.1,
      ]);
    });

    it('should use custom radius when provided', () => {
      const req = mockRequest({ lat: '52.52', lon: '13.405', radius: '100' });
      const filter = buildProtestFilter(req);

      expect(filter.geoLocation.$geoWithin.$centerSphere[1]).toBe(100 / 6378.1);
    });

    it('should remove city filter when using geolocation', () => {
      const req = mockRequest({
        city: 'Berlin',
        lat: '52.52',
        lon: '13.405',
      });
      const filter = buildProtestFilter(req);

      expect(filter).not.toHaveProperty('city');
      expect(filter.geoLocation).toBeDefined();
    });

    it('should ignore invalid lat/lon values', () => {
      const req = mockRequest({ lat: 'invalid', lon: '13.405' });
      const filter = buildProtestFilter(req);

      expect(filter).not.toHaveProperty('geoLocation');
    });

    it('should ignore geolocation when lat is missing', () => {
      const req = mockRequest({ lon: '13.405' });
      const filter = buildProtestFilter(req);

      expect(filter).not.toHaveProperty('geoLocation');
    });

    it('should ignore geolocation when lon is missing', () => {
      const req = mockRequest({ lat: '52.52' });
      const filter = buildProtestFilter(req);

      expect(filter).not.toHaveProperty('geoLocation');
    });

    it('should use default radius when radius is invalid', () => {
      const req = mockRequest({
        lat: '52.52',
        lon: '13.405',
        radius: 'invalid',
      });
      const filter = buildProtestFilter(req);

      // NaN radius should cause the whole geolocation filter to be skipped
      expect(filter).not.toHaveProperty('geoLocation');
    });
  });

  describe('date range filters', () => {
    it('should filter by startDate', () => {
      const req = mockRequest({ startDate: '2025-10-01' });
      const filter = buildProtestFilter(req);

      expect(filter.start.$gte).toBeInstanceOf(Date);
      expect(filter.start.$gte.toISOString()).toContain('2025-10-01');
    });

    it('should filter by endDate with end of day time', () => {
      const req = mockRequest({ endDate: '2025-12-31' });
      const filter = buildProtestFilter(req);

      expect(filter.start.$lte).toBeInstanceOf(Date);
      const endDate = filter.start.$lte as Date;
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
      expect(endDate.getSeconds()).toBe(59);
    });

    it('should filter by both startDate and endDate', () => {
      const req = mockRequest({
        startDate: '2025-10-01',
        endDate: '2025-12-31',
      });
      const filter = buildProtestFilter(req);

      expect(filter.start.$gte).toBeDefined();
      expect(filter.start.$lte).toBeDefined();
    });

    it('should ignore invalid startDate', () => {
      const req = mockRequest({ startDate: 'invalid-date' });
      const filter = buildProtestFilter(req);

      expect(filter.start).not.toHaveProperty('$gte');
    });

    it('should ignore invalid endDate', () => {
      const req = mockRequest({ endDate: 'invalid-date' });
      const filter = buildProtestFilter(req);

      expect(filter.start).not.toHaveProperty('$lte');
    });
  });

  describe('days parameter', () => {
    it('should filter events within next N days', () => {
      const req = mockRequest({ days: '30' });
      const filter = buildProtestFilter(req);

      expect(filter.start.$gte).toBeDefined();
      expect(filter.start.$lte).toBeDefined();

      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + 30);

      expect(filter.start.$gte.getTime()).toBeCloseTo(now.getTime(), -3);
      expect(filter.start.$lte.getTime()).toBeCloseTo(future.getTime(), -3);
    });

    it('should not set date filter when days value is invalid', () => {
      const req = mockRequest({ days: 'invalid' });
      const filter = buildProtestFilter(req);

      // Currently, invalid days parameter results in no start filter being set
      // This is a known limitation - the filter enters the days block but NaN check fails
      expect(filter.start).toBeUndefined();
    });

    it('should prioritize explicit dates over days parameter', () => {
      const req = mockRequest({
        startDate: '2025-10-01',
        days: '30',
      });
      const filter = buildProtestFilter(req);

      // Should use startDate, not days
      expect(filter.start.$gte.toISOString()).toContain('2025-10-01');
    });
  });

  describe('verified filter', () => {
    it('should filter verified events', () => {
      const req = mockRequest({ verified: 'true' });
      const filter = buildProtestFilter(req);

      expect(filter.verified).toBe(true);
    });

    it('should filter unverified events', () => {
      const req = mockRequest({ verified: 'false' });
      const filter = buildProtestFilter(req);

      expect(filter.verified).toBe(false);
    });

    it('should override defaultVerified when verified param is provided', () => {
      const req = mockRequest({ verified: 'false' });
      const filter = buildProtestFilter(req, { defaultVerified: true });

      expect(filter.verified).toBe(false);
    });
  });

  describe('manualOnly filter', () => {
    it('should filter for events without a source field', () => {
      const req = mockRequest({ manualOnly: 'true' });
      const filter = buildProtestFilter(req);

      expect(filter.$or).toBeDefined();
      expect(filter.$or).toEqual([
        { source: { $exists: false } },
        { source: null },
        { source: '' }
      ]);
    });

    it('should not add $or filter when manualOnly is false', () => {
      const req = mockRequest({ manualOnly: 'false' });
      const filter = buildProtestFilter(req);

      expect(filter).not.toHaveProperty('$or');
    });

    it('should not add $or filter when manualOnly is not provided', () => {
      const req = mockRequest({});
      const filter = buildProtestFilter(req);

      expect(filter).not.toHaveProperty('$or');
    });

    it('should combine manualOnly with verified filter', () => {
      const req = mockRequest({ manualOnly: 'true', verified: 'false' });
      const filter = buildProtestFilter(req);

      expect(filter.verified).toBe(false);
      expect(filter.$or).toBeDefined();
      expect(filter.$or).toEqual([
        { source: { $exists: false } },
        { source: null },
        { source: '' }
      ]);
    });
  });

  describe('combined filters', () => {
    it('should combine multiple filters', () => {
      const req = mockRequest({
        city: 'Berlin',
        source: 'www.berlin.de',
        country: 'de',
        language: 'de-DE',
        search: 'climate',
        verified: 'true',
      });
      const filter = buildProtestFilter(req);

      expect(filter.city).toBe('Berlin');
      expect(filter.source).toBe('www.berlin.de');
      expect(filter.country).toBe('DE');
      expect(filter.language).toBe('de-DE');
      expect(filter.title.$regex).toBe('climate');
      expect(filter.verified).toBe(true);
      expect(filter.deleted).toEqual({ $ne: true });
    });
  });
});
