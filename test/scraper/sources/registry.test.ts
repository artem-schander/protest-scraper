import { describe, it, expect } from 'vitest';
import {
  SOURCES,
  getEnabledSources,
  getSourcesByCountry,
  getSourceById,
  getAvailableCountries,
} from '@/scraper/sources/registry.js';

describe('Registry', () => {
  describe('SOURCES', () => {
    it('should contain all German sources', () => {
      expect(SOURCES.length).toBeGreaterThanOrEqual(4);

      const sourceIds = SOURCES.map(s => s.id);
      expect(sourceIds).toContain('berlin-police');
      expect(sourceIds).toContain('dresden-city');
      expect(sourceIds).toContain('friedenskooperative');
      expect(sourceIds).toContain('demokrateam');
    });

    it('should have valid structure for each source', () => {
      SOURCES.forEach(source => {
        expect(source).toHaveProperty('id');
        expect(source).toHaveProperty('name');
        expect(source).toHaveProperty('country');
        expect(source).toHaveProperty('parser');
        expect(source).toHaveProperty('enabled');

        expect(typeof source.id).toBe('string');
        expect(typeof source.name).toBe('string');
        expect(typeof source.country).toBe('string');
        expect(typeof source.parser).toBe('function');
        expect(typeof source.enabled).toBe('boolean');
      });
    });

    it('should have unique IDs', () => {
      const ids = SOURCES.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('getEnabledSources', () => {
    it('should return only enabled sources', () => {
      const enabled = getEnabledSources();

      expect(enabled.length).toBeGreaterThan(0);
      enabled.forEach(source => {
        expect(source.enabled).toBe(true);
      });
    });

    it('should return array even if all sources disabled', () => {
      // This tests the filter logic, actual sources are enabled
      const result = getEnabledSources();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getSourcesByCountry', () => {
    it('should return German sources for "DE"', () => {
      const germanSources = getSourcesByCountry('DE');

      expect(germanSources.length).toBeGreaterThanOrEqual(4);
      germanSources.forEach(source => {
        expect(source.country).toBe('DE');
        expect(source.enabled).toBe(true);
      });
    });

    it('should return empty array for non-existent country', () => {
      const sources = getSourcesByCountry('XX');
      expect(sources).toEqual([]);
    });

    it('should be case-sensitive for country codes', () => {
      const uppercase = getSourcesByCountry('DE');
      const lowercase = getSourcesByCountry('de');

      expect(uppercase.length).toBeGreaterThan(0);
      expect(lowercase.length).toBe(0);
    });
  });

  describe('getSourceById', () => {
    it('should return source for valid ID', () => {
      const source = getSourceById('berlin-police');

      expect(source).toBeDefined();
      expect(source?.id).toBe('berlin-police');
      expect(source?.name).toBe('Berlin Police');
      expect(source?.country).toBe('DE');
      expect(source?.city).toBe('Berlin');
    });

    it('should return undefined for non-existent ID', () => {
      const source = getSourceById('non-existent');
      expect(source).toBeUndefined();
    });

    it('should find Dresden source', () => {
      const source = getSourceById('dresden-city');

      expect(source).toBeDefined();
      expect(source?.name).toBe('Dresden City');
      expect(source?.city).toBe('Dresden');
    });

    it('should find nationwide sources', () => {
      const source = getSourceById('friedenskooperative');

      expect(source).toBeDefined();
      expect(source?.city).toBeNull();
      expect(source?.country).toBe('DE');
    });
  });

  describe('getAvailableCountries', () => {
    it('should return array of country codes', () => {
      const countries = getAvailableCountries();

      expect(Array.isArray(countries)).toBe(true);
      expect(countries.length).toBeGreaterThan(0);
    });

    it('should include Germany', () => {
      const countries = getAvailableCountries();
      expect(countries).toContain('DE');
    });

    it('should return unique country codes', () => {
      const countries = getAvailableCountries();
      const uniqueCountries = new Set(countries);
      expect(uniqueCountries.size).toBe(countries.length);
    });

    it('should return sorted array', () => {
      const countries = getAvailableCountries();
      const sorted = [...countries].sort();
      expect(countries).toEqual(sorted);
    });

    it('should only include enabled sources', () => {
      const countries = getAvailableCountries();

      // All returned countries should have at least one enabled source
      countries.forEach(countryCode => {
        const sources = getSourcesByCountry(countryCode);
        expect(sources.length).toBeGreaterThan(0);
      });
    });
  });
});
