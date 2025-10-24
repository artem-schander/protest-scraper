/**
 * Locale-aware attendee count parsing utility
 *
 * This module provides generic attendee number extraction from text,
 * supporting different locale-specific patterns (e.g., German "Teilnehmer",
 * English "attendees", French "participants").
 */

import { LocaleConfig } from '@/scraper/config/locales.js';

/**
 * Parse attendee count from text using locale-specific patterns
 *
 * @param text - Text to extract attendee count from
 * @param locale - Locale configuration with number format patterns
 * @param keywords - Optional array of keywords to search for after numbers
 *                   (e.g., ["Teilnehmer", "Personen"] for German,
 *                    ["attendees", "people"] for English)
 * @returns Attendee count or null if not found
 *
 * Features:
 * - Handles approximate counts: "ca. 1000", "approx 500", "environ 300"
 * - Handles ranges: "1000-2000" (returns the maximum)
 * - Removes thousand separators: "1.000" → 1000
 * - Locale-aware patterns from config
 *
 * @example
 * const locale = LOCALES['DE'];
 * parseAttendees("ca. 1000 Teilnehmer", locale, ["Teilnehmer", "Personen"]);
 * // Returns: 1000
 *
 * parseAttendees("500-800 attendees", LOCALES['US'], ["attendees", "people"]);
 * // Returns: 800 (max of range)
 */
export function parseAttendees(
  text: string,
  locale: LocaleConfig,
  keywords?: string[]
): number | null {
  if (!text) return null;

  // Default keywords if not provided (backward compatible with German)
  const searchKeywords = keywords || ['Teilnehmer', 'Personen', 'Menschen', 'Leute'];

  // Try "approximately" patterns from locale config
  for (const pattern of locale.numberFormats.approximately) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const num = parseInt(match[1].replace(/[.\s]/g, ''), 10);
      if (!isNaN(num)) {
        return num;
      }
    }
  }

  // Try range pattern (e.g., "1000-2000")
  const rangeMatch = text.match(locale.numberFormats.range);
  if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
    const num1 = parseInt(rangeMatch[1].replace(/[.\s]/g, ''), 10);
    const num2 = parseInt(rangeMatch[2].replace(/[.\s]/g, ''), 10);
    if (!isNaN(num1) && !isNaN(num2)) {
      // Return the maximum of the range
      return Math.max(num1, num2);
    }
  }

  // Build pattern with keywords
  // Matches patterns like:
  // "500 Teilnehmer", "1.000 attendees", "ca. 2000 people"
  const keywordPattern = searchKeywords.join('|');
  const pattern = new RegExp(
    `(?:ca\\.?\\s*|etwa\\s*|approx(?:imately)?\\s*|environ\\s*|about\\s*|~\\s*|bis\\s*(?:zu\\s*)?)?` +
    `(\\d{1,3}(?:[.\\s]\\d{3})*|\\d+)` +
    `(?:\\s*[-–]\\s*(\\d{1,3}(?:[.\\s]\\d{3})*|\\d+))?` +
    `\\s*(?:${keywordPattern})`,
    'gi'
  );

  const matches = text.matchAll(pattern);
  for (const match of matches) {
    const num1 = match[1]?.replace(/[.\\s]/g, '');
    const num2 = match[2]?.replace(/[.\\s]/g, '');

    if (num1) {
      // If there's a range, use the higher number
      if (num2) {
        return Math.max(parseInt(num1, 10), parseInt(num2, 10));
      }
      return parseInt(num1, 10);
    }
  }

  return null;
}

/**
 * Parse attendees with German keywords (backward compatibility helper)
 */
export function parseGermanAttendees(text: string, locale: LocaleConfig): number | null {
  return parseAttendees(text, locale, ['Teilnehmer', 'Personen', 'Menschen', 'Leute', 'Teilnehmer*innen']);
}

/**
 * Parse attendees with English keywords
 */
export function parseEnglishAttendees(text: string, locale: LocaleConfig): number | null {
  return parseAttendees(text, locale, ['attendees', 'people', 'participants', 'protesters']);
}

/**
 * Parse attendees with French keywords
 */
export function parseFrenchAttendees(text: string, locale: LocaleConfig): number | null {
  return parseAttendees(text, locale, ['participants', 'personnes', 'manifestants']);
}
