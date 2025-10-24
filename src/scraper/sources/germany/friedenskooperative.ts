/**
 * Friedenskooperative - Protest event scraper
 * Source: https://www.friedenskooperative.de/termine
 *
 * Scrapes peace and protest events from Friedenskooperative's website.
 * Loops through multiple categories and pages.
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
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
};

// Category mappings: ID -> English name
const CATEGORIES: Record<string, string> = {
  '34': 'Demonstration',
  '35': 'Vigil',
  '53': 'Government Event',
  '54': 'Counter-Demonstration',
  '55': 'Blockade',
};

/**
 * Parse protests from Friedenskooperative website
 *
 * Loops through 5 categories and paginated results per category.
 *
 * @param days - Number of days forward to scrape (default: 90)
 * @returns Array of protest events
 */
export async function parseFriedenskooperative(days: number = 90): Promise<ProtestEvent[]> {
  const base = 'https://www.friedenskooperative.de';
  const endpoint = `${base}/views/ajax`;

  // Check robots.txt before scraping
  const allowed = await isAllowedByRobots(endpoint, 'protest-scraper/1.0');
  if (!allowed) {
    console.error('[Friedenskooperative] Blocked by robots.txt');
    return [];
  }

  const locale = LOCALES['DE'];
  const now = dayjs().tz(locale.timezone);
  const maxDate = now.add(days, 'day');
  const events: ProtestEvent[] = [];

  try {
    // Loop through all categories
    for (const [categoryId, categoryName] of Object.entries(CATEGORIES)) {
      let page = 0;
      let hasMore = true;

      console.error(`[Friedenskooperative] Scraping category ${categoryId}: ${categoryName}`);

      while (hasMore) {
        // Build form data (most params are boilerplate from the site)
        const formData = new URLSearchParams({
          page: page.toString(),
          view_name: 'termine',
          view_display_id: 'page',
          view_args: '',
          view_path: 'node/33',
          view_base_path: 'termine',
          view_dom_id: 'c591d6225e0201870f07992dce6c489c',
          pager_element: '0',
          field_date_event_rrule: '1',
          bundesland: 'All',
          veranstaltungsart: categoryId, // Category filter
          thema: 'All',
        });

        try {
          const response = await axios.post(endpoint, formData.toString(), {
            headers: {
              ...HEADERS,
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
            },
            timeout: 30000,
          });

          await delay(1500); // Respect rate limits

          // Response is JSON array with commands
          const jsonResponse = response.data;
          if (!Array.isArray(jsonResponse)) {
            hasMore = false;
            break;
          }

          // Find the "insert" command with HTML content
          let html: string | null = null;
          for (const cmd of jsonResponse) {
            if (cmd.command === 'insert' && cmd.data) {
              html = cmd.data;
              break;
            }
          }

          if (!html) {
            hasMore = false;
            break;
          }

          const $ = cheerio.load(html);

          // Parse events grouped by month/year headings
          const viewContent = $('.view-content').last();
          let currentMonthYear = '';

          viewContent.children().each((_, elem) => {
            const $elem = $(elem);

            // Check if this is a month/year heading (h3)
            if ($elem.is('h3')) {
              currentMonthYear = $elem.text().trim(); // e.g., "Oktober 2025"
              return;
            }

            // Check if this is a box with events
            if ($elem.is('.box')) {
              // Each box can contain multiple events
              $elem.find('.row.row-eq-height').each((_, row) => {
                const $row = $(row);

                // Extract title and link
                const titleLink = $row.find('h2.node-title a').first();
                const title = titleLink.text().trim() || 'Friedensaktion';
                const relativeUrl = titleLink.attr('href') || '';
                const url = relativeUrl.startsWith('http') ? relativeUrl : base + relativeUrl;

                // Extract date from .date-column .date
                const dateElem = $row.find('.date-column .date').first();
                let dateStr = dateElem.find('.date-display-single').first().text().trim();

                // Check for date range format: <div class="date-display-range">
                const dateRange = dateElem.find('.date-display-range');
                let endTimeStr: string | null = null;
                if (dateRange.length > 0) {
                  const startTime = dateRange.find('.date-display-start').text().trim();
                  const endTime = dateRange.find('.date-display-end').text().trim();

                  // dateStr is like "02. Apr", startTime is "13:00", endTime is "17:00"
                  if (startTime) {
                    dateStr = `${dateStr} ${startTime}`;
                  }
                  if (endTime) {
                    endTimeStr = `${dateStr.split(' ')[0]} ${endTime}`; // Same date, different time
                  }
                }

                // Combine with month/year from heading
                // dateStr is like "18. Okt 18:00", currentMonthYear is "Oktober 2025"
                // Extract year from currentMonthYear
                const yearMatch = currentMonthYear.match(/(\d{4})/);
                const year = yearMatch ? yearMatch[1] : now.year().toString();
                const fullDateStr = `${dateStr} ${year}`;

                // Parse with time detection
                const startParsed = parseDate(fullDateStr, locale, true);
                if (!startParsed) return;

                // Skip events outside the date range
                if (startParsed.date.isAfter(maxDate)) return;

                // Parse end date if exists
                let endParsed = null;
                if (endTimeStr) {
                  const fullEndDateStr = `${endTimeStr} ${year}`;
                  endParsed = parseDate(fullEndDateStr, locale, true);
                }

                // Extract city from .date-column .city
                let city: string | null = $row.find('.date-column .city').text().trim() || null;

                // Extract location from .place.line.info
                let location: string | null = null;
                const placeInfo = $row.find('.place.line.info span').text().trim();
                if (placeInfo) {
                  location = placeInfo;
                  // If no city yet, try to extract from location (first part before comma)
                  if (!city) {
                    const cityMatch = placeInfo.match(/^([^,]+)/);
                    city = cityMatch ? cityMatch[1].trim() : null;
                  }
                }

                // If still no location, use city
                if (!location && city) {
                  location = city;
                }

                // Extract full text for attendees parsing
                const fullText = $row.text();
                const attendees = parseGermanAttendees(fullText, locale);

                events.push({
                  source: 'www.friedenskooperative.de',
                  city,
                  country: locale.countryCode,
                  title,
                  start: startParsed.date.toISOString(),
                  startTimeKnown: startParsed.hasTime,
                  end: endParsed ? endParsed.date.toISOString() : null,
                  endTimeKnown: endParsed ? endParsed.hasTime : false,
                  language: locale.language,
                  location: location || city,
                  url,
                  attendees,
                  categories: [categoryName],
                });
              });
            }
          });

          const eventCount = $('.view-content').last().find('.row.row-eq-height').length;
          if (eventCount === 0) {
            hasMore = false;
            break;
          }

          page++;

          // Safety limit: max 20 pages per category
          if (page >= 20) {
            hasMore = false;
          }
        } catch (err) {
          const error = err as Error;
          console.error(`[Friedenskooperative] Error on category ${categoryId}, page ${page}:`, error.message);
          hasMore = false;
        }
      }
    }

    return events;
  } catch (e) {
    const error = e as Error;
    console.error('[parseFriedenskooperative error]', error.message);
    return [];
  }
}
