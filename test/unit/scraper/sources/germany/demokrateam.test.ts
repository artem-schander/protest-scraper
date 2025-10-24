import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { parseDemokrateam } from '@/scraper/sources/germany/demokrateam.js';

// Initialize dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Mock the delay function to avoid timeouts
vi.mock('@/utils/delay.js', () => ({
  default: vi.fn(() => Promise.resolve()),
}));

describe('DemokraTEAM Parser', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    mock.restore();
  });

  const createMockResponse = (html: string) => ({
    month: html,
  });

  // Helper to create article with JSON-LD structured data
  const createArticleHTML = (params: {
    date: string; // YYYY-MM-DD
    time?: string; // HH:mm
    title: string;
    url: string;
    location?: string;
  }) => {
    const jsonLD = {
      "@context": "http://schema.org",
      "@type": "Event",
      "startDate": params.date,
      "endDate": params.date,
      "name": params.title,
      "url": params.url,
      ...(params.location && {
        "location": {
          "@type": "Place",
          "name": params.location
        }
      })
    };

    return `
      <article class="mec-event-article">
        <h4 class="mec-event-title">
          <a href="${params.url}">${params.title}</a>
        </h4>
        ${params.time ? `<div class="mec-event-time">${params.time}</div>` : '<div class="mec-event-time"></div>'}
        ${params.location ? `<div class="mec-event-loc-place">${params.location}</div>` : ''}
      </article>
      <script type="application/ld+json">${JSON.stringify(jsonLD)}</script>
    `;
  };

  it('should parse events from WordPress AJAX response', async () => {
    const mockHTML = `
      <ul>
        <li id="mec_daily_view_date_events239_20251023">
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a href="https://www.demokrateam.org/event/klimademo">Klimademo</a>
            </h4>
            <div class="mec-event-time">14:00</div>
            <div class="mec-event-loc-place">Berlin, Brandenburger Tor</div>
          </article>
        </li>
      </ul>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].source).toBe('www.demokrateam.org');
    expect(events[0].title).toBe('Klimademo');
    expect(events[0].city).toBe('Berlin');
    expect(events[0].country).toBe('DE');
    expect(events[0].language).toBe('de-DE');
  });

  it('should extract date from JSON-LD structured data', async () => {
    const mockHTML = createArticleHTML({
      date: '2025-12-15',
      time: '17:00',
      title: 'Demo',
      url: 'https://www.demokrateam.org/event/demo'
    });

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    // Check date (ISO format, may be in UTC)
    const eventDate = new Date(events[0].start);
    expect(eventDate.toISOString()).toMatch(/2025-12-15/);
    expect(events[0].startTimeKnown).toBe(true);
  });

  it('should handle events without time', async () => {
    const mockHTML = createArticleHTML({
      date: '2025-10-30',
      title: 'All-day Demo',
      url: 'https://www.demokrateam.org/event/demo'
    });

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    // Event is stored in UTC; 2025-10-30 00:00 Berlin time = 2025-10-29 22:00 UTC (CET)
    const eventDate = new Date(events[0].start);
    expect(eventDate.toISOString()).toMatch(/2025-10-(29|30)/);
    expect(events[0].startTimeKnown).toBe(false);
  });

  it('should extract city from location string', async () => {
    const mockHTML = `
      <ul>
        <li id="mec_daily_view_date_events239_20251023">
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a href="https://www.demokrateam.org/event/demo">Demo</a>
            </h4>
            <div class="mec-event-time">15:00</div>
            <div class="mec-event-loc-place">Hamburg, Rathausplatz</div>
          </article>
        </li>
      </ul>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].city).toBe('Hamburg');
    expect(events[0].location).toBe('Hamburg, Rathausplatz');
  });

  it('should handle missing location field', async () => {
    const mockHTML = `
      <ul>
        <li id="mec_daily_view_date_events239_20251023">
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a href="https://www.demokrateam.org/event/demo">Demo</a>
            </h4>
            <div class="mec-event-time">15:00</div>
          </article>
        </li>
      </ul>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].city).toBeNull();
    expect(events[0].location).toBeNull();
  });

  it('should skip no-event articles', async () => {
    const mockHTML = `
      <ul>
        <li id="mec_daily_view_date_events239_20251023">
          <article class="mec-event-article">
            <div class="mec-no-event">Keine Events</div>
          </article>
        </li>
        <li id="mec_daily_view_date_events239_20251024">
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a href="https://www.demokrateam.org/event/demo">Demo</a>
            </h4>
            <div class="mec-event-time">15:00</div>
          </article>
        </li>
      </ul>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    // Parser makes 3 requests (one per month), so we get 3 events
    expect(events.length).toBe(3);
    expect(events.every(e => e.title === 'Demo')).toBe(true);
  });

  it('should parse multiple events in single response', async () => {
    const mockHTML = `
      <ul>
        <li id="mec_daily_view_date_events239_20251023">
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a href="https://www.demokrateam.org/event1">Event 1</a>
            </h4>
            <div class="mec-event-time">14:00</div>
          </article>
        </li>
        <li id="mec_daily_view_date_events239_20251024">
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a href="https://www.demokrateam.org/event2">Event 2</a>
            </h4>
            <div class="mec-event-time">16:00</div>
          </article>
        </li>
        <li id="mec_daily_view_date_events239_20251025">
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a href="https://www.demokrateam.org/event3">Event 3</a>
            </h4>
            <div class="mec-event-time">18:00</div>
          </article>
        </li>
      </ul>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it('should use default title when title is missing', async () => {
    const mockHTML = `
      <ul>
        <li id="mec_daily_view_date_events239_20251023">
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a href="https://www.demokrateam.org/event"></a>
            </h4>
            <div class="mec-event-time">15:00</div>
          </article>
        </li>
      </ul>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].title).toBe('Demo');
  });

  it('should use default URL when href is missing', async () => {
    const mockHTML = `
      <ul>
        <li id="mec_daily_view_date_events239_20251023">
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a>Demo without link</a>
            </h4>
            <div class="mec-event-time">15:00</div>
          </article>
        </li>
      </ul>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].url).toBe('https://www.demokrateam.org/aktionen/');
  });

  it('should parse attendees from title', async () => {
    const mockHTML = `
      <ul>
        <li id="mec_daily_view_date_events239_20251023">
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a href="https://www.demokrateam.org/event">Großdemo mit ca. 10000 Teilnehmern</a>
            </h4>
            <div class="mec-event-time">14:00</div>
          </article>
        </li>
      </ul>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].attendees).toBe(10000);
  });

  it('should handle time with multiple digits (single vs double)', async () => {
    const mockHTML = createArticleHTML({
      date: '2025-10-23',
      time: '9:30',
      title: 'Morning Demo',
      url: 'https://www.demokrateam.org/event'
    });

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    const eventDate = new Date(events[0].start);
    expect(eventDate.getUTCHours()).toBe(7); // 9:30 Berlin time (CEST, UTC+2) = 07:30 UTC
    expect(eventDate.getUTCMinutes()).toBe(30);
    expect(events[0].startTimeKnown).toBe(true);
  });

  it('should use fallback date when li ID is missing', async () => {
    const mockHTML = `
      <ul>
        <li>
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a href="https://www.demokrateam.org/event">Demo</a>
            </h4>
            <div class="mec-event-time">15:00</div>
          </article>
        </li>
      </ul>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].start).toBeTruthy();
  });

  it('should use fallback date when li ID has invalid format', async () => {
    const mockHTML = `
      <ul>
        <li id="invalid-id-format">
          <article class="mec-event-article">
            <h4 class="mec-event-title">
              <a href="https://www.demokrateam.org/event">Demo</a>
            </h4>
            <div class="mec-event-time">15:00</div>
          </article>
        </li>
      </ul>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].start).toBeTruthy();
  });

  it('should handle network errors gracefully', async () => {
    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .networkError();

    const events = await parseDemokrateam();

    expect(events).toEqual([]);
  });

  it('should handle response without month field', async () => {
    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, { error: 'no month' });

    const events = await parseDemokrateam();

    expect(events).toEqual([]);
  });

  it('should handle empty month HTML', async () => {
    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, { month: '' });

    const events = await parseDemokrateam();

    expect(events).toEqual([]);
  });

  it('should handle month with no events', async () => {
    const mockHTML = `
      <ul>
        <li>
          <p>Keine Veranstaltungen in diesem Monat</p>
        </li>
      </ul>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events).toEqual([]);
  });

  it('should make requests for 3 consecutive months', async () => {
    const requests: any[] = [];

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply((config) => {
        requests.push(config.data);
        return [200, { month: '<ul></ul>' }];
      });

    await parseDemokrateam();

    // Should make exactly 3 requests (current month + 2 more)
    expect(requests.length).toBe(3);

    // Check that form parameters are correct
    const formParams = requests.map(req => {
      const params = new URLSearchParams(req);
      return {
        action: params.get('action'),
        label: params.get('sf[label]'),
        applyDate: params.get('apply_sf_date'),
      };
    });

    formParams.forEach(params => {
      expect(params.action).toBe('mec_daily_view_load_month');
      expect(params.label).toBe('4324'); // Demo/Protest filter
      expect(params.applyDate).toBe('1');
    });
  });

  it('should handle timeout errors', async () => {
    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .timeout();

    const events = await parseDemokrateam();

    expect(events).toEqual([]);
  });

  it('should handle non-object response', async () => {
    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, 'plain text response');

    const events = await parseDemokrateam();

    expect(events).toEqual([]);
  });

  it('should handle month field with non-string value', async () => {
    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, { month: 123 });

    const events = await parseDemokrateam();

    expect(events).toEqual([]);
  });

  it('should normalize whitespace in time text', async () => {
    const mockHTML = `
      <article class="mec-event-article">
        <h4 class="mec-event-title">
          <a href="https://www.demokrateam.org/event">Demo</a>
        </h4>
        <div class="mec-event-time">  14:00
          (some extra text)
        </div>
      </article>
      <script type="application/ld+json">
        {
          "@context": "http://schema.org",
          "@type": "Event",
          "startDate": "2025-10-23",
          "name": "Demo",
          "url": "https://www.demokrateam.org/event"
        }
      </script>
    `;

    mock.onPost('https://www.demokrateam.org/wp-admin/admin-ajax.php')
      .reply(200, createMockResponse(mockHTML));

    const events = await parseDemokrateam();

    expect(events.length).toBeGreaterThan(0);
    const eventDate = new Date(events[0].start);
    expect(eventDate.getUTCHours()).toBe(12); // 14:00 Berlin time (CEST, UTC+2) = 12:00 UTC
    expect(events[0].startTimeKnown).toBe(true);
  });
});
