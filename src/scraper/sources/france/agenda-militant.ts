/**
 * Agenda Militant - Activist event scraper for Paris/Île-de-France
 * Source: https://www.agendamilitant.org/
 *
 * Scrapes protest and activist events from their calendar pages.
 * Uses pagination (?suite=N) to fetch multiple pages of events.
 * Coverage: Paris and Île-de-France region only.
 *
 * HTML Structure:
 * - Events are in table rows with class "odd" or "even"
 * - Month headers in <tr class="h"> with <h1>month year</h1>
 * - Day headers in <tr class="h"> with <h2>dayName dayNumber</h2>
 * - Event cells: c1=time, c2=category, c3=title+link, c4=location
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { ProtestEvent } from '@/scraper/scrape-protests.js';

// Initialize dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);
import { LOCALES } from '@/scraper/config/locales.js';
import { parseDate } from '@/scraper/utils/date-parser.js';
import { parseFrenchAttendees } from '@/scraper/utils/attendee-parser.js';
import { isAllowedByRobots } from '@/utils/robots.js';
import delay from '@/utils/delay.js';

const BASE_URL = 'https://www.agendamilitant.org';

const HEADERS = {
  'User-Agent': 'protest-scraper/1.0 (https://github.com/artem-schander/protest-scraper)',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};

/**
 * Build French month lookup from locale config
 * Converts string month numbers ("01") to integers (1)
 */
function buildMonthLookup(locale: typeof LOCALES['FR']): Record<string, number> {
  const lookup: Record<string, number> = {};
  for (const [name, num] of Object.entries(locale.monthNames)) {
    lookup[name.toLowerCase()] = parseInt(num, 10);
  }
  return lookup;
}

/**
 * Extract city from location string
 *
 * @param location - Location string (may contain postal code, arrondissement)
 * @returns City name or "Paris" as default for this source
 */
function extractCity(location: string | null): string {
  if (!location) return 'Paris';

  // Check for Paris arrondissement mentions (e.g., "Paris 19e", "Paris 10e")
  if (/paris\s*\d{1,2}e?/i.test(location)) {
    return 'Paris';
  }

  // Check for Île-de-France cities
  const idfCities: Record<string, RegExp> = {
    'Montreuil': /montreuil/i,
    'Saint-Denis': /saint-denis/i,
    'Saint-Ouen': /saint-ouen/i,
    'Nanterre': /nanterre/i,
    'Aubervilliers': /aubervilliers/i,
    'Pantin': /pantin/i,
    'Ivry-sur-Seine': /ivry/i,
    'Vitry-sur-Seine': /vitry/i,
    'Bobigny': /bobigny/i,
    'Créteil': /créteil/i,
    'Versailles': /versailles/i,
    'Malakoff': /malakoff/i,
    'Bagnolet': /bagnolet/i,
    'Gentilly': /gentilly/i,
  };

  for (const [city, pattern] of Object.entries(idfCities)) {
    if (pattern.test(location)) {
      return city;
    }
  }

  // Default to Paris for this source
  return 'Paris';
}

/**
 * Parse a single page of events from Agenda Militant
 *
 * @param html - HTML content of the page
 * @param locale - French locale configuration
 * @param now - Current datetime for filtering
 * @param maxDate - Maximum date for filtering
 * @returns Array of parsed events
 */
function parsePageEvents(
  html: string,
  locale: typeof LOCALES['FR'],
  now: dayjs.Dayjs,
  maxDate: dayjs.Dayjs
): ProtestEvent[] {
  const $ = cheerio.load(html);
  const events: ProtestEvent[] = [];
  const monthLookup = buildMonthLookup(locale);

  // Track current month/year/day as we parse table rows
  let currentMonth: number | null = null;
  let currentYear: number = now.year();
  let currentDay: number | null = null;

  // Iterate through all table rows
  $('table.big tr').each((_, row) => {
    const $row = $(row);

    // Check if this is a header row (month or day)
    if ($row.hasClass('h')) {
      // Check for month header (h1)
      const h1Text = $row.find('h1').text().trim().toLowerCase();
      if (h1Text) {
        // Parse month/year like "décembre 2025"
        const monthMatch = h1Text.match(/(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/);
        if (monthMatch) {
          currentMonth = monthLookup[monthMatch[1]];
          currentYear = parseInt(monthMatch[2], 10);
        }
      }

      // Check for day header (h2)
      const h2Text = $row.find('h2').text().trim().toLowerCase();
      if (h2Text) {
        // Parse day like "dimanche 7"
        const dayMatch = h2Text.match(/(\d{1,2})/);
        if (dayMatch) {
          currentDay = parseInt(dayMatch[1], 10);
        }
      }

      return; // Skip header rows for event parsing
    }

    // Check if this is an event row (odd or even class)
    if (!$row.hasClass('odd') && !$row.hasClass('even')) {
      return;
    }

    // Skip if we don't have date context
    if (!currentMonth || !currentDay) {
      return;
    }

    // Extract event data from cells
    const timeText = $row.find('td.c1').text().trim();
    const titleCell = $row.find('td.c3');
    const locationText = $row.find('td.c4').text().trim();

    // Get title and link
    const $link = titleCell.find('a').first();
    const title = $link.text().trim();
    const href = $link.attr('href') || '';

    if (!title || !href) {
      return;
    }

    // Parse time (e.g., "10h30", "14h00", "9h00")
    let hasTime = false;
    let hour = 0;
    let minute = 0;
    const timeMatch = timeText.match(/(\d{1,2})h(\d{2})?/);
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = parseInt(timeMatch[2] || '0', 10);
      hasTime = true;
    }

    // Build date string for parsing
    const monthStr = currentMonth.toString().padStart(2, '0');
    const dayStr = currentDay.toString().padStart(2, '0');
    const dateStr = hasTime
      ? `${dayStr}/${monthStr}/${currentYear} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      : `${dayStr}/${monthStr}/${currentYear}`;

    const parsed = parseDate(dateStr, locale, true);
    if (!parsed) {
      return;
    }

    const eventDate = parsed.date;

    // Skip events outside the date range
    if (eventDate.isBefore(now) || eventDate.isAfter(maxDate)) {
      return;
    }

    // Build full URL
    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}/${href}`;

    // Get city from location
    const city = extractCity(locationText);

    // Try to extract attendee count from title
    const attendees = parseFrenchAttendees(title, locale);

    events.push({
      source: 'agendamilitant.org',
      city,
      country: locale.countryCode,
      title,
      start: eventDate.toISOString(),
      startTimeKnown: hasTime,
      end: null,
      endTimeKnown: false,
      language: locale.language,
      location: locationText || null,
      url: fullUrl,
      attendees,
    });
  });

  return events;
}

/**
 * Parse protests from Agenda Militant website with pagination
 *
 * @param days - Number of days forward to include (default: 90)
 * @param htmlContent - Optional HTML content for testing (skips HTTP requests)
 * @returns Array of protest events
 */
export async function parseAgendaMilitant(
  days: number = 90,
  htmlContent?: string
): Promise<ProtestEvent[]> {
  const locale = LOCALES['FR'];
  const now = dayjs().tz(locale.timezone);
  const maxDate = now.add(days, 'day');
  const allEvents: ProtestEvent[] = [];
  const seenUrls = new Set<string>();

  // If test content provided, parse single page
  if (htmlContent) {
    return parsePageEvents(htmlContent, locale, now, maxDate);
  }

  // Check robots.txt before scraping
  const allowed = await isAllowedByRobots(BASE_URL, 'protest-scraper/1.0');
  if (!allowed) {
    console.error('[Agenda Militant] Blocked by robots.txt');
    return [];
  }

  // Paginate through pages
  const maxPages = Math.ceil(days / 30); // Roughly 1 page per month
  let hasMorePages = true;

  for (let page = 0; page < maxPages && hasMorePages; page++) {
    const url = page === 0 ? BASE_URL : `${BASE_URL}/?suite=${page}`;

    console.error(`[Agenda Militant] Fetching page ${page + 1}: ${url}`);

    try {
      const response = await axios.get(url, {
        headers: HEADERS,
        timeout: 30000,
        maxRedirects: 5,
      });

      const html = response.data;
      const pageEvents = parsePageEvents(html, locale, now, maxDate);

      // Dedupe and add events
      for (const event of pageEvents) {
        if (!seenUrls.has(event.url)) {
          seenUrls.add(event.url);
          allEvents.push(event);
        }
      }

      // Check if there's another page
      hasMorePages = html.includes('plus tard');

      // Rate limit
      await delay(1500);
    } catch (err) {
      const error = err as Error;
      console.error(`[Agenda Militant] Error on page ${page + 1}:`, error.message);
      break;
    }
  }

  console.error(`[Agenda Militant] Total parsed: ${allEvents.length} events`);
  return allEvents;
}
