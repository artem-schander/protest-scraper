import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import fs from 'fs';
import path from 'path';
import { normalizeAddress, geocodeLocation, geocodeCities, type GeoCoordinates } from '@/utils/geocode.js';

// Mock delay to avoid timeouts
vi.mock('@/utils/delay.js', () => ({
  default: vi.fn(() => Promise.resolve()),
}));

describe('normalizeAddress', () => {
  it('returns empty string when address object missing', () => {
    expect(normalizeAddress(undefined)).toBe('');
    expect(normalizeAddress(null)).toBe('');
  });

  it('formats street, postcode, and locality', () => {
    const address = {
      road: 'Am Treptower Park',
      suburb: 'Plänterwald', // ignored by normalizeAddress
      postcode: '12435',
      city: 'Berlin',
    };

    expect(normalizeAddress(address)).toBe('Am Treptower Park, 12435 Berlin');
  });

  it('includes house number when provided', () => {
    const address = {
      road: 'Reeperbahn',
      house_number: '1A',
      postcode: '20359',
      city: 'Hamburg',
      state: 'Hamburg',
    };

    expect(normalizeAddress(address)).toBe('Reeperbahn 1A, 20359 Hamburg, Hamburg');
  });

  it('falls back to village or town when city missing', () => {
    const address = {
      road: 'Stephansplatz',
      postcode: '1010',
      town: 'Vienna',
      county: 'Innere Stadt',
    };

    expect(normalizeAddress(address)).toBe('Stephansplatz, 1010 Vienna, Innere Stadt');
  });

  it('omits missing sections gracefully', () => {
    const address = {
      city: 'Berlin',
    };

    expect(normalizeAddress(address)).toBe('Berlin');
  });

  it('returns joined region parts when available', () => {
    const address = {
      postcode: '75008',
      city: 'Paris',
      state: 'Île-de-France',
      county: 'Paris',
    };

    expect(normalizeAddress(address)).toBe('75008 Paris, Île-de-France Paris');
  });

  it('handles municipality field', () => {
    const address = {
      road: 'Main Street',
      postcode: '12345',
      municipality: 'Springfield',
    };

    expect(normalizeAddress(address)).toBe('Main Street, 12345 Springfield');
  });

  it('handles only road without house number', () => {
    const address = {
      road: 'Unter den Linden',
    };

    expect(normalizeAddress(address)).toBe('Unter den Linden');
  });

  it('handles only postcode without locality', () => {
    const address = {
      postcode: '10117',
    };

    expect(normalizeAddress(address)).toBe('10117');
  });

  it('handles village field', () => {
    const address = {
      village: 'Kleinstadt',
      postcode: '12345',
    };

    expect(normalizeAddress(address)).toBe('12345 Kleinstadt');
  });

  it('handles only state without county', () => {
    const address = {
      state: 'Bavaria',
    };

    expect(normalizeAddress(address)).toBe('Bavaria');
  });

  it('handles only county without state', () => {
    const address = {
      county: 'Munich',
    };

    expect(normalizeAddress(address)).toBe('Munich');
  });
});

describe('geocodeLocation', () => {
  let mock: MockAdapter;
  const cacheDir = path.join(process.cwd(), 'cache');
  const cacheFile = path.join(cacheDir, 'geocode.json');

  beforeEach(() => {
    mock = new MockAdapter(axios);

    // Create cache directory if it doesn't exist
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Clear cache file before each test
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }
  });

  afterEach(() => {
    mock.restore();

    // Clean up cache file after test
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }
  });

  it('should geocode a location successfully', async () => {
    const mockResponse = [
      {
        lat: '52.5200',
        lon: '13.4050',
        address: {
          city: 'Berlin',
          postcode: '10117',
          country: 'Germany',
        },
      },
    ];

    mock.onGet(/nominatim\.openstreetmap\.org/).reply(200, mockResponse);

    const result = await geocodeLocation('Berlin, Germany');

    expect(result).not.toBeNull();
    expect(result?.lat).toBe(52.52);
    expect(result?.lon).toBe(13.405);
    expect(result?.address).toBe('10117 Berlin');
  });

  it('should return cached result on second call', async () => {
    const mockResponse = [
      {
        lat: '52.5200',
        lon: '13.4050',
        address: {
          city: 'Berlin',
          postcode: '10117',
        },
      },
    ];

    let requestCount = 0;
    mock.onGet(/nominatim\.openstreetmap\.org/).reply(() => {
      requestCount++;
      return [200, mockResponse];
    });

    // First call
    await geocodeLocation('Berlin');
    expect(requestCount).toBe(1);

    // Second call should use cache
    const result = await geocodeLocation('Berlin');
    expect(requestCount).toBe(1); // Still 1, not 2
    expect(result?.lat).toBe(52.52);
  });

  it('should use custom cache key', async () => {
    const mockResponse = [
      {
        lat: '52.5200',
        lon: '13.4050',
        address: {
          city: 'Berlin',
        },
      },
    ];

    mock.onGet(/nominatim\.openstreetmap\.org/).reply(200, mockResponse);

    const result = await geocodeLocation('Berlin, Germany', 'custom-key');

    expect(result).not.toBeNull();

    // Check cache uses custom key
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    expect(cache['custom-key']).toBeDefined();
  });

  it('should handle empty response from Nominatim', async () => {
    mock.onGet(/nominatim\.openstreetmap\.org/).reply(200, []);

    const result = await geocodeLocation('Nonexistent Place');

    expect(result).toBeNull();
  });

  it('should handle network errors gracefully', async () => {
    mock.onGet(/nominatim\.openstreetmap\.org/).networkError();

    const result = await geocodeLocation('Berlin');

    expect(result).toBeNull();
  });

  it('should use fallback with city and country code', async () => {
    // First request fails (no results)
    mock.onGet(/q=10117%20Berlin/).reply(200, []);

    // Fallback request succeeds
    mock.onGet(/q=Berlin.*Germany/).reply(200, [
      {
        lat: '52.5200',
        lon: '13.4050',
        address: {
          city: 'Berlin',
          postcode: '10117',
        },
      },
    ]);

    const result = await geocodeLocation('10117 Berlin', undefined, 'Berlin', 'DE');

    expect(result).not.toBeNull();
    expect(result?.lat).toBe(52.52);
  });

  it('should return null when both primary and fallback fail', async () => {
    mock.onGet(/nominatim\.openstreetmap\.org/).reply(200, []);

    const result = await geocodeLocation('Invalid', undefined, 'Invalid City', 'XX');

    expect(result).toBeNull();
  });

  it('should handle timeout errors', async () => {
    mock.onGet(/nominatim\.openstreetmap\.org/).timeout();

    const result = await geocodeLocation('Berlin');

    expect(result).toBeNull();
  });

  it('should preserve cache across function calls', async () => {
    const mockResponse = [
      {
        lat: '48.1351',
        lon: '11.5820',
        address: {
          city: 'Munich',
          postcode: '80331',
        },
      },
    ];

    mock.onGet(/nominatim\.openstreetmap\.org/).reply(200, mockResponse);

    await geocodeLocation('Munich');

    // Cache should persist
    expect(fs.existsSync(cacheFile)).toBe(true);
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    expect(cache['Munich']).toBeDefined();
  });
});

describe('geocodeCities', () => {
  let mock: MockAdapter;
  const cacheDir = path.join(process.cwd(), 'cache');
  const cacheFile = path.join(cacheDir, 'geocode.json');

  beforeEach(() => {
    mock = new MockAdapter(axios);

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }
  });

  afterEach(() => {
    mock.restore();

    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }
  });

  it('should geocode multiple cities', async () => {
    mock.onGet(/q=Berlin/).reply(200, [
      {
        lat: '52.5200',
        lon: '13.4050',
        address: { city: 'Berlin', postcode: '10117' },
      },
    ]);

    mock.onGet(/q=Munich/).reply(200, [
      {
        lat: '48.1351',
        lon: '11.5820',
        address: { city: 'Munich', postcode: '80331' },
      },
    ]);

    const result = await geocodeCities(['Berlin', 'Munich']);

    expect(result.size).toBe(2);
    expect(result.get('Berlin')?.lat).toBe(52.52);
    expect(result.get('Munich')?.lat).toBe(48.1351);
  });

  it('should use cache for repeated cities', async () => {
    let requestCount = 0;
    mock.onGet(/nominatim\.openstreetmap\.org/).reply(() => {
      requestCount++;
      return [
        200,
        [
          {
            lat: '52.5200',
            lon: '13.4050',
            address: { city: 'Berlin' },
          },
        ],
      ];
    });

    // First call
    await geocodeCities(['Berlin']);
    expect(requestCount).toBe(1);

    // Second call with same city should use cache
    const result = await geocodeCities(['Berlin']);
    expect(requestCount).toBe(1); // Still 1
    expect(result.size).toBe(1);
  });

  it('should handle empty city list', async () => {
    const result = await geocodeCities([]);

    expect(result.size).toBe(0);
  });

  it('should skip cities that fail to geocode', async () => {
    mock.onGet(/q=ValidCity/).reply(200, [
      {
        lat: '52.5200',
        lon: '13.4050',
        address: { city: 'ValidCity' },
      },
    ]);

    mock.onGet(/q=InvalidCity/).reply(200, []);

    const result = await geocodeCities(['ValidCity', 'InvalidCity']);

    expect(result.size).toBe(1);
    expect(result.has('ValidCity')).toBe(true);
    expect(result.has('InvalidCity')).toBe(false);
  });
});
