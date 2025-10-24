import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { parseBerlinPolice } from '@/scraper/sources/germany/berlin.js';

describe('Berlin Police Parser', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    mock.restore();
  });

  it('should return an array of events', async () => {
    const mockHTML = `
      <table id="searchresults-table">
        <tbody>
          <tr>
            <td>23.10.2025</td>
            <td>14:00</td>
            <td>16:00</td>
            <td>Demonstration für Klimaschutz</td>
            <td>10117</td>
            <td>Brandenburg Gate</td>
          </tr>
        </tbody>
      </table>
    `;

    mock.onGet('https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/').reply(200, mockHTML);

    const events = await parseBerlinPolice();

    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
  });

  it('should parse event with correct fields', async () => {
    const mockHTML = `
      <table id="searchresults-table">
        <tbody>
          <tr>
            <td>23.10.2025</td>
            <td>14:00</td>
            <td>16:00</td>
            <td>Demo ca. 5000 Teilnehmer</td>
            <td>10117</td>
            <td>Pariser Platz</td>
          </tr>
        </tbody>
      </table>
    `;

    mock.onGet('https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/').reply(200, mockHTML);

    const events = await parseBerlinPolice();

    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({
      source: 'www.berlin.de',
      city: 'Berlin',
      country: 'DE',
      language: 'de-DE',
      title: 'Demo ca. 5000 Teilnehmer',
    });

    expect(events[0].start).toBeTruthy();
    expect(new Date(events[0].start).toString()).not.toBe('Invalid Date');
  });

  it('should parse attendee count from title', async () => {
    const mockHTML = `
      <table id="searchresults-table">
        <tbody>
          <tr>
            <td>23.10.2025</td>
            <td>14:00</td>
            <td>16:00</td>
            <td>Demo mit ca. 5000 Teilnehmern</td>
            <td>10117</td>
            <td>Pariser Platz</td>
          </tr>
        </tbody>
      </table>
    `;

    mock.onGet('https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/').reply(200, mockHTML);

    const events = await parseBerlinPolice();

    expect(events[0].attendees).toBe(5000);
  });

  it('should include postal code in location', async () => {
    const mockHTML = `
      <table id="searchresults-table">
        <tbody>
          <tr>
            <td>23.10.2025</td>
            <td>14:00</td>
            <td>16:00</td>
            <td>Demonstration</td>
            <td>10117</td>
            <td>Pariser Platz</td>
          </tr>
        </tbody>
      </table>
    `;

    mock.onGet('https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/').reply(200, mockHTML);

    const events = await parseBerlinPolice();

    expect(events[0].location).toContain('10117');
    expect(events[0].location).toContain('Berlin');
    expect(events[0].location).toContain('Pariser Platz');
  });

  it('should handle missing end time', async () => {
    const mockHTML = `
      <table id="searchresults-table">
        <tbody>
          <tr>
            <td>23.10.2025</td>
            <td>14:00</td>
            <td></td>
            <td>Demonstration</td>
            <td>10117</td>
            <td>Pariser Platz</td>
          </tr>
        </tbody>
      </table>
    `;

    mock.onGet('https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/').reply(200, mockHTML);

    const events = await parseBerlinPolice();

    // When end time is empty, parser still creates a valid end date
    expect(events[0].end).toBeTruthy();
    expect(new Date(events[0].end!).toString()).not.toBe('Invalid Date');
  });

  it('should handle network errors gracefully', async () => {
    mock.onGet('https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/').networkError();

    const events = await parseBerlinPolice();

    expect(events).toEqual([]);
  });

  it('should handle empty table', async () => {
    const mockHTML = `
      <table id="searchresults-table">
        <tbody></tbody>
      </table>
    `;

    mock.onGet('https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/').reply(200, mockHTML);

    const events = await parseBerlinPolice();

    expect(events).toEqual([]);
  });

  it('should skip rows with invalid dates', async () => {
    const mockHTML = `
      <table id="searchresults-table">
        <tbody>
          <tr>
            <td>invalid-date</td>
            <td>14:00</td>
            <td>16:00</td>
            <td>Should be skipped</td>
            <td>10117</td>
            <td>Place</td>
          </tr>
          <tr>
            <td>23.10.2025</td>
            <td>14:00</td>
            <td>16:00</td>
            <td>Valid event</td>
            <td>10117</td>
            <td>Place</td>
          </tr>
        </tbody>
      </table>
    `;

    mock.onGet('https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/').reply(200, mockHTML);

    const events = await parseBerlinPolice();

    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Valid event');
  });
});
