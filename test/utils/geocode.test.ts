import { describe, it, expect } from 'vitest';
import { normalizeAddress } from '../../src/utils/geocode.js';

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
});
