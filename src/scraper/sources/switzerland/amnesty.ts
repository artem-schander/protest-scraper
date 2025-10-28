/**
 * Amnesty International Switzerland - Protest event scraper
 * Source: https://www.amnesty.ch/de/themen/recht-auf-protest/demo-kalender
 *
 * Scrapes protest events from Amnesty International Switzerland's demo calendar.
 * Events are organized by month with h5 headings.
 *
 * NOTE: Site has Cloudflare protection with rate limiting.
 * - First request usually works fine
 * - Repeated requests (debugging) may trigger 403
 * - Production with delays between scrapes should work normally
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import { ProtestEvent } from '@/scraper/scrape-protests.js';
import { LOCALES } from '@/scraper/config/locales.js';
import { parseDate } from '@/scraper/utils/date-parser.js';
import { parseGermanAttendees } from '@/scraper/utils/attendee-parser.js';
import delay from '@/utils/delay.js';
import { isAllowedByRobots } from '@/utils/robots.js';

const HEADERS = {
  'User-Agent': 'protest-scraper/1.0 (https://github.com/artem-schander/protest-scraper)',
  'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
};

/**
 * Parse protests from Amnesty International Switzerland calendar
 *
 * @param days - Number of days forward to scrape (default: 90)
 * @param htmlContent - Optional pre-fetched HTML content (bypasses axios fetch)
 * @returns Array of protest events
 */
export async function parseAmnestySwiss(days: number = 90, htmlContent?: string): Promise<ProtestEvent[]> {
  const url = 'https://www.amnesty.ch/de/themen/recht-auf-protest/demo-kalender';

  const locale = LOCALES['CH'];
  const now = dayjs().tz(locale.timezone);
  const maxDate = now.add(days, 'day');
  const events: ProtestEvent[] = [];

  try {
    let html: string;

    if (htmlContent) {
      // Use pre-fetched HTML (e.g., from Playwright or browser)
      html = htmlContent;
    } else {
      // Check robots.txt before scraping
      const allowed = await isAllowedByRobots(url, 'protest-scraper/1.0');
      if (!allowed) {
        console.error('[Amnesty Switzerland] Blocked by robots.txt');
        return [];
      }

      // Add delay before fetching to avoid rate limiting
      await delay(2000);

      // Fetch with axios
      const response = await axios.get(url, {
        headers: {
          ...HEADERS,
          'Referer': 'https://www.amnesty.ch/de/themen/recht-auf-protest',
        },
        timeout: 30000,
        maxRedirects: 5,
      });

      html = response.data;
    }

    const $ = cheerio.load(html);

    // Events are organized by month (h5 headings)
    let currentMonthYear = '';

    // Find the content container (try multiple selectors)
    const $content = $('#article-body').length ? $('#article-body') :
                     $('.main-content').length ? $('.main-content') :
                     $('main').length ? $('main') :
                     $('body');

    // Iterate through all h5 and li elements, tracking month headings
    $content.find('h5, li').each((_, elem) => {
      const $elem = $(elem);

      // Check if this is a month/year heading (h5)
      if ($elem.is('h5')) {
        currentMonthYear = $elem.text().trim(); // e.g., "Oktober 2025"
        return;
      }

      // Check if this is an event list item
      if ($elem.is('li')) {
        try {
          // Get HTML to parse BR tags properly
          const html = $elem.html() || '';
          if (!html || html.length < 10) return;

          // Split by BR tags to get two lines
          const parts = html.split(/<br\s*\/?>/i).map((p) => {
            // Remove HTML tags and decode entities
            const $temp = cheerio.load(p);
            return $temp.root().text().trim();
          }).filter((p) => p);

          if (parts.length < 2) return;

          // Line 1: "22. November | Bern"
          const firstLine = parts[0];
          const dateMatch = firstLine.match(/(\d{1,2}\.\s*\w+)\s*\|\s*(.+)/);
          if (!dateMatch) return;

          const dayMonth = dateMatch[1].trim(); // "22. November"
          const city = dateMatch[2].trim(); // "Bern"

          // Skip "Verschiedene Städte" (Various Cities) - not a valid single protest location
          if (city.toLowerCase().includes('verschieden')) {
            return;
          }

          // Line 2: "Kundgebung für das Gesundheitspersonal, Bundesplatz, 14:15 Uhr, Link"
          // Strategy: Find time position, split everything before it by commas
          // Last part before time = location, everything else = title
          const secondLine = parts[1];

          // Find time pattern "HH:MM Uhr" or "HH:MM" or "HH.MM Uhr"
          const timeMatch = secondLine.match(/(\d{1,2}[:.]\d{2})\s*Uhr/);
          let timeStr: string | null = null;
          let title: string;
          let location: string | null = null;

          if (timeMatch) {
            timeStr = timeMatch[1]; // "14:15"

            // Everything before the time
            const beforeTime = secondLine.substring(0, timeMatch.index).trim();

            // Split by comma
            const commaParts = beforeTime.split(',').map((p: string) => p.trim()).filter((p: string) => p);

            if (commaParts.length === 0) return;

            if (commaParts.length === 1) {
              // Only title, no location
              title = commaParts[0];
            } else {
              // Last part is location, everything else is title
              location = commaParts[commaParts.length - 1];
              title = commaParts.slice(0, -1).join(', ');
            }
          } else {
            // No time found - split by commas, remove "Link" parts
            const commaParts = secondLine.split(',').map((p: string) => p.trim()).filter((p: string) => p && !p.toLowerCase().includes('link'));

            if (commaParts.length === 0) return;

            if (commaParts.length === 1) {
              // Only title
              title = commaParts[0];
            } else {
              // Last part is location, everything else is title
              location = commaParts[commaParts.length - 1];
              title = commaParts.slice(0, -1).join(', ');
            }
          }

          // Extract link if present
          const linkElem = $elem.find('a').first();
          let eventUrl = url; // Default to calendar page
          if (linkElem.length > 0) {
            const href = linkElem.attr('href');
            if (href) {
              eventUrl = href.startsWith('http') ? href : `https://www.amnesty.ch${href}`;
            }
          }

          // Parse date
          // Extract year from currentMonthYear ("Oktober 2025" → "2025")
          const yearMatch = currentMonthYear.match(/(\d{4})/);
          const year = yearMatch ? yearMatch[1] : now.year().toString();

          // Combine day/month with year and time
          let fullDateStr = `${dayMonth} ${year}`;
          if (timeStr) {
            // Clean time string (remove " Uhr")
            const cleanTime = timeStr.replace(/uhr/gi, '').trim();
            fullDateStr = `${fullDateStr} ${cleanTime}`;
          }

          // Parse with time detection
          const startParsed = parseDate(fullDateStr, locale, true);
          if (!startParsed) {
            console.error('[Amnesty Switzerland] Failed to parse date:', fullDateStr);
            return;
          }

          // Skip events outside the date range
          if (startParsed.date.isAfter(maxDate)) return;

          // Parse attendees from full text (get text content of li)
          const fullText = $elem.text();
          const attendees = parseGermanAttendees(fullText, locale);

          events.push({
            source: 'www.amnesty.ch',
            city,
            country: locale.countryCode,
            title,
            start: startParsed.date.toISOString(),
            startTimeKnown: startParsed.hasTime,
            end: null,
            endTimeKnown: false,
            language: locale.language,
            location: location || city,
            url: eventUrl,
            attendees,
            categories: ['Demonstration'],
          });
        } catch (err) {
          // Skip malformed events
          const error = err as Error;
          console.error('[Amnesty Switzerland] Error parsing event:', error.message, error.stack);
        }
      }
    });

    return events;
  } catch (e) {
    const error = e as Error;
    console.error('[parseAmnestySwiss error]', error.message);
    return [];
  }
}
