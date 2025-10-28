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
import { connectToDatabase, closeConnection } from '@/db/connection.js';
import { Protest, GeoLocation } from '@/types/protest.js';
import type { GeoCoordinates } from '@/utils/geocode.js';
import {
  dedupe,
  withinNextDays,
  ProtestEvent,
} from '@/scraper/scrape-protests.js';
import { getEnabledSources } from '@/scraper/sources/registry.js';

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
  const sources = getEnabledSources();

  const all: ProtestEvent[] = [];

  for (const source of sources) {
    try {
      const events = await source.parser(days);
      console.error(`[${source.name}] ${events.length} events found`);
      all.push(...events);
    } catch (e) {
      const error = e as Error;
      console.error(`[${source.name}] failed:`, error.message);
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
    if (!geoData || !geoData.address) continue;

    // Preserve original location in originalLocation
    if (event.location) {
      event.originalLocation = event.location;
    }

    // Replace location with normalized address
    event.location = geoData.address;
  }

  // Import to database
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let deleted = 0;

  for (const event of filtered) {
    try {
      // Check if event already exists (by URL and start date)
      const existing = await protests.findOne({
        url: event.url,
        start: event.start ? new Date(event.start) : null,
      });

      // Skip if fully manual (complete disconnect from scraper)
      if (existing?.fullyManual) {
        skipped++;
        continue;
      }

      // Handle events marked for deletion (e.g., rejected/cancelled in source)
      // Respect deletion even on manually edited events (but not if fullyManual)
      if (event.shouldDelete) {
        if (existing && !existing.deleted) {
          // Mark existing event as deleted
          await protests.updateOne(
            { _id: existing._id },
            {
              $set: {
                deleted: true,
                updatedAt: new Date(),
              },
            }
          );
          deleted++;
        }
        // Skip importing/updating events marked for deletion
        skipped++;
        continue;
      }

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
        startTimeKnown: event.startTimeKnown,
        end: event.end ? new Date(event.end) : null,
        endTimeKnown: event.endTimeKnown,
        language: event.language,
        location: event.location,
        originalLocation: event.originalLocation,
        geoLocation,
        url: event.url,
        attendees: event.attendees,
        categories: event.categories, // Event categories (e.g., Demonstration, Vigil)
        verified: event.verified ?? true, // Scraper events are from official sources, default to verified
        createdAt: existing?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      if (existing) {
        // Skip if soft-deleted (but not if manually edited - we'll do selective updates)
        if (existing.deleted) {
          skipped++;
          continue;
        }

        // Build selective update object
        const updateFields: Partial<Protest> = {
          // Always update these fields (source authority)
          verified: event.verified ?? true, // Scraper events are from official sources, default to verified
          updatedAt: new Date(),
        };

        // Get list of fields that were manually edited
        const editedFields = existing.editedFields || [];

        // Conditionally update content fields only if not manually edited
        if (!editedFields.includes('title')) {
          updateFields.title = event.title;
        }
        if (!editedFields.includes('location')) {
          updateFields.location = event.location;
          updateFields.originalLocation = event.originalLocation;
          updateFields.geoLocation = geoLocation; // Location implies coordinates
        }
        if (!editedFields.includes('start')) {
          updateFields.start = event.start ? new Date(event.start) : null;
          updateFields.startTimeKnown = event.startTimeKnown;
        }
        if (!editedFields.includes('end')) {
          updateFields.end = event.end ? new Date(event.end) : null;
          updateFields.endTimeKnown = event.endTimeKnown;
        }
        if (!editedFields.includes('attendees')) {
          updateFields.attendees = event.attendees;
        }
        if (!editedFields.includes('categories')) {
          updateFields.categories = event.categories;
        }
        // City and country are tied to location, so respect location edit
        if (!editedFields.includes('location')) {
          updateFields.city = event.city;
          updateFields.country = event.country;
        }
        // Language is part of source data
        if (!editedFields.includes('language')) {
          updateFields.language = event.language;
        }

        // Always preserve these fields (never overwritten by scraper)
        updateFields.createdAt = existing.createdAt;
        // Don't preserve createdBy - scraper events should not have this field
        // (this ensures they show up in public view even if unverified)
        updateFields.editedBy = existing.editedBy;
        updateFields.editedFields = existing.editedFields;
        updateFields.manuallyEdited = existing.manuallyEdited;
        updateFields.fullyManual = existing.fullyManual;

        // Update existing with selective fields
        const updateOperation: any = { $set: updateFields };

        // Remove createdBy field from scraper-imported events
        // (ensures they show in public view even if unverified)
        if (existing.createdBy) {
          updateOperation.$unset = { createdBy: '' };
        }

        await protests.updateOne(
          { _id: existing._id },
          updateOperation
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
  console.error(`  - Deleted: ${deleted}`);
  console.error(`  - Skipped: ${skipped}`);

  await closeConnection();

  // Output JSON result for automation
  console.log(
    JSON.stringify(
      {
        imported,
        updated,
        deleted,
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
