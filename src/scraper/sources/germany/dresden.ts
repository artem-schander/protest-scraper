/**
 * Dresden City - Protest event scraper
 * Source: https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json
 *
 * Scrapes protest/demonstration data from Dresden City's public assembly JSON API.
 */

import axios from 'axios';
import dayjs from 'dayjs';
import { ProtestEvent } from '@/scraper/scrape-protests.js';
import { LOCALES } from '@/scraper/config/locales.js';
import { parseDate } from '@/scraper/utils/date-parser.js';
import { parseGermanAttendees } from '@/scraper/utils/attendee-parser.js';
import delay from '@/utils/delay.js';
import { isAllowedByRobots } from '@/utils/robots.js';

const HEADERS = {
  'User-Agent': 'protest-scraper/1.0 (https://github.com/artem-schander/protest-scraper)',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
};

interface DresdenEvent {
  Datum?: string;
  Zeit?: string;
  Thema?: string;
  Ort?: string;
  Startpunkt?: string;
  Teilnehmer?: string;
}

interface DresdenResponse {
  Versammlungen?: DresdenEvent[];
}

/**
 * Parse protests from Dresden City JSON API
 *
 * @param days - Number of days forward to scrape (default: 90)
 * @returns Array of protest events
 */
export async function parseDresdenCity(days: number = 90): Promise<ProtestEvent[]> {
  const url = 'https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json';

  // Check robots.txt before scraping
  const allowed = await isAllowedByRobots(url, 'protest-scraper/1.0');
  if (!allowed) {
    console.error('[Dresden City] Blocked by robots.txt');
    return [];
  }

  try {
    const response = await axios.get<DresdenResponse>(url, {
      headers: HEADERS,
      timeout: 30000,
    });
    await delay(1000);

    const locale = LOCALES['DE'];
    const now = dayjs().tz(locale.timezone);
    const maxDate = now.add(days, 'day');
    const data = response.data;
    const events: ProtestEvent[] = [];

    if (!data.Versammlungen || !Array.isArray(data.Versammlungen)) {
      console.error('[Dresden] No Versammlungen array found');
      return events;
    }

    console.error(`[Dresden] Processing ${data.Versammlungen.length} events`);

    for (const v of data.Versammlungen) {
      const dateTxt = v.Datum || '';
      const timeTxt = v.Zeit || '';
      const startDateString = timeTxt ? `${dateTxt} ${timeTxt.slice(0, 5)}` : dateTxt;
      const endDateString = timeTxt ? `${dateTxt} ${timeTxt.slice(8, 13)}` : dateTxt;

      // Parse with time detection
      const startParsed = parseDate(startDateString, locale, true);
      const endParsed = endDateString ? parseDate(endDateString, locale, true) : null;

      // Skip if no valid start date
      if (!startParsed) {
        console.error(`[Dresden] Failed to parse date: "${startDateString}"`);
        continue;
      }

      // Skip events outside the date range
      if (startParsed.date.isAfter(maxDate)) {
        continue;
      }

      let attendees: number | null = null;
      const teilnehmerNum = parseInt(v.Teilnehmer || '', 10);
      if (!isNaN(teilnehmerNum) && teilnehmerNum > 0) {
        attendees = teilnehmerNum;
      } else {
        attendees = parseGermanAttendees(v.Thema || '', locale);
      }

      let location = 'Dresden';
      if (v.Ort || v.Startpunkt) {
        location += ', ' + (v.Ort || v.Startpunkt);
      }

      events.push({
        source: 'www.dresden.de',
        city: 'Dresden',
        country: locale.countryCode,
        title: v.Thema || 'Versammlung',
        start: startParsed.date.toISOString(),
        startTimeKnown: startParsed.hasTime,
        end: endParsed ? endParsed.date.toISOString() : null,
        endTimeKnown: endParsed ? endParsed.hasTime : false,
        language: locale.language,
        location,
        url: 'https://www.dresden.de/de/rathaus/dienstleistungen/versammlungsuebersicht.php',
        attendees,
      });
    }

    return events;
  } catch (e) {
    const error = e as Error;
    console.error('[parseDresdenCity error]', error.message);
    console.error(error.stack);
    return [];
  }
}
