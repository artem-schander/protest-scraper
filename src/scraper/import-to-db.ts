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
import type { GeoCoordinates } from '../utils/geocode.js';
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

  // Geocode locations using full details (street, postal code, city) and normalize
  const uniqueLocations = new Map<string, { city: string | null; country: string | null }>();
  for (const event of filtered) {
    // Use location if available (contains street, postal code, etc.)
    // Otherwise fallback to city name
    const locationKey = event.location || event.city;
    if (locationKey) {
      const key = locationKey.trim();
      // Store the first occurrence's city and country for fallback
      if (!uniqueLocations.has(key)) {
        uniqueLocations.set(key, { city: event.city, country: event.country });
      }
    }
  }

  console.error(`[geocode] Geocoding ${uniqueLocations.size} unique locations using full addresses...`);

  const coordsMap = new Map<string, GeoCoordinates>();
  const { geocodeLocation } = await import('../utils/geocode.js');

  // Build map by geocoding each unique location with fallback to city+country
  let geocoded = 0;
  for (const [location, metadata] of uniqueLocations) {
    const coords = await geocodeLocation(location, location, metadata.city, metadata.country);
    if (coords) {
      coordsMap.set(location, coords);
      geocoded++;
    }
  }

  console.error(`[geocode] Successfully geocoded ${geocoded}/${uniqueLocations.size} locations`);

  // Normalize event locations using geocoded data
  for (const event of filtered) {
    // Use location (detailed address) or city as lookup key
    const locationKey = (event.location || event.city)?.trim();
    if (!locationKey) continue;

    const geoData = coordsMap.get(locationKey);
    if (!geoData || !geoData.display_name) continue;

    // Preserve original location in originalLocation
    if (event.location) {
      event.originalLocation = event.location;
    }

    // Replace location with formatted address (user-friendly)
    // Fallback to display_name if formatting fails
    event.location = geoData.formatted || geoData.display_name;
  }

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

      // Get coordinates for the location
      let geoLocation: GeoLocation | undefined;
      const locationKey = (event.originalLocation || event.location || event.city)?.trim();
      if (locationKey && coordsMap.has(locationKey)) {
        const coords = coordsMap.get(locationKey)!;
        geoLocation = {
          type: 'Point',
          coordinates: [coords.lon, coords.lat], // [longitude, latitude] for GeoJSON
        };
      }

      const protestData: Omit<Protest, '_id'> = {
        source: event.source,
        city: event.city,
        country: event.country,
        title: event.title,
        start: event.start ? new Date(event.start) : null,
        end: event.end ? new Date(event.end) : null,
        language: event.language,
        location: event.location,
        originalLocation: event.originalLocation,
        geoLocation,
        url: event.url,
        attendees: event.attendees,
        categories: event.categories, // Event categories (e.g., Demonstration, Vigil)
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
