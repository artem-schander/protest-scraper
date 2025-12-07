import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import {
  parseDemosphereToulouse,
  parseDemosphereLille,
  parseDemosphereNice,
} from '@/scraper/sources/france/demosphere.js';

describe('Demosphere Parser', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    mock.restore();
  });

  // Sample RSS feed structure based on real Demosphere feed
  const createMockRss = (items: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:georss="http://www.georss.org/georss">
  <channel>
    <title>Démosphère Toulouse</title>
    <link>https://toulouse.demosphere.net</link>
    <description>Événements militants à Toulouse</description>
    ${items}
  </channel>
</rss>`;

  const createMockItem = (options: {
    title: string;
    link: string;
    startDate: string;
    spatial?: string;
    description?: string;
    category?: string;
  }) => `
    <item>
      <title>${options.title}</title>
      <link>${options.link}</link>
      <description>${options.description || 'Event description'}</description>
      <dcterms:temporal>start=${options.startDate};scheme=W3C-DTF</dcterms:temporal>
      ${options.spatial ? `<dcterms:spatial>${options.spatial}</dcterms:spatial>` : ''}
      ${options.category ? `<category>${options.category}</category>` : ''}
      <pubDate>Fri, 28 Nov 2025 10:57:22 +0100</pubDate>
      <guid isPermaLink="true">${options.link}</guid>
    </item>`;

  describe('Toulouse Parser', () => {
    it('should return an array of events', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'Manifestation pour le climat',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2025-12-15T14:00:00+01:00',
          spatial: 'Toulouse 31000',
        })
      );

      mock.onGet(/toulouse\.demosphere\.net\/events\.xml/).reply(200, mockXml);

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(1);
    });

    it('should parse event date from dcterms:temporal', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'Climate Demo',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2025-12-15T14:30:00+01:00',
          spatial: 'Place du Capitole, Toulouse 31000',
        })
      );

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(events[0].start).toBeTruthy();
      expect(new Date(events[0].start!).toString()).not.toBe('Invalid Date');
      expect(events[0].startTimeKnown).toBe(true);
    });

    it('should detect events without specific time', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'All-day Event',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2025-12-15T00:00:00+01:00',
          spatial: 'Toulouse',
        })
      );

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(events[0].startTimeKnown).toBe(false);
    });

    it('should extract city from spatial field', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'Toulouse Event',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2025-12-15T14:00:00+01:00',
          spatial: 'Place du Capitole, Toulouse 31000',
        })
      );

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(events[0].city).toBe('Toulouse');
    });

    it('should use default city when spatial is missing', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'Event without location',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2025-12-15T14:00:00+01:00',
        })
      );

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(events[0].city).toBe('Toulouse');
    });

    it('should include categories', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'Categorized Event',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2025-12-15T14:00:00+01:00',
          spatial: 'Toulouse',
          category: 'Lutter-Résister',
        })
      );

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(events[0].categories).toBeDefined();
      expect(events[0].categories).toContain('Lutter-Résister');
    });

    it('should set correct metadata for French events', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'French Event',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2025-12-15T14:00:00+01:00',
          spatial: 'Toulouse',
        })
      );

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(events[0].country).toBe('FR');
      expect(events[0].language).toBe('fr-FR');
      expect(events[0].source).toBe('toulouse.demosphere.net');
    });

    it('should parse multiple events', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'Event 1',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2025-12-15T14:00:00+01:00',
          spatial: 'Toulouse',
        }) +
        createMockItem({
          title: 'Event 2',
          link: 'https://toulouse.demosphere.net/rv/12346',
          startDate: '2025-12-16T10:00:00+01:00',
          spatial: 'Toulouse',
        })
      );

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(events.length).toBe(2);
      expect(events[0].title).toBe('Event 1');
      expect(events[1].title).toBe('Event 2');
    });

    it('should handle empty RSS feed', async () => {
      const mockXml = createMockRss('');

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(events).toEqual([]);
    });

    it('should clean location from date prefix', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'Event with date in location',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2025-12-15T14:00:00+01:00',
          spatial: 'lundi 8 décembre 2025 - Toulouse 31000',
        })
      );

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(events[0].location).not.toContain('lundi');
      expect(events[0].location).not.toContain('décembre');
    });
  });

  describe('Lille Parser', () => {
    it('should parse events with Lille metadata', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'Lille Event',
          link: 'https://lille.demosphere.net/rv/12345',
          startDate: '2025-12-15T14:00:00+01:00',
          spatial: 'Grand Place, Lille',
        })
      );

      const events = await parseDemosphereLille(90, mockXml);

      expect(events[0].city).toBe('Lille');
      expect(events[0].source).toBe('lille.demosphere.net');
    });
  });

  describe('Nice Parser', () => {
    it('should parse events with Nice metadata', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'Nice Event',
          link: 'https://nice.demosphere.net/rv/12345',
          startDate: '2025-12-15T14:00:00+01:00',
          spatial: 'Promenade des Anglais, Nice',
        })
      );

      const events = await parseDemosphereNice(90, mockXml);

      expect(events[0].city).toBe('Nice');
      expect(events[0].source).toBe('nice.demosphere.net');
    });
  });

  describe('Date filtering', () => {
    it('should skip events outside date range', async () => {
      // Event in the past
      const mockXml = createMockRss(
        createMockItem({
          title: 'Past Event',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2020-01-01T14:00:00+01:00',
          spatial: 'Toulouse',
        })
      );

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(events.length).toBe(0);
    });

    it('should skip events too far in the future', async () => {
      // Event way in the future
      const mockXml = createMockRss(
        createMockItem({
          title: 'Future Event',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2030-01-01T14:00:00+01:00',
          spatial: 'Toulouse',
        })
      );

      const events = await parseDemosphereToulouse(30, mockXml);

      expect(events.length).toBe(0);
    });
  });

  describe('Attendee parsing', () => {
    it('should extract attendee count from description', async () => {
      const mockXml = createMockRss(
        createMockItem({
          title: 'Demo Event',
          link: 'https://toulouse.demosphere.net/rv/12345',
          startDate: '2025-12-15T14:00:00+01:00',
          spatial: 'Toulouse',
          description: 'Manifestation avec environ 500 participants attendus',
        })
      );

      const events = await parseDemosphereToulouse(90, mockXml);

      expect(events[0].attendees).toBe(500);
    });
  });
});
