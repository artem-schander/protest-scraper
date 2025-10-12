#!/usr/bin/env node

/**
 * Scrape upcoming protests / demonstrations in Germany (next N days)
 * Sources: Berlin, Dresden, Friedenskooperative, DemokraTEAM, Köln
 * Output: CSV + JSON + optional ICS
 *
 * Node 18+ recommended
 */

import fs from "fs";
import axios, { AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import dayjs, { Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { program } from "commander";
import { createEvents } from "ics";

// Initialize dayjs plugins
dayjs.extend(customParseFormat);
dayjs.extend(timezone);
dayjs.extend(utc);

// Type definitions
export interface ProtestEvent {
  source: string;
  city: string | null;
  title: string;
  start: string | null;
  end: string | null;
  location: string | null;
  url: string;
  attendees: number | null; // Expected/announced number of attendees
}

interface ScraperOptions {
  days: string;
  out: string;
  json: string;
  ics: string;
}

interface ScrapeResult {
  count: number;
  range: number;
}

interface GeoCoordinates {
  lat: number;
  lon: number;
}

interface GeocodeCache {
  [city: string]: GeoCoordinates;
}

// Constants
const HEADERS = {
  "User-Agent": "protest-scraper/1.0 (https://github.com/artem-schander/protest-scraper)",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
};

const DE_TZ = "Europe/Berlin";
const now: Dayjs = dayjs().tz(DE_TZ);
const GEOCODE_CACHE_FILE = "geocode-cache.json";

// Utility functions
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function parseGermanDate(str: string): Dayjs | null {
  if (!str) return null;

  let cleaned = str
    .replace(/[Uu]hr/g, "")
    .replace(/\s*-\s*\d{1,2}[:.]\d{2}.*$/, "") // Remove end time like "- 19.00"
    .replace(",", "")
    .replace(/\bOkt\b/i, "10")
    .replace(/\bOktober\b/i, "10")
    .trim();

  // Convert time dots to colons but preserve date dots
  // For formats like "15.03 14.30" or "15.03.2025 14.30"
  // Match the LAST occurrence of two digits with a dot before end/space
  cleaned = cleaned.replace(/(\s)(\d{1,2})\.(\d{2})(\s|$)/, "$1$2:$3$4");

  // Try various formats
  const d = dayjs(cleaned, [
    "DD.MM.YYYY HH:mm",
    "DD.MM.YYYY",
    "DD.MM HH:mm",
    "YYYY-MM-DD HH:mm",
    "YYYY-MM-DD"
  ], true);

  return d.isValid() ? d : null;
}

export function parseAttendees(text: string): number | null {
  if (!text) return null;

  // Match patterns like:
  // "500 Teilnehmer", "ca. 1000 Personen", "etwa 2000 Menschen"
  // "1.000 Teilnehmer*innen", "5000-10000 Teilnehmer"
  const patterns = [
    /(?:ca\.?\s*|etwa\s*|bis\s*(?:zu\s*)?)?(\d{1,3}(?:[.\s]\d{3})*|\d+)(?:\s*[-–]\s*(\d{1,3}(?:[.\s]\d{3})*|\d+))?\s*(?:Teilnehmer|Personen|Menschen|Leute)/gi,
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const num1 = match[1]?.replace(/[.\s]/g, "");
      const num2 = match[2]?.replace(/[.\s]/g, "");

      if (num1) {
        // If there's a range, use the higher number
        if (num2) {
          return Math.max(parseInt(num1, 10), parseInt(num2, 10));
        }
        return parseInt(num1, 10);
      }
    }
  }

  return null;
}

async function fetchHTML(url: string): Promise<string | null> {
  try {
    const response: AxiosResponse<string> = await axios.get(url, {
      headers: HEADERS,
      timeout: 30000,
    });
    await delay(1000);
    return response.data;
  } catch (e) {
    const error = e as Error;
    console.error("[error]", url, error.message);
    return null;
  }
}

// Geocoding utilities
function loadGeocodeCache(): GeocodeCache {
  try {
    if (fs.existsSync(GEOCODE_CACHE_FILE)) {
      const data = fs.readFileSync(GEOCODE_CACHE_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("[geocode cache] Failed to load cache:", (e as Error).message);
  }
  return {};
}

function saveGeocodeCache(cache: GeocodeCache): void {
  try {
    fs.writeFileSync(GEOCODE_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch (e) {
    console.error("[geocode cache] Failed to save cache:", (e as Error).message);
  }
}

async function geocodeCity(city: string, cache: GeocodeCache): Promise<GeoCoordinates | null> {
  // Check cache first
  const normalizedCity = city.trim();
  if (cache[normalizedCity]) {
    return cache[normalizedCity];
  }

  try {
    // Use Nominatim (OpenStreetMap) - free, no API key required
    // Rate limit: 1 request per second (enforced by caller)
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedCity)},Germany&format=json&limit=1`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "protest-scraper/1.0 (https://github.com/artem-schander/protest-scraper)",
      },
      timeout: 10000,
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      const coords: GeoCoordinates = {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
      };

      // Cache the result
      cache[normalizedCity] = coords;
      saveGeocodeCache(cache);

      return coords;
    }
  } catch (e) {
    console.error(`[geocode] Failed to geocode "${city}":`, (e as Error).message);
  }

  return null;
}

async function geocodeEvents(events: ProtestEvent[]): Promise<Map<string, GeoCoordinates>> {
  const cache = loadGeocodeCache();
  const coordsMap = new Map<string, GeoCoordinates>();

  // Get unique cities
  const uniqueCities = new Set<string>();
  for (const event of events) {
    if (event.city) {
      uniqueCities.add(event.city.trim());
    }
  }

  console.error(`[geocode] Found ${uniqueCities.size} unique cities to geocode`);

  let geocoded = 0;
  let fromCache = 0;

  for (const city of uniqueCities) {
    // Check if already in cache
    if (cache[city]) {
      coordsMap.set(city, cache[city]);
      fromCache++;
      continue;
    }

    // Geocode with 1 second delay (Nominatim rate limit)
    const coords = await geocodeCity(city, cache);
    if (coords) {
      coordsMap.set(city, coords);
      geocoded++;
    }

    // Respect rate limit: 1 request per second
    await delay(1100);
  }

  console.error(`[geocode] Cached: ${fromCache}, New: ${geocoded}, Failed: ${uniqueCities.size - fromCache - geocoded}`);

  return coordsMap;
}

// Source parsers
export async function parseBerlin(): Promise<ProtestEvent[]> {
  const url =
    "https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/";
  const html = await fetchHTML(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const events: ProtestEvent[] = [];

  // Parse the table with columns: Datum, Von, Bis, Thema, PLZ, Versammlungsort, Aufzugsstrecke
  $("table#searchresults-table tbody tr").each((_, tr) => {
    const tds = $(tr)
      .find("td")
      .map((_, td) => $(td).text().trim())
      .get();

    if (tds.length < 4) return;

    const [datumTxt, vonTxt, bisTxt, thema, plz, ort] = tds;

    // Parse date and times
    const startDate = parseGermanDate(`${datumTxt} ${vonTxt}`);
    const endDate = parseGermanDate(`${datumTxt} ${bisTxt}`);
    if (!startDate && !endDate) return;

    // Build location string from postal code and place
    const location = [`${plz} Berlin`.trim(), ort].filter(Boolean).join(", ") || null;

    // Try to extract attendee count from theme/title
    const attendees = parseAttendees(thema || "");

    events.push({
      source: "Berlin Police",
      city: "Berlin",
      title: thema || "Versammlung",
      start: startDate?.toISOString() ?? null,
      end: endDate?.toISOString() ?? null,
      location,
      url,
      attendees,
    });
  });

  return events;
}

export async function parseDresden(): Promise<ProtestEvent[]> {
  const url = "https://www.dresden.de/data_ext/versammlungsuebersicht/Versammlungen.json";

  try {
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: 30000,
    });
    await delay(1000);

    const data = response.data;
    const events: ProtestEvent[] = [];

    if (!data.Versammlungen || !Array.isArray(data.Versammlungen)) {
      return events;
    }

    for (const v of data.Versammlungen) {
      const dateTxt = v.Datum || "";
      const timeTxt = v.Zeit || "";
      const startDateString = timeTxt ? `${dateTxt} ${timeTxt.slice(0, 5)}` : dateTxt;
      const endDateString = timeTxt ? `${dateTxt} ${timeTxt.slice(8, 13)}` : dateTxt;

      const startDate = parseGermanDate(startDateString);
      const endDate = parseGermanDate(endDateString);
      if (!startDate && !endDate) continue;

      let attendees: number|null = parseInt(v.Teilnehmer);
      if (!attendees) attendees = parseAttendees(v.Thema || "");
      
      let location = "Dresden";
      if (v.Ort || v.Startpunkt || null) {
        location += ", " + (v.Ort || v.Startpunkt || null);
      }

      events.push({
        source: "Dresden City",
        city: "Dresden",
        title: v.Thema || "Versammlung",
        start: startDate?.toISOString() ?? null,
        end: endDate?.toISOString() ?? null,
        location,
        url: "https://www.dresden.de/de/rathaus/dienstleistungen/versammlungsuebersicht.php",
        attendees,
      });
    }

    return events;
  } catch (e) {
    const error = e as Error;
    console.error("[parseDresden error]", error.message);
    return [];
  }
}

export async function parseFriedenskooperative(): Promise<ProtestEvent[]> {
  const base = "https://www.friedenskooperative.de";
  const url = `${base}/aktion`;
  const html = await fetchHTML(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const events: ProtestEvent[] = [];

  // Look for event boxes
  $(".box").each((_, box) => {
    const $box = $(box);

    // Find title link
    const a = $box.find("h2.node-title a").first();
    const title = a.text().trim() || "Friedensaktion";
    const link = a.attr("href") ?
      (a.attr("href")!.startsWith("http") ? a.attr("href")! : base + a.attr("href")!) :
      url;

    // Get text content
    const text = $box.find("p.text").text().trim() || $box.text().trim();
    const fullText = title + " " + text;

    // Find date pattern in title or text (e.g., "Demo am 11.10.")
    const dateMatch = fullText.match(/(\d{1,2})\.(\d{1,2})\.(?:(\d{4}))?/);
    if (!dateMatch) return;

    let dateStr = dateMatch[0];
    // Add current year if not present
    if (!/\d{4}/.test(dateStr)) {
      dateStr = `${dateMatch[1]}.${dateMatch[2]}.${now.year()}`;
    }

    // Try to find city/location
    const cityMatch = fullText.match(/\b(?:in|bei|aus)\s+([A-ZÄÖÜ][a-zäöüß\-]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+)?)\b/);
    const city = cityMatch ? cityMatch[1].trim() : null;

    const d = parseGermanDate(dateStr);
    if (!d) return;

    const attendees = parseAttendees(fullText);

    events.push({
      source: "Friedenskooperative",
      city: city,
      title: title,
      start: d.toISOString(),
      end: null,
      location: city,
      url: link,
      attendees,
    });
  });

  return events;
}

export async function parseDemokrateam(): Promise<ProtestEvent[]> {
  const endpoint = "https://www.demokrateam.org/wp-admin/admin-ajax.php";
  const events: ProtestEvent[] = [];

  try {
    // Fetch demos/protests for next 3 months
    const today = dayjs().tz(DE_TZ);

    for (let i = 0; i < 3; i++) {
      const targetDate = today.add(i, "month");
      const year = targetDate.year();
      const month = targetDate.month() + 1; // 1-indexed for API

      // Build form data with label filter (4324 = Demo/Protest)
      const formData = new URLSearchParams({
        action: "mec_daily_view_load_month",
        mec_year: year.toString(),
        mec_month: month.toString(),
        mec_day: targetDate.date().toString(),
        "sf[label]": "4324",
        "apply_sf_date": "1",
      });

      const response = await axios.post(endpoint, formData.toString(), {
        headers: {
          ...HEADERS,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        timeout: 30000,
      });

      await delay(1500);

      // Response is JSON with HTML inside
      const jsonResponse = response.data;
      if (!jsonResponse || typeof jsonResponse !== "object" || !jsonResponse.month) continue;

      // Extract HTML from JSON response
      const html = jsonResponse.month;
      if (!html || typeof html !== "string") continue;

      const $ = cheerio.load(html);

      // Extract events from daily view HTML
      $(".mec-event-article").each((_, article) => {
        const $article = $(article);

        // Skip "no event" articles
        if ($article.find(".mec-no-event").length > 0) return;

        // Extract title
        const title = $article.find("h4.mec-event-title a").text().trim() || "Demo";

        // Extract link
        const link = $article.find("h4.mec-event-title a").attr("href") || "https://www.demokrateam.org/aktionen/";

        // Extract time from the rendered HTML
        const timeText = $article.find(".mec-event-time").text().trim().replace(/\s+/g, " ");

        // Parse time (format: "17:00" or similar)
        let eventDate: Dayjs | null = null;

        // Get the parent <li> to extract the date from its ID
        const parentLi = $article.closest("li");
        const liId = parentLi.attr("id"); // Format: mec_daily_view_date_events239_20251011

        if (liId) {
          const dateMatch = liId.match(/_(\d{4})(\d{2})(\d{2})$/);
          if (dateMatch) {
            const [, y, m, d] = dateMatch;
            const dateStr = `${y}-${m}-${d}`;

            if (timeText) {
              // Extract time like "17:00"
              const timeMatch = timeText.match(/(\d{1,2}):(\d{2})/);
              if (timeMatch) {
                eventDate = dayjs.tz(`${dateStr} ${timeMatch[0]}`, DE_TZ);
              } else {
                eventDate = dayjs.tz(dateStr, DE_TZ);
              }
            } else {
              eventDate = dayjs.tz(dateStr, DE_TZ);
            }
          }
        }

        // Fallback: use month/year from request
        if (!eventDate) {
          eventDate = dayjs.tz(`${year}-${month.toString().padStart(2, "0")}-15`, DE_TZ);
        }

        // Extract location from mec-event-loc-place
        const location = $article.find(".mec-event-loc-place").text().trim() || null;

        // Extract city from location string (first word is usually the city)
        let city: string | null = null;
        if (location) {
          const cityMatch = location.match(/^([^,]+)/);
          if (cityMatch) {
            city = cityMatch[1].trim();
          }
        }

        // Try to extract attendee count from title
        const attendees = parseAttendees(title);

        events.push({
          source: "DemokraTEAM",
          city,
          title,
          start: eventDate.toISOString(),
          end: null,
          location,
          url: link,
          attendees,
        });
      });
    }

    return events;
  } catch (e) {
    const error = e as Error;
    console.error("[parseDemokrateam error]", error.message);
    return [];
  }
}

// Data processing utilities
export function withinNextDays(iso: string | null, days: number, baseDate?: Dayjs): boolean {
  if (!iso) return false;
  const d = dayjs(iso);
  const base = baseDate || now;
  return d.isAfter(base) && d.isBefore(base.add(days, "day"));
}

export function dedupe(events: ProtestEvent[]): ProtestEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const k = `${e.title?.toLowerCase()}|${e.start}|${e.city}|${e.source}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Export functions
export function saveCSV(events: ProtestEvent[], file: string): void {
  if (events.length === 0) {
    console.error("[warning] No events to save to CSV");
    return;
  }

  const fields = Object.keys(events[0]) as Array<keyof ProtestEvent>;
  const lines = [fields.join(",")];

  for (const e of events) {
    lines.push(
      fields.map((f) => `"${(e[f] || "").toString().replace(/"/g, '""')}"`).join(",")
    );
  }

  fs.writeFileSync(file, lines.join("\n"), "utf8");
}

export function saveJSON(events: ProtestEvent[], file: string): void {
  fs.writeFileSync(file, JSON.stringify(events, null, 2), "utf8");
}

async function saveICS(events: ProtestEvent[], file: string): Promise<void> {
  // Geocode cities first
  const coordsMap = await geocodeEvents(events);

  const icsEvents = events
    .filter((e) => e.start)
    .map((e) => {
      const startDate = dayjs(e.start!);
      const startArray: [number, number, number, number, number] = [
        startDate.year(),
        startDate.month() + 1, // ICS months are 1-indexed
        startDate.date(),
        startDate.hour(),
        startDate.minute(),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event: any = {
        start: startArray,
        title: e.title,
        location: e.location || e.city || "",
        description: `${e.source}${e.attendees ? `\nExpected attendees: ${e.attendees}` : ""}`,
        productId: "protest-scraper",
      };

      // Add URL as separate field for better UX
      if (e.url) {
        event.url = e.url;
      }

      // Add categories for filtering/organization in calendar apps
      // Categories: City, Country, Source
      const categories: string[] = [];
      categories.push("Germany"); // All events are in Germany
      if (e.city) categories.push(e.city);
      if (e.source) categories.push(e.source);

      if (categories.length > 0) {
        event.categories = categories;
      }

      // Add geographic coordinates if available
      if (e.city && coordsMap.has(e.city.trim())) {
        const coords = coordsMap.get(e.city.trim())!;
        event.geo = { lat: coords.lat, lon: coords.lon };
      }

      if (e.end) {
        const endDate = dayjs(e.end);
        event.end = [
          endDate.year(),
          endDate.month() + 1,
          endDate.date(),
          endDate.hour(),
          endDate.minute(),
        ];
      }

      return event;
    });

  const { error, value } = createEvents(icsEvents);
  if (error) {
    console.error("[ics error]", error);
    return;
  }

  fs.writeFileSync(file, value!, "utf8");
}

// Main execution
program
  .option("--days <n>", "range forward in days", "40")
  .option("--out <csv>", "CSV file", "protests.csv")
  .option("--json <json>", "JSON file", "protests.json")
  .option("--ics <ics>", "ICS file", "protests.ics")
  .parse(process.argv);

const opt = program.opts<ScraperOptions>();
const DAYS = parseInt(opt.days);

const sources = [
  parseBerlin,
  parseDresden,
  // parseKoeln, // Disabled: Wrong URL - needs official police source
  parseFriedenskooperative,
  parseDemokrateam,
];

(async (): Promise<void> => {
  console.error("[scrape] Fetching sources …");
  const all: ProtestEvent[] = [];

  for (const fn of sources) {
    try {
      const ev = await fn();
      console.error(`[${fn.name}] ${ev.length}`);
      all.push(...ev);
    } catch (e) {
      const error = e as Error;
      console.error(`[${fn.name}] failed:`, error.message);
    }
  }

  const events = dedupe(all).filter((e) => withinNextDays(e.start, DAYS));
  events.sort((a, b) => (a.start || "").localeCompare(b.start || ""));

  saveCSV(events, opt.out);
  saveJSON(events, opt.json);
  await saveICS(events, opt.ics);

  const result: ScrapeResult = { count: events.length, range: DAYS };
  console.log(JSON.stringify(result, null, 2));
})();
