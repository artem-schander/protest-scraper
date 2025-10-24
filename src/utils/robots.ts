/**
 * robots.txt utility - Check if URL is allowed by robots.txt
 *
 * This module provides functions to fetch and parse robots.txt files
 * and check if a given URL path is allowed for crawling.
 *
 * Uses the well-maintained robots-parser library for proper spec compliance.
 */

import axios from 'axios';
import robotsParser from 'robots-parser';

interface RobotsCache {
  [domain: string]: {
    parser: ReturnType<typeof robotsParser>;
    fetchedAt: number;
  };
}

// In-memory cache of robots.txt parsers (1 hour TTL)
const robotsCache: RobotsCache = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch and parse robots.txt for a given domain
 *
 * @param domain - Domain to fetch robots.txt from (e.g., "example.com")
 * @returns Robots parser instance
 */
async function fetchRobotsTxt(domain: string): Promise<ReturnType<typeof robotsParser>> {
  const cacheKey = domain;
  const now = Date.now();

  // Check cache
  if (robotsCache[cacheKey] && now - robotsCache[cacheKey].fetchedAt < CACHE_TTL) {
    return robotsCache[cacheKey].parser;
  }

  try {
    const robotsUrl = `https://${domain}/robots.txt`;
    const response = await axios.get(robotsUrl, {
      timeout: 5000,
      validateStatus: (status) => status === 200,
    });

    const parser = robotsParser(robotsUrl, response.data);

    // Cache the result
    robotsCache[cacheKey] = {
      parser,
      fetchedAt: now,
    };

    return parser;
  } catch (error) {
    // If robots.txt doesn't exist or can't be fetched, allow everything
    console.warn(`[robots.txt] Could not fetch robots.txt for ${domain}:`, (error as Error).message);

    // Cache empty parser (allows everything)
    const emptyParser = robotsParser(`https://${domain}/robots.txt`, '');
    robotsCache[cacheKey] = {
      parser: emptyParser,
      fetchedAt: now,
    };

    return emptyParser;
  }
}

/**
 * Check if a URL is allowed by robots.txt
 *
 * Uses robots-parser library which properly implements:
 * - Allow/Disallow precedence according to robots.txt spec
 * - More specific (longer) rules take precedence
 * - Wildcard matching (* and $)
 * - User-agent matching
 *
 * @param url - Full URL to check
 * @param userAgent - User agent string (default: "protest-scraper")
 * @returns Promise<boolean> - true if allowed, false if disallowed
 *
 * @example
 * const allowed = await isAllowedByRobots('https://example.com/api/data');
 * if (allowed) {
 *   // Proceed with scraping
 * }
 */
export async function isAllowedByRobots(url: string, userAgent: string = 'protest-scraper'): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    const parser = await fetchRobotsTxt(domain);
    const allowed = parser.isAllowed(url, userAgent);

    if (!allowed) {
      console.warn(`[robots.txt] Path ${urlObj.pathname} is disallowed by robots.txt for ${domain}`);
    }

    return allowed || false;
  } catch (error) {
    // If there's an error parsing URL, allow by default
    console.error(`[robots.txt] Error checking robots.txt for ${url}:`, (error as Error).message);
    return true;
  }
}

/**
 * Clear the robots.txt cache
 *
 * Useful for testing or forcing a refresh of robots.txt rules
 */
export function clearRobotsCache(): void {
  for (const key in robotsCache) {
    delete robotsCache[key];
  }
}
