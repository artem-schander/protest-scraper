/**
 * Berlin Police - Protest event scraper
 * Source: https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/
 *
 * Scrapes protest/demonstration data from Berlin Police's public assembly registry.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import { ProtestEvent } from '@/scraper/scrape-protests.js';
import { LOCALES } from '@/scraper/config/locales.js';
import { parseDate } from '@/scraper/utils/date-parser.js';
import { parseGermanAttendees } from '@/scraper/utils/attendee-parser.js';
import { isAllowedByRobots } from '@/utils/robots.js';

const HEADERS = {
  'User-Agent': 'protest-scraper/1.0 (https://github.com/artem-schander/protest-scraper)',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
};

/**
 * Fetch HTML from a URL with error handling
 */
async function fetchHTML(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, { headers: HEADERS, timeout: 30000 });
    return response.data;
  } catch (error) {
    console.error(`[fetchHTML] Failed to fetch ${url}:`, (error as Error).message);
    return null;
  }
}

/**
 * Parse protests from Berlin Police website
 *
 * Table columns: Datum, Von, Bis, Thema, PLZ, Versammlungsort, Aufzugsstrecke
 *
 * @param days - Number of days forward to scrape (default: 90)
 * @returns Array of protest events
 */
export async function parseBerlinPolice(days: number = 90): Promise<ProtestEvent[]> {
  const url = 'https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/';

  // Check robots.txt before scraping
  const allowed = await isAllowedByRobots(url, 'protest-scraper/1.0');
  if (!allowed) {
    console.error('[Berlin Police] Blocked by robots.txt');
    return [];
  }

  const html = await fetchHTML(url);
  if (!html) return [];

  const locale = LOCALES['DE'];
  const now = dayjs().tz(locale.timezone);
  const maxDate = now.add(days, 'day');
  const $ = cheerio.load(html);
  const events: ProtestEvent[] = [];

  // Parse the table with columns: Datum, Von, Bis, Thema, PLZ, Versammlungsort, Aufzugsstrecke
  $('table#searchresults-table tbody tr').each((_, tr) => {
    const tds = $(tr)
      .find('td')
      .map((_, td) => $(td).text().trim())
      .get();

    if (tds.length < 4) return;

    const [datumTxt, vonTxt, bisTxt, thema, plz, ort] = tds;

    // Parse date and times using locale-aware parser with time detection
    const startParsed = parseDate(`${datumTxt} ${vonTxt}`, locale, true);
    const endParsed = parseDate(`${datumTxt} ${bisTxt}`, locale, true);

    // Skip if no valid start date
    if (!startParsed) return;

    // Skip events outside the date range
    if (startParsed.date.isAfter(maxDate)) return;

    // Build location string from postal code and place
    const location = [`${plz} Berlin`.trim(), ort].filter(Boolean).join(', ') || null;

    // Try to extract attendee count from theme/title
    const attendees = parseGermanAttendees(thema || '', locale);

    events.push({
      source: 'www.berlin.de',
      city: 'Berlin',
      country: locale.countryCode,
      title: thema || 'Versammlung',
      start: startParsed.date.toISOString(),
      startTimeKnown: startParsed.hasTime,
      end: endParsed ? endParsed.date.toISOString() : null,
      endTimeKnown: endParsed ? endParsed.hasTime : false,
      location,
      language: locale.language,
      url,
      attendees,
    });
  });

  return events;
}
