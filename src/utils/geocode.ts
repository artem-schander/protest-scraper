import axios from 'axios';
import fs from 'fs';
import path from 'path';
import delay from "./delay.js";

export interface GeoCoordinates {
  lat: number;
  lon: number;
  display_name?: string; // Original address from Nominatim
  formatted?: string; // Formatted user-friendly address
}

export interface GeocodeCache {
  [city: string]: GeoCoordinates;
}

const GEOCODE_CACHE_FILE = path.join(process.cwd(), 'cache/geocode.json');

function loadGeocodeCache(): GeocodeCache {
  try {
    if (fs.existsSync(GEOCODE_CACHE_FILE)) {
      const data = fs.readFileSync(GEOCODE_CACHE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('[geocode cache] Failed to load cache:', (e as Error).message);
  }
  return {};
}

function saveGeocodeCache(cache: GeocodeCache): void {
  try {
    fs.writeFileSync(GEOCODE_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.error('[geocode cache] Failed to save cache:', (e as Error).message);
  }
}

/**
 * Formats a Nominatim display_name into a more user-friendly format
 *
 * Example transformations:
 * "Am Treptower Park, Plänterwald, Treptow-Köpenick, Berlin, 12435, Deutschland"
 * -> "12435 Berlin, Treptow-Köpenick, Plänterwald, Am Treptower Park"
 *
 * "Berlin, Deutschland"
 * -> "Berlin"
 *
 * @param displayName - The display_name from Nominatim
 * @returns Formatted location string
 */
export function formatLocationDetails(displayName: string | undefined): string | null {
  if (!displayName) {
    return null;
  }

  // Split by comma and trim each part
  const parts = displayName.split(',').map(p => p.trim()).filter(p => p.length > 0);

  if (parts.length === 0) {
    return null;
  }

  // Reverse the array (country is now first)
  parts.reverse();

  // Remove the first element (country)
  if (parts.length > 1) {
    parts.shift();
  }

  // Postal code patterns for European countries
  // DE, FR: 5 digits (12435, 75001)
  // AT, CH: 4 digits (1010, 8001)
  // NL: 4 digits + space + 2 letters (1012 AB)
  // UK: Complex (SW1A 1AA, EC1A 1BB)
  // PL: 2 digits + dash + 3 digits (00-001)
  const postalCodePattern = /^(\d{4,5}|\d{4}\s?[A-Z]{2}|[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}|\d{2}-\d{3})$/;

  // Check if the first element (after removing country) is a postal code
  if (parts.length >= 2 && postalCodePattern.test(parts[0])) {
    // Combine postal code with city
    const postalCode = parts[0];
    const city = parts[1];
    parts[0] = `${postalCode} ${city}`;
    parts.splice(1, 1); // Remove the separate city element
  }

  // Join remaining parts with comma
  return parts.join(', ');
}

// Map ISO 3166-1 alpha-2 country codes to full country names for geocoding
const COUNTRY_NAMES: Record<string, string> = {
  'DE': 'Germany',
  'AT': 'Austria',
  'CH': 'Switzerland',
  'FR': 'France',
  'IT': 'Italy',
  'NL': 'Netherlands',
  'BE': 'Belgium',
  'PL': 'Poland',
  'CZ': 'Czech Republic',
  'DK': 'Denmark',
  // Add more as needed
};

export async function geocodeLocation(
  query: string,
  cacheKey?: string,
  fallbackCity?: string | null,
  fallbackCountryCode?: string | null
): Promise<GeoCoordinates | null> {
  const cache = loadGeocodeCache();
  const key = cacheKey || query.trim();

  // Check cache first
  if (cache[key]) {
    return cache[key];
  }

  try {
    // Use Nominatim (OpenStreetMap) - free, no API key required
    // Rate limit: 1 request per second
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'protest-scraper/1.0 (https://github.com/artem-schander/protest-scraper)',
      },
      timeout: 10000,
    });

    // Respect rate limit: 1 request per second
    // await delay(1100);
    await delay(100);

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      const displayName = result.display_name || undefined;
      const coords: GeoCoordinates = {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        display_name: displayName,
        formatted: formatLocationDetails(displayName) || undefined,
      };

      // Cache the result
      cache[key] = coords;
      saveGeocodeCache(cache);

      return coords;
    }

    // If no results and fallback city+country is provided, retry with simplified query
    if (fallbackCity && fallbackCountryCode) {
      const countryName = COUNTRY_NAMES[fallbackCountryCode] || fallbackCountryCode;
      const fallbackQuery = `${fallbackCity}, ${countryName}`;

      console.error(`[geocode] No results for "${query}", retrying with: "${fallbackQuery}"`);

      const fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fallbackQuery)}&format=json&limit=1`;

      const fallbackResponse = await axios.get(fallbackUrl, {
        headers: {
          'User-Agent': 'protest-scraper/1.0 (https://github.com/artem-schander/protest-scraper)',
        },
        timeout: 10000,
      });

      // Respect rate limit
      // await delay(1100);
      await delay(100);

      if (fallbackResponse.data && fallbackResponse.data.length > 0) {
        const result = fallbackResponse.data[0];
        const displayName = result.display_name || undefined;
        const coords: GeoCoordinates = {
          lat: parseFloat(result.lat),
          lon: parseFloat(result.lon),
          display_name: displayName,
          formatted: formatLocationDetails(displayName) || undefined,
        };

        // Cache using the original cache key
        cache[key] = coords;
        saveGeocodeCache(cache);

        console.error(`[geocode] Fallback succeeded for "${query}"`);
        return coords;
      }
    }
  } catch (e) {
    console.error(`[geocode] Failed to geocode "${query}":`, (e as Error).message);
  }

  return null;
}

export async function geocodeCities(cities: string[]): Promise<Map<string, GeoCoordinates>> {
  const coordsMap = new Map<string, GeoCoordinates>();
  const cache = loadGeocodeCache();

  console.error(`[geocode] Processing ${cities.length} unique cities...`);

  let fromCache = 0;
  let geocoded = 0;
  let failed = 0;

  for (const city of cities) {
    // Check if already in cache
    if (cache[city]) {
      coordsMap.set(city, cache[city]);
      fromCache++;
      continue;
    }

    // Geocode with rate limit (use city as both query and cache key)
    const coords = await geocodeLocation(city, city);
    if (coords) {
      coordsMap.set(city, coords);
      geocoded++;
    } else {
      failed++;
    }
  }

  console.error(
    `[geocode] Cached: ${fromCache}, New: ${geocoded}, Failed: ${failed}`
  );

  return coordsMap;
}
