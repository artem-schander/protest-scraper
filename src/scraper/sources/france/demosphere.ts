/**
 * Demosphere - Regional activist calendar network for France
 * Source: https://demosphere.net/
 *
 * Scrapes protest and activist events from regional Demosphere calendars.
 * Each region has its own subdomain (toulouse.demosphere.net, lille.demosphere.net, etc.)
 *
 * Uses well-structured RSS feeds with:
 * - dcterms:temporal for event dates (ISO 8601)
 * - dcterms:spatial for location text
 * - georss:point for coordinates
 * - Pagination via limit/offset parameters
 */

import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { ProtestEvent } from '@/scraper/scrape-protests.js';

// Initialize dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);
import { LOCALES } from '@/scraper/config/locales.js';
import { parseFrenchAttendees } from '@/scraper/utils/attendee-parser.js';
import { isAllowedByRobots } from '@/utils/robots.js';
import delay from '@/utils/delay.js';

const HEADERS = {
  'User-Agent': 'protest-scraper/1.0 (https://github.com/artem-schander/protest-scraper)',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};

/**
 * Demosphere region configuration
 */
interface DemosphereRegion {
  /** Subdomain (e.g., "toulouse") */
  subdomain: string;
  /** City name for the region */
  city: string;
  /** Whether the region is active */
  active: boolean;
}

/**
 * Active Demosphere regions
 * Paris is CLOSED, so we don't include it
 */
const REGIONS: DemosphereRegion[] = [
  { subdomain: 'toulouse', city: 'Toulouse', active: true },
  { subdomain: 'lille', city: 'Lille', active: true },
  { subdomain: 'nice', city: 'Nice', active: true },
  { subdomain: 'rennes', city: 'Rennes', active: true },
  { subdomain: 'strasbourg', city: 'Strasbourg', active: true },
  { subdomain: 'gironde', city: 'Bordeaux', active: true },
  { subdomain: 'nantes', city: 'Nantes', active: true },
  { subdomain: 'lyon', city: 'Lyon', active: true },
  { subdomain: 'grenoble', city: 'Grenoble', active: true },
  { subdomain: 'montpellier', city: 'Montpellier', active: true },
];

/**
 * Extract event start date from dcterms:temporal
 * Format: "start=2025-12-07T09:00:00+01:00;scheme=W3C-DTF"
 *
 * @param temporal - The dcterms:temporal value
 * @returns Object with ISO date string and hasTime flag, or null
 */
function parseTemporalDate(temporal: string): { date: string; hasTime: boolean } | null {
  if (!temporal) return null;

  // Extract start date from temporal string
  const startMatch = temporal.match(/start=([^;]+)/);
  if (!startMatch) return null;

  const dateStr = startMatch[1];

  // Check if the time is exactly 00:00:00 (might mean "no time specified")
  const hasTime = !dateStr.includes('T00:00:00');

  try {
    const parsed = dayjs(dateStr);
    if (!parsed.isValid()) return null;

    return {
      date: parsed.toISOString(),
      hasTime,
    };
  } catch {
    return null;
  }
}

/**
 * Extract city from spatial location string
 * Format varies: "Toulouse 31000", "31000 Toulouse", "Some Place, Toulouse", etc.
 *
 * @param spatial - The dcterms:spatial value
 * @param defaultCity - Default city for the region
 * @returns City name
 */
function extractCityFromSpatial(spatial: string | null, defaultCity: string): string {
  if (!spatial) return defaultCity;

  // Common French cities to detect
  const cities = [
    'Toulouse', 'Lille', 'Nice', 'Rennes', 'Strasbourg', 'Bordeaux',
    'Nantes', 'Lyon', 'Grenoble', 'Montpellier', 'Marseille', 'Paris',
  ];

  for (const city of cities) {
    if (spatial.toLowerCase().includes(city.toLowerCase())) {
      return city;
    }
  }

  return defaultCity;
}

/**
 * Parse RSS items from Demosphere feed
 *
 * @param xml - RSS XML content
 * @param region - Region configuration
 * @param locale - French locale configuration
 * @param now - Current datetime for filtering
 * @param maxDate - Maximum date for filtering
 * @returns Array of parsed events
 */
function parseRssItems(
  xml: string,
  region: DemosphereRegion,
  locale: typeof LOCALES['FR'],
  now: dayjs.Dayjs,
  maxDate: dayjs.Dayjs
): ProtestEvent[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const events: ProtestEvent[] = [];

  $('item').each((_, item) => {
    const $item = $(item);

    const title = $item.find('title').text().trim();
    const link = $item.find('link').text().trim();
    const description = $item.find('description').text().trim();

    // Get temporal (event date)
    const temporal = $item.find('dcterms\\:temporal, temporal').text().trim();
    const spatial = $item.find('dcterms\\:spatial, spatial').text().trim();

    // Get categories
    const categories: string[] = [];
    $item.find('category').each((_, cat) => {
      const catText = $(cat).text().trim();
      if (catText) categories.push(catText);
    });

    if (!title || !link) return;

    // Parse event date
    const dateInfo = parseTemporalDate(temporal);
    if (!dateInfo) {
      return;
    }

    const eventDate = dayjs(dateInfo.date);

    // Skip events outside the date range
    if (eventDate.isBefore(now) || eventDate.isAfter(maxDate)) {
      return;
    }

    // Extract city from spatial or use default
    const city = extractCityFromSpatial(spatial, region.city);

    // Clean up location - extract postal code if present
    let location = spatial || null;
    if (location) {
      // Remove date prefix that sometimes appears in spatial field
      // e.g., "lundi 8 décembre 2025 - Toulouse 31000"
      const cleanedLocation = location.replace(/^[a-zéè]+\s+\d{1,2}\s+[a-zéèû]+\s+\d{4}\s*-\s*/i, '');
      location = cleanedLocation || location;
    }

    // Try to extract attendee count from description
    const attendees = parseFrenchAttendees(description, locale);

    // Note: Coordinates from georss:point are available but geocoding is handled during import
    // The import script will geocode based on the location field

    events.push({
      source: `${region.subdomain}.demosphere.net`,
      city,
      country: locale.countryCode,
      title,
      start: dateInfo.date,
      startTimeKnown: dateInfo.hasTime,
      end: null,
      endTimeKnown: false,
      language: locale.language,
      location,
      url: link,
      attendees,
      categories: categories.length > 0 ? categories : undefined,
    });
  });

  return events;
}

/**
 * Parse events from a specific Demosphere region
 *
 * @param region - Region configuration
 * @param days - Number of days forward to include
 * @param xmlContent - Optional XML content for testing
 * @returns Array of protest events
 */
async function parseDemosphereRegion(
  region: DemosphereRegion,
  days: number = 90,
  xmlContent?: string
): Promise<ProtestEvent[]> {
  const locale = LOCALES['FR'];
  const now = dayjs().tz(locale.timezone);
  const maxDate = now.add(days, 'day');
  const allEvents: ProtestEvent[] = [];
  const seenUrls = new Set<string>();

  const baseUrl = `https://${region.subdomain}.demosphere.net`;

  // If test content provided, parse single page
  if (xmlContent) {
    return parseRssItems(xmlContent, region, locale, now, maxDate);
  }

  // Check robots.txt before scraping
  const allowed = await isAllowedByRobots(baseUrl, 'protest-scraper/1.0');
  if (!allowed) {
    console.error(`[Demosphere ${region.city}] Blocked by robots.txt`);
    return [];
  }

  // Paginate through the RSS feed
  const pageSize = 100;
  const maxPages = 5; // Max 500 events per region
  let offset = 0;
  let hasMore = true;

  for (let page = 0; page < maxPages && hasMore; page++) {
    const url = `${baseUrl}/events.xml?limit=${pageSize}&offset=${offset}`;

    console.error(`[Demosphere ${region.city}] Fetching: ${url}`);

    try {
      // Allow self-signed or expired SSL certificates (public data, no sensitive info)
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const response = await axios.get(url, {
        headers: HEADERS,
        timeout: 30000,
        httpsAgent,
      });

      const xml = response.data;
      const pageEvents = parseRssItems(xml, region, locale, now, maxDate);

      // Dedupe and add events
      let newEvents = 0;
      for (const event of pageEvents) {
        if (!seenUrls.has(event.url)) {
          seenUrls.add(event.url);
          allEvents.push(event);
          newEvents++;
        }
      }

      // If we got fewer events than page size, no more pages
      // Also stop if no new events were added (all dupes or out of range)
      hasMore = pageEvents.length === pageSize && newEvents > 0;
      offset += pageSize;

      // Rate limit
      await delay(1000);
    } catch (err) {
      const error = err as Error;
      console.error(`[Demosphere ${region.city}] Error:`, error.message);
      break;
    }
  }

  console.error(`[Demosphere ${region.city}] Parsed ${allEvents.length} events`);
  return allEvents;
}

// Export individual region parsers

/**
 * Parse events from Demosphere Toulouse
 */
export async function parseDemosphereToulouse(
  days: number = 90,
  xmlContent?: string
): Promise<ProtestEvent[]> {
  const region = REGIONS.find(r => r.subdomain === 'toulouse')!;
  return parseDemosphereRegion(region, days, xmlContent);
}

/**
 * Parse events from Demosphere Lille
 */
export async function parseDemosphereLille(
  days: number = 90,
  xmlContent?: string
): Promise<ProtestEvent[]> {
  const region = REGIONS.find(r => r.subdomain === 'lille')!;
  return parseDemosphereRegion(region, days, xmlContent);
}

/**
 * Parse events from Demosphere Nice
 */
export async function parseDemosphereNice(
  days: number = 90,
  xmlContent?: string
): Promise<ProtestEvent[]> {
  const region = REGIONS.find(r => r.subdomain === 'nice')!;
  return parseDemosphereRegion(region, days, xmlContent);
}

/**
 * Parse events from Demosphere Rennes
 */
export async function parseDemosphereRennes(
  days: number = 90,
  xmlContent?: string
): Promise<ProtestEvent[]> {
  const region = REGIONS.find(r => r.subdomain === 'rennes')!;
  return parseDemosphereRegion(region, days, xmlContent);
}

/**
 * Parse events from Demosphere Strasbourg
 */
export async function parseDemosphereStrasbourg(
  days: number = 90,
  xmlContent?: string
): Promise<ProtestEvent[]> {
  const region = REGIONS.find(r => r.subdomain === 'strasbourg')!;
  return parseDemosphereRegion(region, days, xmlContent);
}

/**
 * Parse events from Demosphere Gironde (Bordeaux)
 */
export async function parseDemosphereGironde(
  days: number = 90,
  xmlContent?: string
): Promise<ProtestEvent[]> {
  const region = REGIONS.find(r => r.subdomain === 'gironde')!;
  return parseDemosphereRegion(region, days, xmlContent);
}

/**
 * Parse events from Demosphere Nantes
 */
export async function parseDemosphereNantes(
  days: number = 90,
  xmlContent?: string
): Promise<ProtestEvent[]> {
  const region = REGIONS.find(r => r.subdomain === 'nantes')!;
  return parseDemosphereRegion(region, days, xmlContent);
}

/**
 * Parse events from Demosphere Lyon
 */
export async function parseDemosphereLyon(
  days: number = 90,
  xmlContent?: string
): Promise<ProtestEvent[]> {
  const region = REGIONS.find(r => r.subdomain === 'lyon')!;
  return parseDemosphereRegion(region, days, xmlContent);
}

/**
 * Parse events from Demosphere Grenoble
 */
export async function parseDemosphereGrenoble(
  days: number = 90,
  xmlContent?: string
): Promise<ProtestEvent[]> {
  const region = REGIONS.find(r => r.subdomain === 'grenoble')!;
  return parseDemosphereRegion(region, days, xmlContent);
}

/**
 * Parse events from Demosphere Montpellier
 */
export async function parseDemosphereMontpellier(
  days: number = 90,
  xmlContent?: string
): Promise<ProtestEvent[]> {
  const region = REGIONS.find(r => r.subdomain === 'montpellier')!;
  return parseDemosphereRegion(region, days, xmlContent);
}

/**
 * Get list of all active Demosphere regions
 */
export function getDemosphereRegions(): DemosphereRegion[] {
  return REGIONS.filter(r => r.active);
}
