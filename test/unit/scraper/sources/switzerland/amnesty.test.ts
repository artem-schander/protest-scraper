/**
 * Unit tests for Amnesty International Switzerland parser
 * Uses mocked HTML responses to test parsing logic
 */

import { describe, it, expect } from 'vitest';
import { parseAmnestySwiss } from '@/scraper/sources/switzerland/amnesty.js';

describe('Amnesty International Switzerland Parser (Unit)', () => {
  const mockHTML = `
    <div id="article-body">
      <h5><strong>Oktober 2025</strong></h5>
      <hr>
      <ul>
        <li>31. Oktober | Verschiedene Städte<br>Critical Mass (Velo Demo), <a href="https://criticalmass-zh.ch/andere-staedte.html">Übersicht Treffpunkte</a></li>
        <li>31. Oktober | Langenthal<br>Mahnwache für den Erhalt einer einzigartigen Landschaft, Marktgasse 13, 19:00 Uhr, <a href="https://www.instagram.com/p/DN74tQZCKdV/?hl=de">Link</a></li>
      </ul>
      <h5><strong>November 2025</strong></h5>
      <hr>
      <ul>
        <li>1. November | Zürich<br>Demo «All out for Palestine, Hands off the occupied West Bank», Helvetiaplatz, 15:00 Uhr, <a href="https://www.instagram.com/p/DQRg2p3jBd6/">Link</a></li>
        <li>4. November | Biel<br>Mahnwache «End the Genocide in Gaza», Bahnhofplatz, 17:30 Uhr</li>
        <li>8. November | St.Gallen<br>Kidical Mass (Velodemo für Kinder und Familien), <a href="https://www.velorution.ch/event/st-galler-raebeliechtli-kidical-mass">Link</a></li>
        <li>15. November | Zürich<br>Demo «Antifa überall», Ni-Una-Menos/ Helvetiaplatz, 16:00 Uhr, <a href="https://www.instagram.com/oat_zuerich/">Link</a></li>
        <li>22. November | Bern<br>Kundgebung für das Gesundheitspersonal, Bundesplatz, 14:15 Uhr, <a href="https://vpod.ch/news/2025/22-november-auf-die-strasse-fuer-das-gesundheitspersonal/">Link</a></li>
        <li>28. November | Langenthal<br>Mahnwache für den Erhalt einer einzigartigen Landschaft, Wuhrplatz, 19:00 Uhr, <a href="https://www.instagram.com/p/DN74tQZCKdV/?hl=de">Link</a></li>
      </ul>
    </div>
  `;

  it('should parse multiple events from HTML', async () => {
    const events = await parseAmnestySwiss(90, mockHTML);

    // Should find 7 events (8 total minus 1 "Verschiedene Städte")
    expect(events.length).toBe(7);
  });

  it('should skip "Verschiedene Städte" events', async () => {
    const events = await parseAmnestySwiss(90, mockHTML);

    // None should have "Verschiedene Städte" as city
    const hasDifferentCities = events.some(e =>
      e.city?.toLowerCase().includes('verschieden')
    );
    expect(hasDifferentCities).toBe(false);
  });

  it('should parse dates with German month names', async () => {
    const events = await parseAmnestySwiss(90, mockHTML);

    const octoberEvent = events.find(e => e.city === 'Langenthal' && e.start?.includes('2025-10'));
    expect(octoberEvent).toBeDefined();
    expect(octoberEvent?.start).toMatch(/2025-10-31/);
  });

  it('should parse times correctly', async () => {
    const events = await parseAmnestySwiss(90, mockHTML);

    const event = events.find(e => e.city === 'Bern');
    expect(event).toBeDefined();
    expect(event?.startTimeKnown).toBe(true);
    expect(event?.start).toMatch(/13:15/); // 14:15 Uhr Swiss time = 13:15 UTC
  });

  it('should handle titles with commas correctly', async () => {
    const events = await parseAmnestySwiss(90, mockHTML);

    const palestineEvent = events.find(e => e.title?.includes('Palestine'));
    expect(palestineEvent).toBeDefined();
    expect(palestineEvent?.title).toBe('Demo «All out for Palestine, Hands off the occupied West Bank»');
    expect(palestineEvent?.location).toBe('Helvetiaplatz');
  });

  it('should separate title and location correctly', async () => {
    const events = await parseAmnestySwiss(90, mockHTML);

    const healthEvent = events.find(e => e.city === 'Bern');
    expect(healthEvent).toBeDefined();
    expect(healthEvent?.title).toBe('Kundgebung für das Gesundheitspersonal');
    expect(healthEvent?.location).toBe('Bundesplatz');
  });

  it('should handle events without time', async () => {
    const events = await parseAmnestySwiss(90, mockHTML);

    const noTimeEvent = events.find(e => e.city === 'St.Gallen');
    expect(noTimeEvent).toBeDefined();
    expect(noTimeEvent?.startTimeKnown).toBe(false);
  });

  it('should extract URLs correctly', async () => {
    const events = await parseAmnestySwiss(90, mockHTML);

    const linkedEvent = events.find(e => e.city === 'Zürich' && e.title?.includes('Palestine'));
    expect(linkedEvent).toBeDefined();
    expect(linkedEvent?.url).toBe('https://www.instagram.com/p/DQRg2p3jBd6/');
  });

  it('should set correct metadata fields', async () => {
    const events = await parseAmnestySwiss(90, mockHTML);

    events.forEach(event => {
      expect(event.source).toBe('www.amnesty.ch');
      expect(event.country).toBe('CH');
      expect(event.language).toBe('de-CH');
      expect(event.categories).toContain('Demonstration');
    });
  });

  it('should parse single-digit days correctly', async () => {
    const events = await parseAmnestySwiss(90, mockHTML);

    const event = events.find(e => e.start?.includes('2025-11-01'));
    expect(event).toBeDefined();
    expect(event?.city).toBe('Zürich');
  });

  it('should handle double-digit days correctly', async () => {
    const events = await parseAmnestySwiss(90, mockHTML);

    const event = events.find(e => e.start?.includes('2025-10-31'));
    expect(event).toBeDefined();
    expect(event?.city).toBe('Langenthal');
  });

  it('should return empty array for invalid HTML', async () => {
    const events = await parseAmnestySwiss(90, '<html><body>No events</body></html>');
    expect(events).toEqual([]);
  });

  it('should handle malformed list items gracefully', async () => {
    const badHTML = `
      <div id="article-body">
        <h5><strong>Oktober 2025</strong></h5>
        <ul>
          <li>Invalid format without pipe</li>
          <li>31. Oktober | Bern<br>Valid event, 14:00 Uhr</li>
        </ul>
      </div>
    `;

    const events = await parseAmnestySwiss(90, badHTML);

    // Should only parse the valid event
    expect(events.length).toBe(1);
    expect(events[0].city).toBe('Bern');
  });

  it('should respect date range filter', async () => {
    const events = await parseAmnestySwiss(0, mockHTML); // 0 days = only past events

    // All events from mock HTML are in the future
    expect(events.length).toBe(0);
  });
});
