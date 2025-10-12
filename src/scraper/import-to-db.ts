#!/usr/bin/env node

/**
 * Import scraped protests directly to MongoDB
 * This file imports the scrapers and writes to the database instead of files
 */

import 'dotenv/config';
import dayjs, { Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { program } from 'commander';
import { connectToDatabase, closeConnection } from '../db/connection.js';
import { Protest, GeoLocation } from '../types/protest.js';
import { geocodeCities } from '../utils/geocode.js';
import {
  parseBerlin,
  parseDresden,
  parseFriedenskooperative,
  parseDemokrateam,
  dedupe,
  withinNextDays,
  ProtestEvent,
} from './scrape-protests.js';

// Initialize dayjs plugins
dayjs.extend(customParseFormat);
dayjs.extend(timezone);
dayjs.extend(utc);

interface ScraperOptions {
  days: string;
}

const DE_TZ = 'Europe/Berlin';
const now: Dayjs = dayjs().tz(DE_TZ);

async function importProtests(days: number): Promise<void> {
  console.error('[scrape] Connecting to database...');
  const db = await connectToDatabase();
  const protests = db.collection<Protest>('protests');

  console.error('[scrape] Fetching sources...');
  const sources = [
    parseBerlin,
    parseDresden,
    parseFriedenskooperative,
    parseDemokrateam,
  ];

  const all: ProtestEvent[] = [];

  for (const fn of sources) {
    try {
      const events = await fn();
      console.error(`[${fn.name}] ${events.length} events found`);
      all.push(...events);
    } catch (e) {
      const error = e as Error;
      console.error(`[${fn.name}] failed:`, error.message);
    }
  }

  // Dedupe and filter by date range
  const filtered = dedupe(all).filter((e) => withinNextDays(e.start, days, now));
  filtered.sort((a, b) => (a.start || '').localeCompare(b.start || ''));

  console.error(`[scrape] Total events after dedup and filtering: ${filtered.length}`);

  // Geocode unique cities
  const uniqueCities = [...new Set(filtered.map((e) => e.city).filter(Boolean) as string[])];
  const coordsMap = await geocodeCities(uniqueCities);

  // Import to database
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const event of filtered) {
    try {
      // Check if event already exists (by URL and start date)
      const existing = await protests.findOne({
        url: event.url,
        start: event.start ? new Date(event.start) : null,
      });

      // Get coordinates for the city
      let geoLocation: GeoLocation | undefined;
      if (event.city && coordsMap.has(event.city)) {
        const coords = coordsMap.get(event.city)!;
        geoLocation = {
          type: 'Point',
          coordinates: [coords.lon, coords.lat], // [longitude, latitude] for GeoJSON
        };
      }

      const protestData: Omit<Protest, '_id'> = {
        source: event.source,
        city: event.city,
        title: event.title,
        start: event.start ? new Date(event.start) : null,
        end: event.end ? new Date(event.end) : null,
        location: event.location,
        geoLocation,
        url: event.url,
        attendees: event.attendees,
        verified: true, // Scraper imports are auto-verified
        createdAt: existing?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      if (existing) {
        // Skip if manually edited or soft-deleted to prevent overwriting manual changes
        if (existing.manuallyEdited || existing.deleted) {
          skipped++;
          continue;
        }

        // Update existing (only if not manually modified)
        await protests.updateOne(
          { _id: existing._id },
          {
            $set: {
              ...protestData,
              createdAt: existing.createdAt, // Preserve original creation date
            },
          }
        );
        updated++;
      } else {
        // Insert new
        await protests.insertOne(protestData as Protest);
        imported++;
      }
    } catch (e) {
      const error = e as Error;
      console.error(`[import] Failed to import event "${event.title}":`, error.message);
      skipped++;
    }
  }

  console.error(`[scrape] Import complete:`);
  console.error(`  - New: ${imported}`);
  console.error(`  - Updated: ${updated}`);
  console.error(`  - Skipped: ${skipped}`);

  await closeConnection();

  // Output JSON result for automation
  console.log(
    JSON.stringify(
      {
        imported,
        updated,
        skipped,
        total: filtered.length,
        range: days,
      },
      null,
      2
    )
  );
}

// CLI
program.option('--days <n>', 'range forward in days', '40').parse(process.argv);

const opt = program.opts<ScraperOptions>();
const DAYS = parseInt(opt.days, 10);

importProtests(DAYS).catch((error) => {
  console.error('[scrape] Fatal error:', error);
  process.exit(1);
});
