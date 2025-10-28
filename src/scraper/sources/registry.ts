/**
 * Source Registry - Central configuration for all scraper sources
 *
 * This registry provides a single source of truth for all available scrapers,
 * making it easy to add new countries and sources without modifying multiple files.
 *
 * Usage:
 * ```typescript
 * import { SOURCES, getEnabledSources } from './sources/registry.js';
 *
 * const sources = getEnabledSources();
 * for (const source of sources) {
 *   console.log(`Scraping ${source.name} (${source.country})...`);
 *   const events = await source.parser();
 * }
 * ```
 */

import { ProtestEvent } from '@/scraper/scrape-protests.js';
import {
  parseBerlinPolice,
  parseDresdenCity,
  parseFriedenskooperative,
  parseDemokrateam,
} from '@/scraper/sources/germany/index.js';
import { parseAmnestySwiss } from '@/scraper/sources/switzerland/index.js';

/**
 * Source metadata and parser function
 */
export interface ScraperSource {
  /** Unique identifier for the source */
  id: string;

  /** Display name of the source */
  name: string;

  /** ISO 3166-1 alpha-2 country code */
  country: string;

  /** Optional city or region (null = nationwide) */
  city?: string | null;

  /** Parser function that returns protest events */
  parser: (days?: number) => Promise<ProtestEvent[]>;

  /** Whether this source is currently enabled */
  enabled: boolean;

  /** Optional description or notes */
  description?: string;
}

/**
 * Complete registry of all scraper sources
 *
 * Add new sources here - they will automatically be picked up by
 * scrape-protests.ts and import-to-db.ts
 */
export const SOURCES: ScraperSource[] = [
  // Germany
  {
    id: 'berlin-police',
    name: 'Berlin Police',
    country: 'DE',
    city: 'Berlin',
    parser: parseBerlinPolice,
    enabled: true,
    description: 'Official assembly registry from Berlin Police',
  },
  {
    id: 'dresden-city',
    name: 'Dresden City',
    country: 'DE',
    city: 'Dresden',
    parser: parseDresdenCity,
    enabled: true,
    description: 'Public assembly JSON API from Dresden City',
  },
  {
    id: 'friedenskooperative',
    name: 'Friedenskooperative',
    country: 'DE',
    city: null,
    parser: parseFriedenskooperative,
    enabled: true,
    description: 'Peace movement events across Germany (5 categories)',
  },
  {
    id: 'demokrateam',
    name: 'DemokraTEAM',
    country: 'DE',
    city: null,
    parser: parseDemokrateam,
    enabled: true,
    description: 'Democracy and protest events across Germany',
  },

  // Switzerland
  {
    id: 'amnesty-swiss',
    name: 'Amnesty International Switzerland',
    country: 'CH',
    city: null,
    parser: parseAmnestySwiss,
    enabled: true,
    description: 'Protest calendar from Amnesty International Switzerland',
  },

  // Future sources will be added here:
  // Austria example:
  // {
  //   id: 'vienna-police',
  //   name: 'Vienna Police',
  //   country: 'AT',
  //   city: 'Vienna',
  //   parser: parseViennaPolice,
  //   enabled: true,
  //   description: 'Official assembly registry from Vienna Police',
  // },
];

/**
 * Get all enabled sources
 *
 * @returns Array of enabled scraper sources
 */
export function getEnabledSources(): ScraperSource[] {
  return SOURCES.filter((source) => source.enabled);
}

/**
 * Get sources by country
 *
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., "DE", "AT")
 * @returns Array of sources for the specified country
 */
export function getSourcesByCountry(countryCode: string): ScraperSource[] {
  return SOURCES.filter(
    (source) => source.enabled && source.country === countryCode
  );
}

/**
 * Get a specific source by ID
 *
 * @param id - Source ID
 * @returns Source metadata or undefined if not found
 */
export function getSourceById(id: string): ScraperSource | undefined {
  return SOURCES.find((source) => source.id === id);
}

/**
 * Get all unique countries with scrapers
 *
 * @returns Array of country codes with at least one enabled source
 */
export function getAvailableCountries(): string[] {
  const countries = new Set(
    SOURCES.filter((s) => s.enabled).map((s) => s.country)
  );
  return Array.from(countries).sort();
}
