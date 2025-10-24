import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { parseDresdenCity } from '@/scraper/sources/germany/dresden.js';

describe('Dresden City Parser', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    mock.restore();
  });

  it('should return an array of events', async () => {
    const mockJSON = {
      Versammlungen: [
        {
          Datum: '2025-10-23',
          Zeit: '11.00 - 14.00 Uhr',
          Thema: 'Klimademo',
          Ort: 'Altmarkt',
          Teilnehmer: '500',
        },
      ],
    };

    mock.onGet('https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json').reply(200, mockJSON);

    const events = await parseDresdenCity();

    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(1);
  });

  it('should parse dates with dots in time format (HH.mm)', async () => {
    const mockJSON = {
      Versammlungen: [
        {
          Datum: '2025-10-23',
          Zeit: '11.00 - 14.00 Uhr',
          Thema: 'Test Event',
          Ort: 'Altmarkt',
        },
      ],
    };

    mock.onGet('https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json').reply(200, mockJSON);

    const events = await parseDresdenCity();

    expect(events[0].start).toBeTruthy();
    expect(new Date(events[0].start).toString()).not.toBe('Invalid Date');
    expect(events[0].end).toBeTruthy();
    expect(new Date(events[0].end!).toString()).not.toBe('Invalid Date');
  });

  it('should parse dates without times', async () => {
    const mockJSON = {
      Versammlungen: [
        {
          Datum: '2025-10-23',
          Zeit: '',
          Thema: 'Test Event',
          Ort: 'Altmarkt',
        },
      ],
    };

    mock.onGet('https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json').reply(200, mockJSON);

    const events = await parseDresdenCity();

    expect(events[0].start).toBeTruthy();
    expect(new Date(events[0].start).toString()).not.toBe('Invalid Date');
  });

  it('should parse attendee count from Teilnehmer field', async () => {
    const mockJSON = {
      Versammlungen: [
        {
          Datum: '2025-10-23',
          Zeit: '11.00 - 14.00 Uhr',
          Thema: 'Demo',
          Ort: 'Altmarkt',
          Teilnehmer: '5000',
        },
      ],
    };

    mock.onGet('https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json').reply(200, mockJSON);

    const events = await parseDresdenCity();

    expect(events[0].attendees).toBe(5000);
  });

  it('should parse attendee count from Thema when Teilnehmer is empty', async () => {
    const mockJSON = {
      Versammlungen: [
        {
          Datum: '2025-10-23',
          Zeit: '11.00 - 14.00 Uhr',
          Thema: 'Demo mit ca. 3000 Teilnehmern',
          Ort: 'Altmarkt',
          Teilnehmer: '',
        },
      ],
    };

    mock.onGet('https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json').reply(200, mockJSON);

    const events = await parseDresdenCity();

    expect(events[0].attendees).toBe(3000);
  });

  it('should include location with Dresden and Ort', async () => {
    const mockJSON = {
      Versammlungen: [
        {
          Datum: '2025-10-23',
          Zeit: '11.00 - 14.00 Uhr',
          Thema: 'Demo',
          Ort: 'Altmarkt',
        },
      ],
    };

    mock.onGet('https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json').reply(200, mockJSON);

    const events = await parseDresdenCity();

    expect(events[0].location).toContain('Dresden');
    expect(events[0].location).toContain('Altmarkt');
  });

  it('should use Startpunkt when Ort is missing', async () => {
    const mockJSON = {
      Versammlungen: [
        {
          Datum: '2025-10-23',
          Zeit: '11.00 - 14.00 Uhr',
          Thema: 'Demo',
          Startpunkt: 'Neumarkt',
        },
      ],
    };

    mock.onGet('https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json').reply(200, mockJSON);

    const events = await parseDresdenCity();

    expect(events[0].location).toContain('Neumarkt');
  });

  it('should skip events with invalid dates', async () => {
    const mockJSON = {
      Versammlungen: [
        {
          Datum: 'invalid-date',
          Zeit: '11.00 - 14.00 Uhr',
          Thema: 'Should be skipped',
        },
        {
          Datum: '2025-10-23',
          Zeit: '11.00 - 14.00 Uhr',
          Thema: 'Valid event',
        },
      ],
    };

    mock.onGet('https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json').reply(200, mockJSON);

    const events = await parseDresdenCity();

    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Valid event');
  });

  it('should handle network errors gracefully', async () => {
    mock.onGet('https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json').networkError();

    const events = await parseDresdenCity();

    expect(events).toEqual([]);
  });

  it('should handle empty Versammlungen array', async () => {
    const mockJSON = {
      Versammlungen: [],
    };

    mock.onGet('https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json').reply(200, mockJSON);

    const events = await parseDresdenCity();

    expect(events).toEqual([]);
  });

  it('should set all events to Dresden city', async () => {
    const mockJSON = {
      Versammlungen: [
        {
          Datum: '2025-10-23',
          Zeit: '11.00 - 14.00 Uhr',
          Thema: 'Event 1',
        },
        {
          Datum: '2025-10-24',
          Zeit: '15.30 - 18.00 Uhr',
          Thema: 'Event 2',
        },
      ],
    };

    mock.onGet('https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json').reply(200, mockJSON);

    const events = await parseDresdenCity();

    events.forEach(event => {
      expect(event.city).toBe('Dresden');
      expect(event.country).toBe('DE');
      expect(event.language).toBe('de-DE');
      expect(event.source).toBe('www.dresden.de');
    });
  });
});
