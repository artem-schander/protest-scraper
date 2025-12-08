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
 * Result from parsing a time range from text
 */
export interface ParsedTimeRange {
  /** Start hour (0-23) */
  startHour: number;
  /** Start minute (0-59) */
  startMinute: number;
  /** End hour (0-23) */
  endHour: number;
  /** End minute (0-59) */
  endMinute: number;
}

/**
 * Extract time range from text like "17-18 Uhr", "14:00-16:30", "10h-12h"
 *
 * @param text - Text to search for time range
 * @returns Parsed time range or null if not found
 *
 * @example
 * parseTimeRange("Event 17-18 Uhr in Berlin")  // { startHour: 17, startMinute: 0, endHour: 18, endMinute: 0 }
 * parseTimeRange("14:30-16:00 Demo")           // { startHour: 14, startMinute: 30, endHour: 16, endMinute: 0 }
 * parseTimeRange("No time here")               // null
 */
export function parseTimeRange(text: string): ParsedTimeRange | null {
  if (!text) return null;

  // Pattern: "HH-HH Uhr" or "HH:MM-HH:MM" or "HHh-HHh" (French)
  // Matches: "17-18 Uhr", "17:00-18:00", "14.30-16.00 Uhr", "10h-12h"
  const patterns = [
    // "17-18 Uhr" or "17 - 18 Uhr" (simple hour range with Uhr)
    /(\d{1,2})\s*[-–]\s*(\d{1,2})\s*Uhr/i,
    // "17:00-18:00" or "17:00 - 18:00" (with minutes, colon separator)
    /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/,
    // "17.00-18.00" or "17.00 - 18.00" (with minutes, dot separator - German style)
    /(\d{1,2})\.(\d{2})\s*[-–]\s*(\d{1,2})\.(\d{2})/,
    // "17h-18h" or "17h - 18h" (French style)
    /(\d{1,2})h\s*[-–]\s*(\d{1,2})h/i,
    // "17h00-18h00" (French with minutes)
    /(\d{1,2})h(\d{2})\s*[-–]\s*(\d{1,2})h(\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Check which pattern matched based on number of capture groups
      if (match.length === 3) {
        // Simple hour range (no minutes): "17-18 Uhr" or "17h-18h"
        const startHour = parseInt(match[1], 10);
        const endHour = parseInt(match[2], 10);
        // Validate hours are reasonable (0-23)
        if (startHour >= 0 && startHour <= 23 && endHour >= 0 && endHour <= 23) {
          return {
            startHour,
            startMinute: 0,
            endHour,
            endMinute: 0,
          };
        }
      } else if (match.length === 5) {
        // Full time range with minutes
        const startHour = parseInt(match[1], 10);
        const startMinute = parseInt(match[2], 10);
        const endHour = parseInt(match[3], 10);
        const endMinute = parseInt(match[4], 10);
        // Validate
        if (
          startHour >= 0 && startHour <= 23 &&
          endHour >= 0 && endHour <= 23 &&
          startMinute >= 0 && startMinute <= 59 &&
          endMinute >= 0 && endMinute <= 59
        ) {
          return {
            startHour,
            startMinute,
            endHour,
            endMinute,
          };
        }
      }
    }
  }

  return null;
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
