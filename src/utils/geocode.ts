import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface GeoCoordinates {
  lat: number;
  lon: number;
  display_name?: string; // Normalized address from Nominatim
}

interface GeocodeCache {
  [city: string]: GeoCoordinates;
}

const GEOCODE_CACHE_FILE = path.join(process.cwd(), 'geocode-cache.json');

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

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function geocodeCity(city: string): Promise<GeoCoordinates | null> {
  const cache = loadGeocodeCache();
  const normalizedCity = city.trim();

  // Check cache first
  if (cache[normalizedCity]) {
    return cache[normalizedCity];
  }

  try {
    // Use Nominatim (OpenStreetMap) - free, no API key required
    // Rate limit: 1 request per second
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      normalizedCity
    )},Germany&format=json&limit=1`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'protest-scraper/1.0 (https://github.com/artem-schander/protest-scraper)',
      },
      timeout: 10000,
    });

    // Respect rate limit: 1 request per second
    await delay(1100);

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

    // Geocode with rate limit
    const coords = await geocodeCity(city);
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
