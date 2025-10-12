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
  locationDetails?: string | null; // Original location from source (before normalization)
  url: string;
  attendees: number | null; // Expected/announced number of attendees
  categories?: string[]; // Event categories (e.g., "Demonstration", "Vigil", "Blockade")
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
  display_name?: string; // Normalized address from Nominatim
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
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(",", "")
    // Replace German month names with numbers
    .replace(/\bJan(?:uar)?\b/gi, "01")
    .replace(/\bFeb(?:ruar)?\b/gi, "02")
    .replace(/\bMär(?:z)?\b/gi, "03")
    .replace(/\bApr(?:il)?\b/gi, "04")
    .replace(/\bMai\b/gi, "05")
    .replace(/\bJun(?:i)?\b/gi, "06")
    .replace(/\bJul(?:i)?\b/gi, "07")
    .replace(/\bAug(?:ust)?\b/gi, "08")
    .replace(/\bSep(?:t(?:ember)?)?\b/gi, "09")
    .replace(/\bOkt(?:ober)?\b/gi, "10")
    .replace(/\bNov(?:ember)?\b/gi, "11")
    .replace(/\bDez(?:ember)?\b/gi, "12")
    .trim();

  // Convert time dots to colons but preserve date dots
  // For formats like "15.03 14.30" or "15.03.2025 14.30"
  // Match the LAST occurrence of two digits with a dot before end/space
  cleaned = cleaned.replace(/(\s)(\d{1,2})\.(\d{2})(\s|$)/, "$1$2:$3$4");

  // Try various formats
  let d = dayjs(cleaned, [
    "DD.MM.YYYY HH:mm",
    "DD.MM.YYYY",
    "DD. MM HH:mm YYYY",    // For "18. 10 18:00 2025" (after month replacement)
    "DD. MM YYYY",          // For "18. 10 2025" (after month replacement)
    "DD. MM HH:mm",         // For "18. 10 18:00" (after month replacement, no year)
    "DD. MM",               // For "18. 10" (after month replacement, no year)
    "DD.MM HH:mm",
    "YYYY-MM-DD HH:mm",
    "YYYY-MM-DD"
  ], true);

  // If no year provided and date is valid, assume current or next year
  if (d.isValid() && !cleaned.includes("20") && !cleaned.includes("19")) {
    const currentYear = now.year();
    // If date is in the past, assume next year
    if (d.year(currentYear).isBefore(now)) {
      d = d.year(currentYear + 1);
    } else {
      d = d.year(currentYear);
    }
  }

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
        display_name: result.display_name || undefined,
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

// Normalize event locations using geocoded data
function normalizeEventLocations(events: ProtestEvent[], coordsMap: Map<string, GeoCoordinates>): void {
  for (const event of events) {
    if (!event.city) continue;

    const geoData = coordsMap.get(event.city.trim());
    if (!geoData || !geoData.display_name) continue;

    // Preserve original location in locationDetails
    if (event.location) {
      event.locationDetails = event.location;
    }

    // Replace location with normalized address from Nominatim
    event.location = geoData.display_name;
  }
}

// Source parsers
export async function parseBerlin(): Promise<ProtestEvent[]> {
  const url = "https://www.berlin.de/polizei/service/versammlungsbehoerde/versammlungen-aufzuege/";
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
  const endpoint = `${base}/views/ajax`;
  const events: ProtestEvent[] = [];

  // Category mappings: ID -> English name
  const categories: Record<string, string> = {
    "34": "Demonstration",
    "35": "Vigil",
    "53": "Government Event",
    "54": "Counter-Demonstration",
    "55": "Blockade",
  };

  try {
    // Loop through all categories
    for (const [categoryId, categoryName] of Object.entries(categories)) {
      let page = 0;
      let hasMore = true;

      console.error(`[Friedenskooperative] Scraping category ${categoryId}: ${categoryName}`);

      while (hasMore) {
        // Build form data (most params are boilerplate from the site)
        const formData = new URLSearchParams({
          page: page.toString(),
          view_name: "termine",
          view_display_id: "page",
          view_args: "",
          view_path: "node/33",
          view_base_path: "termine",
          view_dom_id: "c591d6225e0201870f07992dce6c489c",
          pager_element: "0",
          field_date_event_rrule: "1",
          bundesland: "All",
          veranstaltungsart: categoryId, // Category filter
          thema: "All",
        });

        try {
          const response = await axios.post(endpoint, formData.toString(), {
            headers: {
              ...HEADERS,
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
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
            if (cmd.command === "insert" && cmd.data) {
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
          const viewContent = $(".view-content").last();
          let currentMonthYear = "";

          viewContent.children().each((_, elem) => {
            const $elem = $(elem);

            // Check if this is a month/year heading (h3)
            if ($elem.is("h3")) {
              currentMonthYear = $elem.text().trim(); // e.g., "Oktober 2025"
              return;
            }

            // Check if this is a box with events
            if ($elem.is(".box")) {
              // Each box can contain multiple events
              $elem.find(".row.row-eq-height").each((_, row) => {
                const $row = $(row);

                // Extract title and link
                const titleLink = $row.find("h2.node-title a").first();
                const title = titleLink.text().trim() || "Friedensaktion";
                const relativeUrl = titleLink.attr("href") || "";
                const url = relativeUrl.startsWith("http") ? relativeUrl : base + relativeUrl;

                // Extract date from .date-column .date
                const dateElem = $row.find(".date-column .date").first();
                let dateStr = dateElem.find(".date-display-single").first().text().trim();

                // Check for date range format: <div class="date-display-range">
                const dateRange = dateElem.find(".date-display-range");
                let endTimeStr: string | null = null;
                if (dateRange.length > 0) {
                  const startTime = dateRange.find(".date-display-start").text().trim();
                  const endTime = dateRange.find(".date-display-end").text().trim();

                  // dateStr is like "02. Apr", startTime is "13:00", endTime is "17:00"
                  if (startTime) {
                    dateStr = `${dateStr} ${startTime}`;
                  }
                  if (endTime) {
                    endTimeStr = `${dateStr.split(" ")[0]} ${endTime}`; // Same date, different time
                  }
                }

                // Combine with month/year from heading
                // dateStr is like "18. Okt 18:00", currentMonthYear is "Oktober 2025"
                // Extract year from currentMonthYear
                const yearMatch = currentMonthYear.match(/(\d{4})/);
                const year = yearMatch ? yearMatch[1] : now.year().toString();
                const fullDateStr = `${dateStr} ${year}`;

                const d = parseGermanDate(fullDateStr);
                if (!d) return;

                // Parse end date if exists
                let endDate: Dayjs | null = null;
                if (endTimeStr) {
                  const fullEndDateStr = `${endTimeStr} ${year}`;
                  endDate = parseGermanDate(fullEndDateStr);
                }

                // Extract city from .date-column .city
                let city: string | null = $row.find(".date-column .city").text().trim() || null;

                // Extract location from .place.line.info
                let location: string | null = null;
                const placeInfo = $row.find(".place.line.info span").text().trim();
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
                const attendees = parseAttendees(fullText);

                events.push({
                  source: "Friedenskooperative",
                  city,
                  title,
                  start: d.toISOString(),
                  end: endDate ? endDate.toISOString() : null,
                  location: location || city,
                  url,
                  attendees,
                  categories: [categoryName],
                });
              });
            }
          });

          const eventCount = $(".view-content").last().find(".row.row-eq-height").length;
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
    console.error("[parseFriedenskooperative error]", error.message);
    return [];
  }
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

async function saveICS(events: ProtestEvent[], coordsMap: Map<string, GeoCoordinates>, file: string): Promise<void> {

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
      // Categories: Event Type, City, Country, Source
      const categories: string[] = [];
      categories.push("Germany"); // All events are in Germany
      if (e.city) categories.push(e.city);
      if (e.source) categories.push(e.source);

      // Add event-specific categories (e.g., Demonstration, Vigil, Blockade)
      if (e.categories && e.categories.length > 0) {
        categories.push(...e.categories);
      }

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

  // Geocode cities and normalize locations
  const coordsMap = await geocodeEvents(events);
  normalizeEventLocations(events, coordsMap);

  saveCSV(events, opt.out);
  saveJSON(events, opt.json);
  await saveICS(events, coordsMap, opt.ics);

  const result: ScrapeResult = { count: events.length, range: DAYS };
  console.log(JSON.stringify(result, null, 2));
})();
