import { describe, it, expect } from 'vitest';
import { formatLocationDetails } from '../../src/utils/geocode.js';

describe('formatLocationDetails', () => {
  it('should format German address with postal code and city', () => {
    const input = 'Am Treptower Park, Plänterwald, Treptow-Köpenick, Berlin, 12435, Deutschland';
    const expected = '12435 Berlin, Treptow-Köpenick, Plänterwald, Am Treptower Park';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should format simple city and country', () => {
    const input = 'Berlin, Deutschland';
    const expected = 'Berlin';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should format Austrian address (4-digit postal code)', () => {
    const input = 'Stephansplatz, Innere Stadt, Vienna, 1010, Austria';
    const expected = '1010 Vienna, Innere Stadt, Stephansplatz';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should format Swiss address (4-digit postal code)', () => {
    const input = 'Bahnhofstrasse, Zürich, 8001, Switzerland';
    const expected = '8001 Zürich, Bahnhofstrasse';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should format French address (5-digit postal code)', () => {
    const input = 'Champs-Élysées, 8th arrondissement, Paris, 75008, France';
    const expected = '75008 Paris, 8th arrondissement, Champs-Élysées';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should format Dutch address (postal code with letters)', () => {
    const input = 'Dam Square, Centrum, Amsterdam, 1012 AB, Netherlands';
    const expected = '1012 AB Amsterdam, Centrum, Dam Square';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should format UK address (complex postal code)', () => {
    const input = 'Downing Street, Westminster, London, SW1A 1AA, United Kingdom';
    const expected = 'SW1A 1AA London, Westminster, Downing Street';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should format Polish address (dash-separated postal code)', () => {
    const input = 'Market Square, Old Town, Warsaw, 00-001, Poland';
    const expected = '00-001 Warsaw, Old Town, Market Square';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should handle address without postal code', () => {
    const input = 'Central Square, District, City, Country';
    const expected = 'City, District, Central Square';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should handle single element', () => {
    const input = 'Berlin';
    const expected = 'Berlin';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should return null for undefined', () => {
    expect(formatLocationDetails(undefined)).toBe(null);
  });

  it('should return null for empty string', () => {
    expect(formatLocationDetails('')).toBe(null);
  });

  it('should handle address with extra whitespace', () => {
    const input = '  Am Treptower Park  ,  Plänterwald  ,  Berlin  ,  12435  ,  Deutschland  ';
    const expected = '12435 Berlin, Plänterwald, Am Treptower Park';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should format Dresden address', () => {
    const input = 'Altmarkt, Innere Altstadt, Dresden, 01067, Germany';
    const expected = '01067 Dresden, Innere Altstadt, Altmarkt';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should format Munich address', () => {
    const input = 'Marienplatz, Altstadt-Lehel, Munich, 80331, Germany';
    const expected = '80331 Munich, Altstadt-Lehel, Marienplatz';
    expect(formatLocationDetails(input)).toBe(expected);
  });

  it('should format Hamburg address', () => {
    const input = 'Reeperbahn, St. Pauli, Hamburg, 20359, Germany';
    const expected = '20359 Hamburg, St. Pauli, Reeperbahn';
    expect(formatLocationDetails(input)).toBe(expected);
  });
});
