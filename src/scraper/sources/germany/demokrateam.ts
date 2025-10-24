/**
 * DemokraTEAM - Protest event scraper
 * Source: https://demokrateam.de/
 *
 * Scrapes protest/demonstration events from DemokraTEAM's WordPress AJAX endpoint.
 * Loops through next 3 months of events.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import dayjs, { Dayjs } from 'dayjs';
import { ProtestEvent } from '@/scraper/scrape-protests.js';
import { LOCALES } from '@/scraper/config/locales.js';
import { parseGermanAttendees } from '@/scraper/utils/attendee-parser.js';
import { parseDate } from '@/scraper/utils/date-parser.js';
import delay from '@/utils/delay.js';
import { isAllowedByRobots } from '@/utils/robots.js';

const HEADERS = {
  'User-Agent': 'protest-scraper/1.0 (https://github.com/artem-schander/protest-scraper)',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
};

/**
 * Parse protests from DemokraTEAM website
 *
 * Loops through months based on days parameter and fetches events via WordPress AJAX endpoint.
 *
 * @param days - Number of days forward to scrape (default: 90)
 * @returns Array of protest events
 */
export async function parseDemokrateam(days: number = 90): Promise<ProtestEvent[]> {
  const base = 'https://www.demokrateam.org';
  const endpoint = `${base}/wp-admin/admin-ajax.php`;

  // Check robots.txt before scraping
  const allowed = await isAllowedByRobots(endpoint, 'protest-scraper/1.0');
  if (!allowed) {
    console.error('[DemokraTEAM] Blocked by robots.txt');
    return [];
  }

  const locale = LOCALES['DE'];
  const now = dayjs().tz(locale.timezone);
  const endDate = now.add(days, 'day');
  const monthsToScrape = Math.ceil(days / 30); // Convert days to months, round up
  const events: ProtestEvent[] = [];

  try {
    // Loop through calculated number of months based on days parameter
    for (let monthOffset = 0; monthOffset < monthsToScrape; monthOffset++) {
      const targetMonth = now.add(monthOffset, 'month');
      const yearMonth = targetMonth.format('YYYY-MM');

      console.error(`[DemokraTEAM] Scraping month: ${yearMonth}`);

      // Build form data for AJAX request (WordPress Modern Events Calendar)
      // Must include all atts[] parameters from the website's calendar configuration
      const formData = new URLSearchParams({
        action: 'mec_daily_view_load_month',
        mec_year: targetMonth.format('YYYY'),
        mec_month: targetMonth.format('MM'),
        mec_day: targetMonth.date().toString(),

        // Calendar skin and view configuration
        'atts[skin]': 'daily_view',
        'atts[sk-options][list][limit]': '30',
        'atts[sk-options][daily_view][style]': 'classic',
        'atts[sk-options][daily_view][start_date_type]': 'today',
        'atts[sk-options][daily_view][limit]': '250',
        'atts[sk-options][daily_view][display_label]': '1',
        'atts[sk-options][daily_view][display_categories]': '1',

        // Search filter configuration for daily view
        'atts[sf-options][daily_view][label][type]': 'simple-checkboxes',
        'atts[sf_status]': '1',
        'atts[show_ongoing_events]': '1',

        // Actual search filters (sf[...])
        'sf[label]': '4324', // Demo/Protest category filter
        'sf[month]': targetMonth.format('MM'),
        'sf[year]': targetMonth.format('YYYY'),
        'apply_sf_date': '1',
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

        const data = response.data;
        if (!data || typeof data !== 'object' || !data.month) continue;

        const html = data.month;
        if (!html || typeof html !== 'string') continue;

        const $ = cheerio.load(html);

        // Parse each event article
        $('.mec-event-article').each((_, article) => {
          const $article = $(article);

          // Skip "no event" articles
          if ($article.find('.mec-no-event').length > 0) return;

          // Extract title
          const title = $article.find('h4.mec-event-title a').text().trim() || 'Demo';

          // Extract link
          const link = $article.find('h4.mec-event-title a').attr('href') || `${base}/aktionen/`;

          // Extract time from the rendered HTML
          const timeText = $article.find('.mec-event-time').text().trim().replace(/\s+/g, ' ');

          // Parse date from JSON-LD structured data (follows each article)
          let eventDate: Dayjs | null = null;
          let hasTime = false;

          // Find the next script tag with JSON-LD data
          const nextScript = $article.next('script[type="application/ld+json"]');
          if (nextScript.length > 0) {
            try {
              const jsonText = nextScript.html() || '';
              const jsonData = JSON.parse(jsonText);

              if (jsonData.startDate) {
                let dateStr = jsonData.startDate; // Format: "2025-10-25"

                // Add time if available
                if (timeText) {
                  const timeMatch = timeText.match(/(\d{1,2}):(\d{2})/);
                  if (timeMatch) {
                    const hour = timeMatch[1].padStart(2, '0');
                    const minute = timeMatch[2];
                    dateStr = `${dateStr} ${hour}:${minute}`;
                    hasTime = true;
                  }
                }

                const parsed = parseDate(dateStr, locale, true);
                if (parsed) {
                  eventDate = parsed.date;
                  if (!hasTime) hasTime = parsed.hasTime;
                }
              }
            } catch (err) {
              // JSON parsing failed, will use fallback
            }
          }

          // Fallback: use month/year from request
          if (!eventDate) {
            eventDate = dayjs.tz(
              `${targetMonth.format('YYYY')}-${targetMonth.format('MM')}-15`,
              locale.timezone
            );
            hasTime = false;
          }

          // Extract location from mec-event-loc-place
          const location = $article.find('.mec-event-loc-place').text().trim() || null;

          // Extract city from location string (first word is usually the city)
          let city: string | null = null;
          if (location) {
            const cityMatch = location.match(/^([^,]+)/);
            if (cityMatch) {
              city = cityMatch[1].trim();
            }
          }

          // Skip events outside the date range
          if (eventDate.isAfter(endDate)) {
            return;
          }

          // Try to extract attendee count from title
          const attendees = parseGermanAttendees(title, locale);

          events.push({
            source: 'www.demokrateam.org',
            city,
            country: locale.countryCode,
            title,
            start: eventDate.toISOString(),
            startTimeKnown: hasTime,
            end: null,
            language: locale.language,
            location,
            url: link,
            attendees,
          });
        });
      } catch (err) {
        const error = err as Error;
        console.error(`[DemokraTEAM] Error on month ${yearMonth}:`, error.message);
        continue;
      }
    }

    return events;
  } catch (e) {
    const error = e as Error;
    console.error('[parseDemokrateam error]', error.message);
    return [];
  }
}
