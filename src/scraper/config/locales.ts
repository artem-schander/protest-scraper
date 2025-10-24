/**
 * Locale-specific configuration for date parsing, number formats, and timezones
 *
 * This allows the scraper to handle multiple countries with different:
 * - Date formats and month names
 * - Timezones
 * - Language codes
 * - Number formatting patterns for attendee counts
 */

export interface LocaleConfig {
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;

  /** IANA timezone identifier (e.g., "Europe/Berlin") */
  timezone: string;

  /** BCP 47 language tag (e.g., "de-DE", "en-US") */
  language: string;

  /** Map of local month names to numbers (01-12) */
  monthNames: Record<string, string>;

  /**
   * dayjs parse format strings to try in order
   * Examples: "DD.MM.YYYY", "DD.MM.YYYY HH:mm", "MM/DD/YYYY"
   */
  dateFormats: string[];

  /** Patterns for parsing attendee counts from text */
  numberFormats: {
    /** Patterns for "approximately X people" - should capture the number */
    approximately: RegExp[];

    /** Pattern for ranges like "1000-2000" or "5k-10k" */
    range: RegExp;

    /** Symbol for thousands (e.g., "k" in "5k") */
    thousands: string;
  };
}

/**
 * Locale configurations by country code
 */
export const LOCALES: Record<string, LocaleConfig> = {
  /**
   * Germany (and German-speaking regions)
   * Used by: Germany, Austria (similar)
   */
  'DE': {
    countryCode: 'DE',
    timezone: 'Europe/Berlin',
    language: 'de-DE',
    monthNames: {
      // Full month names
      'Januar': '01',
      'Februar': '02',
      'März': '03',
      'April': '04',
      'Mai': '05',
      'Juni': '06',
      'Juli': '07',
      'August': '08',
      'September': '09',
      'Oktober': '10',
      'November': '11',
      'Dezember': '12',
      // Abbreviated month names (3 letters)
      'Jan': '01',
      'Feb': '02',
      'Mär': '03',
      'Apr': '04',
      'Jun': '06',
      'Jul': '07',
      'Aug': '08',
      'Sep': '09',
      'Sept': '09',
      'Okt': '10',
      'Nov': '11',
      'Dez': '12',
    },
    dateFormats: [
      'DD.MM.YYYY HH:mm',        // "23.10.2025 14:30"
      'DD.MM.YYYY',               // "23.10.2025"
      'DD.MM. HH:mm',             // "23.10. 14:30" (current year implied)
      'DD. MM HH:mm YYYY',        // "23. 10 14:30 2025"
      'DD. MM YYYY',              // "23. 10 2025"
      'DD.MM.YY',                 // "23.10.25"
      'YYYY-MM-DD HH:mm',         // "2025-10-23 11:00" (Dresden after dot→colon conversion)
      'YYYY-MM-DD',               // "2025-10-23" (ISO date without time)
    ],
    numberFormats: {
      approximately: [
        /ca\.\s*(\d+)/i,          // "ca. 1000"
        /etwa\s+(\d+)/i,          // "etwa 500"
        /~\s*(\d+)/,              // "~ 200"
        /ungefähr\s+(\d+)/i,      // "ungefähr 300"
      ],
      range: /(\d+)\s*[-–]\s*(\d+)/, // "1000-2000" or "1000 – 2000"
      thousands: 'k',
    },
  },

  /**
   * Austria
   * Very similar to Germany but with its own timezone
   * Uses same German month names, date formats, and number formats
   */
  'AT': {
    countryCode: 'AT',
    timezone: 'Europe/Vienna',
    language: 'de-AT',
    // Same as German locale
    monthNames: {
      'Januar': '01', 'Februar': '02', 'März': '03', 'April': '04',
      'Mai': '05', 'Juni': '06', 'Juli': '07', 'August': '08',
      'September': '09', 'Oktober': '10', 'November': '11', 'Dezember': '12',
      'Jan': '01', 'Feb': '02', 'Mär': '03', 'Apr': '04',
      'Jun': '06', 'Jul': '07', 'Aug': '08', 'Sep': '09',
      'Sept': '09', 'Okt': '10', 'Nov': '11', 'Dez': '12',
    },
    dateFormats: [
      'DD.MM.YYYY HH:mm',
      'DD.MM.YYYY',
      'DD.MM. HH:mm',
      'DD. MM HH:mm YYYY',
      'DD. MM YYYY',
      'DD.MM.YY',
    ],
    numberFormats: {
      approximately: [
        /ca\.\s*(\d+)/i,
        /etwa\s+(\d+)/i,
        /~\s*(\d+)/,
        /ungefähr\s+(\d+)/i,
      ],
      range: /(\d+)\s*[-–]\s*(\d+)/,
      thousands: 'k',
    },
  },

  /**
   * France
   * Example configuration for future French sources
   */
  'FR': {
    countryCode: 'FR',
    timezone: 'Europe/Paris',
    language: 'fr-FR',
    monthNames: {
      // Full month names
      'janvier': '01',
      'février': '02',
      'mars': '03',
      'avril': '04',
      'mai': '05',
      'juin': '06',
      'juillet': '07',
      'août': '08',
      'septembre': '09',
      'octobre': '10',
      'novembre': '11',
      'décembre': '12',
      // Abbreviated (3 letters)
      'jan': '01',
      'fév': '02',
      'mar': '03',
      'avr': '04',
      'jui': '06',
      'juil': '07',
      'aoû': '08',
      'sep': '09',
      'sept': '09',
      'oct': '10',
      'nov': '11',
      'déc': '12',
    },
    dateFormats: [
      'DD/MM/YYYY HH:mm',         // "23/10/2025 14:30"
      'DD/MM/YYYY',               // "23/10/2025"
      'DD-MM-YYYY',               // "23-10-2025"
    ],
    numberFormats: {
      approximately: [
        /environ\s+(\d+)/i,       // "environ 1000"
        /~\s*(\d+)/,              // "~ 200"
        /approximativement\s+(\d+)/i, // "approximativement 500"
      ],
      range: /(\d+)\s*[-–]\s*(\d+)/,
      thousands: 'k',
    },
  },

  /**
   * United States
   * Example configuration for future US sources
   */
  'US': {
    countryCode: 'US',
    timezone: 'America/New_York', // Default to Eastern Time
    language: 'en-US',
    monthNames: {
      // Full month names
      'January': '01',
      'February': '02',
      'March': '03',
      'April': '04',
      'May': '05',
      'June': '06',
      'July': '07',
      'August': '08',
      'September': '09',
      'October': '10',
      'November': '11',
      'December': '12',
      // Abbreviated (3 letters)
      'Jan': '01',
      'Feb': '02',
      'Mar': '03',
      'Apr': '04',
      'Jun': '06',
      'Jul': '07',
      'Aug': '08',
      'Sep': '09',
      'Sept': '09',
      'Oct': '10',
      'Nov': '11',
      'Dec': '12',
    },
    dateFormats: [
      'MM/DD/YYYY h:mm A',        // "10/23/2025 2:30 PM"
      'MM/DD/YYYY',               // "10/23/2025"
      'MM-DD-YYYY',               // "10-23-2025"
      'YYYY-MM-DD HH:mm',         // ISO format common in APIs
    ],
    numberFormats: {
      approximately: [
        /approx(?:imately)?\s+(\d+)/i, // "approx 1000" or "approximately 1000"
        /~\s*(\d+)/,                // "~ 200"
        /about\s+(\d+)/i,           // "about 500"
      ],
      range: /(\d+)\s*[-–]\s*(\d+)/,
      thousands: 'k',
    },
  },
};

/**
 * Get locale configuration for a country code
 * @param code - ISO 3166-1 alpha-2 country code
 * @returns Locale configuration or undefined if not found
 */
export function getLocale(code: string): LocaleConfig | undefined {
  return LOCALES[code];
}
