/**
 * Locale-aware date parsing utility
 *
 * This module provides generic date parsing that works across different locales,
 * replacing the German-specific parseGermanDate() function.
 */

import dayjs, { Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { LocaleConfig } from '@/scraper/config/locales.js';

// Initialize dayjs plugins
dayjs.extend(customParseFormat);
dayjs.extend(timezone);
dayjs.extend(utc);

/**
 * Result from parsing a date with information about time presence
 */
export interface ParsedDate {
  /** Parsed dayjs object */
  date: Dayjs;
  /** Whether the input string contained a time component */
  hasTime: boolean;
}

/**
 * Parse a date string using locale-specific configuration
 *
 * @param str - Date string to parse (e.g., "23.10.2025 14:30" for German)
 * @param locale - Locale configuration with month names, formats, and timezone
 * @param returnDetails - If true, returns object with date and hasTime flag
 * @returns Parsed dayjs object or null if parsing fails (or ParsedDate if returnDetails=true)
 *
 * Features:
 * - Replaces locale-specific month names with numbers
 * - Tries multiple date format patterns
 * - Handles missing years (assumes current or next year)
 * - Removes time suffixes (like "Uhr" in German)
 * - Converts time dots to colons (14.30 → 14:30)
 * - Applies correct timezone
 * - Can detect if time was present in input
 *
 * @example
 * const locale = LOCALES['DE'];
 * parseDate("23. Oktober 2025 14:30", locale);  // German with time
 * parseDate("23. Oktober 2025", locale);  // German date-only
 * const result = parseDate("23.10.2025", locale, true);  // Get details
 * if (result && !result.hasTime) console.log("No time specified");
 */
export function parseDate(str: string, locale: LocaleConfig): Dayjs | null;
export function parseDate(str: string, locale: LocaleConfig, returnDetails: true): ParsedDate | null;
export function parseDate(str: string, locale: LocaleConfig, returnDetails?: boolean): Dayjs | ParsedDate | null {
  if (!str) return null;

  const now = dayjs().tz(locale.timezone);

  // Detect if string contains time information
  // Look for time patterns: HH:MM, H:MM, HH.MM (before cleaning)
  const hasTimePattern = /\d{1,2}[:.]\d{2}/.test(str);

  let cleaned = str
    // Remove common time suffixes (like "Uhr" in German)
    .replace(/[Uu]hr/g, '')
    .replace(/\s*-\s*\d{1,2}[:.]\d{2}.*$/, '') // Remove end time like "- 19.00"
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(',', '');

  // Replace month names with numbers using locale configuration
  for (const [monthName, monthNumber] of Object.entries(locale.monthNames)) {
    // Use word boundaries to avoid partial matches
    const regex = new RegExp(`\\b${monthName}\\b`, 'gi');
    cleaned = cleaned.replace(regex, monthNumber);
  }

  cleaned = cleaned.trim();

  // Convert time dots to colons but preserve date dots
  // For formats like "15.03 14.30" or "15.03.2025 14.30"
  // Match the LAST occurrence of two digits with a dot before end/space
  cleaned = cleaned.replace(/(\s)(\d{1,2})\.(\d{2})(\s|$)/, '$1$2:$3$4');

  // Try parsing with all configured formats
  let d = dayjs(cleaned, locale.dateFormats, true);

  // If no year provided and date is valid, assume current or next year
  if (d.isValid() && !cleaned.includes('20') && !cleaned.includes('19')) {
    const currentYear = now.year();
    // If date is in the past, assume next year
    if (d.year(currentYear).isBefore(now)) {
      d = d.year(currentYear + 1);
    } else {
      d = d.year(currentYear);
    }
  }

  // Apply timezone
  if (d.isValid()) {
    d = d.tz(locale.timezone, true);
  }

  if (!d.isValid()) return null;

  // Return detailed result if requested
  if (returnDetails) {
    return {
      date: d,
      hasTime: hasTimePattern,
    };
  }

  return d;
}

/**
 * Helper to check if a date is within the next N days
 *
 * @param dateStr - ISO date string
 * @param days - Number of days forward
 * @param referenceDate - Reference date (defaults to now in Europe/Berlin for backward compatibility)
 * @returns True if date is within range
 */
export function withinNextDays(
  dateStr: string | null,
  days: number,
  referenceDate?: Dayjs
): boolean {
  if (!dateStr) return false;

  const ref = referenceDate || dayjs().tz('Europe/Berlin');
  const date = dayjs(dateStr);

  if (!date.isValid()) return false;

  const maxDate = ref.add(days, 'day');
  return date.isAfter(ref) && date.isBefore(maxDate);
}
