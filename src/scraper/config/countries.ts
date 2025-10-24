/**
 * Country metadata and ISO 3166-1 alpha-2 code mappings
 *
 * This is the single source of truth for country code to name conversions
 * used throughout the scraper system.
 */

export const COUNTRY_NAMES: Record<string, string> = {
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
  'SE': 'Sweden',
  'NO': 'Norway',
  'FI': 'Finland',
  'ES': 'Spain',
  'PT': 'Portugal',
  'GB': 'United Kingdom',
  'IE': 'Ireland',
  'US': 'United States',
  'CA': 'Canada',
  'AU': 'Australia',
  'NZ': 'New Zealand',
  // Add more as needed
};

/**
 * Get full country name from ISO 3166-1 alpha-2 code
 * @param code - Two-letter country code (e.g., "DE", "FR")
 * @returns Full country name or the code itself if not found
 */
export function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}
