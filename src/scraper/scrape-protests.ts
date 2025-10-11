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

// Constants
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/127.0 Safari/537.36",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
};

const DE_TZ = "Europe/Berlin";
const now: Dayjs = dayjs().tz(DE_TZ);

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

    // Build location string from postal code and place
    const location = [plz, ort].filter(Boolean).join(" ") || null;

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

async function parseDresden(): Promise<ProtestEvent[]> {
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
      const dateTimeStr = timeTxt ? `${dateTxt} ${timeTxt}` : dateTxt;

      const d = parseGermanDate(dateTimeStr);
      if (!d) continue;

      const attendees = parseAttendees(v.Thema || "");

      events.push({
        source: "Dresden City",
        city: "Dresden",
        title: v.Thema || "Versammlung",
        start: d.toISOString(),
        end: null,
        location: v.Ort || v.Startpunkt || null,
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

// Disabled: Wrong URL - needs official police source
/*
async function parseKoeln(): Promise<ProtestEvent[]> {
  const url = "https://www.stadt-koeln.de/artikel/70762/index.html";
  const html = await fetchHTML(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const events: ProtestEvent[] = [];

  $("table tr").each((_, tr) => {
    const tds = $(tr)
      .find("td")
      .map((_, td) => $(td).text().trim())
      .get();

    if (tds.length < 2) return;

    const dateTxt = tds[0];
    const title = tds[1] || "Versammlung";
    const loc = tds[2] || "Köln";
    const d = parseGermanDate(dateTxt);

    if (!d) return;

    events.push({
      source: "Stadt Köln",
      city: "Köln",
      title,
      start: d.toISOString(),
      end: null,
      location: loc,
      url,
    });
  });

  return events;
}
*/

async function parseFriedenskooperative(): Promise<ProtestEvent[]> {
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

async function parseDemokrateam(): Promise<ProtestEvent[]> {
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

function saveICS(events: ProtestEvent[], file: string): void {
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
        description: `${e.source}\n${e.url || ""}`,
        productId: "protest-scraper",
      };

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
  saveICS(events, opt.ics);

  const result: ScrapeResult = { count: events.length, range: DAYS };
  console.log(JSON.stringify(result, null, 2));
})();
