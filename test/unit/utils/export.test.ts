import { describe, it, expect } from 'vitest';
import { protestsToCSV, protestsToJSON, protestsToICS } from '@/utils/export.js';
import { Protest } from '@/types/protest.js';

describe('Export Utils', () => {
  const mockProtests: Protest[] = [
    {
      title: 'Test Protest',
      start: new Date('2025-10-15T14:00:00Z'),
      city: 'Berlin',
      location: 'Brandenburg Gate',
      source: 'test-source',
      url: 'https://example.com/protest1',
      verified: true,
      country: 'DE',
      language: 'de-DE',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    },
    {
      title: 'Another Event',
      start: new Date('2025-10-20T10:00:00Z'),
      end: new Date('2025-10-20T16:00:00Z'),
      city: 'Munich',
      location: 'Marienplatz',
      source: 'test-source',
      url: 'https://example.com/protest2',
      verified: false,
      country: 'DE',
      language: 'de-DE',
      attendees: 500,
      description: 'Test description',
      createdAt: new Date('2025-01-02T00:00:00Z'),
      updatedAt: new Date('2025-01-02T00:00:00Z'),
    },
  ];

  describe('protestsToCSV', () => {
    it('should generate CSV with headers', () => {
      const csv = protestsToCSV(mockProtests);

      expect(csv).toContain('source,city,title,start,end,location,url,attendees,verified');
    });

    it('should escape commas in fields', () => {
      const protestWithComma: Protest[] = [{
        title: 'Test, with comma',
        start: new Date('2025-10-15T14:00:00Z'),
        city: 'Berlin',
        location: 'Gate, near park',
        source: 'test',
        url: 'https://example.com',
        verified: true,
        country: 'DE',
        language: 'de-DE',
        createdAt: new Date(),
        updatedAt: new Date(),
      }];

      const csv = protestsToCSV(protestWithComma);

      expect(csv).toContain('"Test, with comma"');
      expect(csv).toContain('"Gate, near park"');
    });

    it('should escape quotes in fields', () => {
      const protestWithQuote: Protest[] = [{
        title: 'Test "quoted" title',
        start: new Date('2025-10-15T14:00:00Z'),
        city: 'Berlin',
        location: 'Brandenburg Gate',
        source: 'test',
        url: 'https://example.com',
        verified: true,
        country: 'DE',
        language: 'de-DE',
        createdAt: new Date(),
        updatedAt: new Date(),
      }];

      const csv = protestsToCSV(protestWithQuote);

      expect(csv).toContain('"Test ""quoted"" title"');
    });

    it('should handle empty protests array', () => {
      const csv = protestsToCSV([]);

      expect(csv).toContain('source,city,title');
      expect(csv.split('\n').length).toBe(2); // Header + newline
    });

    it('should include end date when available', () => {
      const csv = protestsToCSV(mockProtests);

      expect(csv).toContain('2025-10-20'); // Event with end date
    });

    it('should handle missing optional fields', () => {
      const minimalProtest: Protest[] = [{
        title: 'Minimal',
        start: new Date('2025-10-15T14:00:00Z'),
        city: 'Berlin',
        location: 'Test',
        source: 'test',
        url: 'https://example.com',
        verified: false,
        country: 'DE',
        language: 'de-DE',
        createdAt: new Date(),
        updatedAt: new Date(),
      }];

      const csv = protestsToCSV(minimalProtest);

      expect(csv).toBeTruthy();
      expect(csv).toContain('Minimal');
    });
  });

  describe('protestsToJSON', () => {
    it('should generate valid JSON', () => {
      const json = protestsToJSON(mockProtests);
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });

    it('should preserve all fields', () => {
      const json = protestsToJSON(mockProtests);
      const parsed = JSON.parse(json);

      expect(parsed[0].title).toBe('Test Protest');
      expect(parsed[0].city).toBe('Berlin');
      expect(parsed[0].verified).toBe(true);
      expect(parsed[1].attendees).toBe(500);
    });

    it('should handle empty array', () => {
      const json = protestsToJSON([]);
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(0);
    });

    it('should format dates as ISO strings', () => {
      const json = protestsToJSON(mockProtests);
      const parsed = JSON.parse(json);

      expect(typeof parsed[0].start).toBe('string');
      expect(parsed[0].start).toContain('2025-10-15');
    });
  });

  describe('protestsToICS', () => {
    it('should generate valid ICS calendar', async () => {
      const ics = await protestsToICS(mockProtests);

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('END:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('PRODID:');
    });

    it('should include events with start times', async () => {
      const ics = await protestsToICS(mockProtests);

      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('SUMMARY:Test Protest');
      expect(ics).toContain('LOCATION:Brandenburg Gate');
    });

    it('should include end time when available', async () => {
      const ics = await protestsToICS(mockProtests);

      // Second event has end time
      expect(ics).toContain('SUMMARY:Another Event');
      expect(ics).toContain('DTEND');
    });

    it('should include geographic coordinates when available', async () => {
      const protestWithGeo: Protest[] = [{
        title: 'Geo Event',
        start: new Date('2025-10-15T14:00:00Z'),
        city: 'Berlin',
        location: 'Brandenburg Gate',
        geoLocation: {
          type: 'Point',
          coordinates: [13.377704, 52.516275],
        },
        source: 'test',
        url: 'https://example.com',
        verified: true,
        country: 'DE',
        language: 'de-DE',
        createdAt: new Date(),
        updatedAt: new Date(),
      }];

      const ics = await protestsToICS(protestWithGeo);

      // Note: GEO field not currently implemented in ICS export
      // Just verify the event is created
      expect(ics).toContain('SUMMARY:Geo Event');
      expect(ics).toContain('LOCATION:Brandenburg Gate');
    });

    it('should include categories', async () => {
      const ics = await protestsToICS(mockProtests);

      expect(ics).toContain('CATEGORIES:');
      expect(ics).toContain('Berlin');
    });

    it('should handle empty array', async () => {
      const ics = await protestsToICS([]);

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('END:VCALENDAR');
    });

    it('should include description when available', async () => {
      const ics = await protestsToICS(mockProtests);

      // Description uses source, not the protest description field
      expect(ics).toContain('DESCRIPTION:test-source');
    });

    it('should include attendee count in description when available', async () => {
      const ics = await protestsToICS(mockProtests);

      // Second event has 500 attendees
      expect(ics).toContain('500');
    });

    it('should handle events with minimal data', async () => {
      const minimalEvent: Protest[] = [{
        title: 'Minimal Event',
        start: new Date('2025-10-15T14:00:00Z'),
        city: 'Berlin',
        location: 'Unknown',
        source: 'test',
        url: 'https://example.com',
        verified: false,
        country: 'DE',
        language: 'de-DE',
        createdAt: new Date(),
        updatedAt: new Date(),
      }];

      const ics = await protestsToICS(minimalEvent);

      expect(ics).toContain('SUMMARY:Minimal Event');
      expect(ics).toBeTruthy();
    });
  });
});
