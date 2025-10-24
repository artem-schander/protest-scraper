import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { isAllowedByRobots, clearRobotsCache } from '@/utils/robots.js';

describe('robots.txt Utility', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(axios);
    clearRobotsCache();
  });

  afterEach(() => {
    mock.restore();
    clearRobotsCache();
  });

  it('should allow URL when robots.txt allows it', async () => {
    const robotsTxt = `
User-agent: *
Disallow: /admin/
Disallow: /private/
    `;

    mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

    const allowed = await isAllowedByRobots('https://example.com/api/data');

    expect(allowed).toBe(true);
  });

  it('should disallow URL when robots.txt disallows it', async () => {
    const robotsTxt = `
User-agent: *
Disallow: /admin/
Disallow: /private/
    `;

    mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

    const allowed = await isAllowedByRobots('https://example.com/admin/users');

    expect(allowed).toBe(false);
  });

  it('should match path prefixes correctly', async () => {
    const robotsTxt = `
User-agent: *
Disallow: /api/
    `;

    mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

    const allowed1 = await isAllowedByRobots('https://example.com/api/users');
    const allowed2 = await isAllowedByRobots('https://example.com/api');
    const allowed3 = await isAllowedByRobots('https://example.com/api123');

    expect(allowed1).toBe(false); // /api/users starts with /api/
    expect(allowed2).toBe(true);  // /api does NOT start with /api/ (needs trailing slash)
    expect(allowed3).toBe(true);  // /api123 does NOT start with /api/
  });

  it('should handle specific user agent rules', async () => {
    const robotsTxt = `
User-agent: protest-scraper
Disallow: /api/

User-agent: *
Disallow: /admin/
    `;

    mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

    const allowed = await isAllowedByRobots('https://example.com/api/data', 'protest-scraper');

    expect(allowed).toBe(false);
  });

  it('should allow everything when robots.txt does not exist', async () => {
    mock.onGet('https://example.com/robots.txt').reply(404);

    const allowed = await isAllowedByRobots('https://example.com/anything');

    expect(allowed).toBe(true);
  });

  it('should allow everything when robots.txt fetch fails', async () => {
    mock.onGet('https://example.com/robots.txt').networkError();

    const allowed = await isAllowedByRobots('https://example.com/anything');

    expect(allowed).toBe(true);
  });

  it('should handle robots.txt with comments', async () => {
    const robotsTxt = `
# This is a comment
User-agent: *
# Another comment
Disallow: /private/
    `;

    mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

    const allowed1 = await isAllowedByRobots('https://example.com/public');
    const allowed2 = await isAllowedByRobots('https://example.com/private/data');

    expect(allowed1).toBe(true);
    expect(allowed2).toBe(false);
  });

  it('should handle empty Disallow (allows everything)', async () => {
    const robotsTxt = `
User-agent: *
Disallow:
    `;

    mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

    const allowed = await isAllowedByRobots('https://example.com/anything');

    expect(allowed).toBe(true);
  });

  it('should handle URL with query parameters', async () => {
    const robotsTxt = `
User-agent: *
Disallow: /search?
    `;

    mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

    const allowed1 = await isAllowedByRobots('https://example.com/search?q=test');
    const allowed2 = await isAllowedByRobots('https://example.com/search');

    expect(allowed1).toBe(false); // /search?q=test starts with /search?
    expect(allowed2).toBe(true);  // /search does not start with /search?
  });

  it('should cache robots.txt results', async () => {
    const robotsTxt = `
User-agent: *
Disallow: /admin/
    `;

    let requestCount = 0;
    mock.onGet('https://example.com/robots.txt').reply(() => {
      requestCount++;
      return [200, robotsTxt];
    });

    // First request
    await isAllowedByRobots('https://example.com/page1');
    expect(requestCount).toBe(1);

    // Second request - should use cache
    await isAllowedByRobots('https://example.com/page2');
    expect(requestCount).toBe(1); // Still 1, not 2

    // Third request - still cached
    await isAllowedByRobots('https://example.com/page3');
    expect(requestCount).toBe(1);
  });

  it('should handle multiple User-agent blocks correctly', async () => {
    const robotsTxt = `
User-agent: googlebot
Disallow: /private/

User-agent: *
Disallow: /admin/
    `;

    mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

    // For wildcard user agent
    const allowed1 = await isAllowedByRobots('https://example.com/private/', '*');
    const allowed2 = await isAllowedByRobots('https://example.com/admin/', '*');

    expect(allowed1).toBe(true);  // /private/ only disallowed for googlebot
    expect(allowed2).toBe(false); // /admin/ disallowed for *
  });

  it('should handle malformed robots.txt gracefully', async () => {
    const robotsTxt = `
This is not a valid robots.txt
Random text here
No proper directives
    `;

    mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

    const allowed = await isAllowedByRobots('https://example.com/anything');

    expect(allowed).toBe(true); // No valid Disallow rules, so allow everything
  });

  it('should handle case-insensitive user agent matching', async () => {
    const robotsTxt = `
User-agent: ProTest-Scraper
Disallow: /api/
    `;

    mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

    const allowed = await isAllowedByRobots('https://example.com/api/data', 'protest-scraper');

    expect(allowed).toBe(false); // Should match case-insensitively
  });

  describe('Allow directive support', () => {
    it('should handle Allow directive overriding Disallow (more specific path)', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
      `;

      mock.onGet('https://www.demokrateam.org/robots.txt').reply(200, robotsTxt);

      // More specific Allow should override broader Disallow
      const ajaxAllowed = await isAllowedByRobots(
        'https://www.demokrateam.org/wp-admin/admin-ajax.php',
        'protest-scraper/1.0'
      );
      expect(ajaxAllowed).toBe(true);

      // Other wp-admin paths should still be disallowed
      const settingsDisallowed = await isAllowedByRobots(
        'https://www.demokrateam.org/wp-admin/settings.php',
        'protest-scraper/1.0'
      );
      expect(settingsDisallowed).toBe(false);

      // Non-wp-admin paths should be allowed
      const publicAllowed = await isAllowedByRobots(
        'https://www.demokrateam.org/events',
        'protest-scraper/1.0'
      );
      expect(publicAllowed).toBe(true);
    });

    it('should handle Allow with equal specificity (Allow wins)', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /api/
Allow: /api/
      `;

      mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

      const allowed = await isAllowedByRobots('https://example.com/api/data');
      expect(allowed).toBe(true);
    });

    it('should handle Allow overriding root Disallow', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /
Allow: /api/
      `;

      mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

      const apiAllowed = await isAllowedByRobots('https://example.com/api/data');
      expect(apiAllowed).toBe(true);

      const otherDisallowed = await isAllowedByRobots('https://example.com/other/path');
      expect(otherDisallowed).toBe(false);
    });

    it('should handle multiple Allow rules (most specific wins)', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /
Allow: /api/
Allow: /api/public/
      `;

      mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

      // More specific Allow should take precedence
      const publicAllowed = await isAllowedByRobots('https://example.com/api/public/data');
      expect(publicAllowed).toBe(true);

      const apiAllowed = await isAllowedByRobots('https://example.com/api/private');
      expect(apiAllowed).toBe(true);

      const rootDisallowed = await isAllowedByRobots('https://example.com/other');
      expect(rootDisallowed).toBe(false);
    });

    it('should handle complex Disallow and Allow combinations', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /admin/
Disallow: /api/internal/
Allow: /api/
      `;

      mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

      // /api/ is allowed
      const apiAllowed = await isAllowedByRobots('https://example.com/api/data');
      expect(apiAllowed).toBe(true);

      // /api/internal/ is more specifically disallowed
      const internalDisallowed = await isAllowedByRobots('https://example.com/api/internal/secret');
      expect(internalDisallowed).toBe(false);

      // /admin/ is disallowed
      const adminDisallowed = await isAllowedByRobots('https://example.com/admin/panel');
      expect(adminDisallowed).toBe(false);
    });

    it('should handle Allow without any Disallow', async () => {
      const robotsTxt = `
User-agent: *
Allow: /api/
      `;

      mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

      // Everything should be allowed (no disallow rules)
      const apiAllowed = await isAllowedByRobots('https://example.com/api/data');
      expect(apiAllowed).toBe(true);

      const otherAllowed = await isAllowedByRobots('https://example.com/other');
      expect(otherAllowed).toBe(true);
    });

    it('should handle empty Allow directive', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /
Allow:
      `;

      mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

      // Empty Allow should be ignored
      const disallowed = await isAllowedByRobots('https://example.com/anything');
      expect(disallowed).toBe(false);
    });

    it('should handle longest match precedence with multiple rules', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /a
Disallow: /a/b
Allow: /a/b/c
      `;

      mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

      // /a/b/c should be allowed (most specific)
      const allowed = await isAllowedByRobots('https://example.com/a/b/c/file.txt');
      expect(allowed).toBe(true);

      // /a/b should be disallowed
      const disallowed = await isAllowedByRobots('https://example.com/a/b/file.txt');
      expect(disallowed).toBe(false);

      // /a should be disallowed
      const disallowedA = await isAllowedByRobots('https://example.com/a/file.txt');
      expect(disallowedA).toBe(false);
    });

    it('should handle DemokraTEAM real-world scenario', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

Sitemap: https://www.demokrateam.org/sitemap_index.xml
      `;

      mock.onGet('https://www.demokrateam.org/robots.txt').reply(200, robotsTxt);

      // Test the exact URL used by the scraper
      const ajaxUrl = 'https://www.demokrateam.org/wp-admin/admin-ajax.php';
      const ajaxAllowed = await isAllowedByRobots(ajaxUrl, 'protest-scraper/1.0');
      expect(ajaxAllowed).toBe(true);

      // Test with POST params (query string)
      const ajaxWithParams = 'https://www.demokrateam.org/wp-admin/admin-ajax.php?action=mec_daily_view_load_month';
      const paramsAllowed = await isAllowedByRobots(ajaxWithParams, 'protest-scraper/1.0');
      expect(paramsAllowed).toBe(true);
    });

    it('should handle multiple user agents with different Allow rules', async () => {
      const robotsTxt = `
User-agent: protest-scraper
Disallow: /api/
Allow: /api/public/

User-agent: *
Disallow: /
      `;

      mock.onGet('https://example.com/robots.txt').reply(200, robotsTxt);

      // protest-scraper can access /api/public/
      const publicAllowed = await isAllowedByRobots('https://example.com/api/public/data', 'protest-scraper');
      expect(publicAllowed).toBe(true);

      // protest-scraper cannot access other /api/ paths
      const apiDisallowed = await isAllowedByRobots('https://example.com/api/private', 'protest-scraper');
      expect(apiDisallowed).toBe(false);

      // Other agents are blocked from everything
      const otherDisallowed = await isAllowedByRobots('https://example.com/anything', 'other-bot');
      expect(otherDisallowed).toBe(false);
    });
  });
});
