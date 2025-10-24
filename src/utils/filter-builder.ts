import { Request } from 'express';
import { ProtestQueryFilters } from '@/types/protest.js';

/**
 * Builds a MongoDB filter object from Express request query parameters.
 * Supports all protest filtering options: city, source, country, language, search (title),
 * date range (startDate/endDate or days), geolocation (lat/lon/radius), and verified status.
 *
 * @param req - Express Request object with query parameters
 * @param options - Optional configuration
 * @param options.defaultVerified - Default value for verified filter (default: true for public exports, undefined for admin views)
 * @returns MongoDB filter object
 */
export function buildProtestFilter(
  req: Request,
  options: { defaultVerified?: boolean } = { defaultVerified: true }
): any {
  const {
    city,
    source,
    country,
    language,
    search,
    days,
    startDate,
    endDate,
    verified,
    lat,
    lon,
    radius,
  }: ProtestQueryFilters = req.query;

  const filter: any = {};

  // Always exclude soft-deleted events
  filter.deleted = { $ne: true };

  // City filter
  if (city && typeof city === 'string') {
    filter.city = city;
  }

  // Source filter
  if (source && typeof source === 'string') {
    filter.source = source;
  }

  // Country filter (ISO 3166-1 alpha-2 codes)
  if (country && typeof country === 'string') {
    filter.country = country.toUpperCase(); // Ensure uppercase for ISO codes
  }

  // Language filter
  if (language && typeof language === 'string') {
    filter.language = language;
  }

  // Full-text search in title (case-insensitive partial match)
  if (search && typeof search === 'string') {
    // Escape special regex characters to prevent regex injection
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.title = { $regex: escapedSearch, $options: 'i' };
  }

  // Geolocation filter (takes precedence over city filter)
  if (lat && lon && typeof lat === 'string' && typeof lon === 'string') {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    const radiusKm = radius && typeof radius === 'string' ? parseFloat(radius) : 50; // Default 50km

    if (!isNaN(latitude) && !isNaN(longitude) && !isNaN(radiusKm)) {
      // Use $geoWithin + $centerSphere for geolocation search
      // This works with additional sorting unlike $near
      filter.geoLocation = {
        $geoWithin: {
          $centerSphere: [
            [longitude, latitude], // GeoJSON: [lon, lat]
            radiusKm / 6378.1, // Convert km to radians (Earth radius = 6378.1 km)
          ],
        },
      };

      // Remove city filter when using geolocation
      delete filter.city;
    }
  }

  // Date range filter
  // Priority: explicit startDate/endDate > days parameter > default (future events only)
  if ((startDate && typeof startDate === 'string') || (endDate && typeof endDate === 'string')) {
    // Use explicit date range
    filter.start = {};

    if (startDate && typeof startDate === 'string') {
      const startDateObj = new Date(startDate);
      if (!isNaN(startDateObj.getTime())) {
        filter.start.$gte = startDateObj;
      }
    }

    if (endDate && typeof endDate === 'string') {
      const endDateObj = new Date(endDate);
      if (!isNaN(endDateObj.getTime())) {
        // Set to end of day (23:59:59.999)
        endDateObj.setHours(23, 59, 59, 999);
        filter.start.$lte = endDateObj;
      }
    }
  } else if (days && typeof days === 'string') {
    // Fall back to days parameter (from today forward)
    const daysNum = parseInt(days, 10);
    if (!isNaN(daysNum)) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysNum);

      filter.start = {
        $gte: new Date(),
        $lte: futureDate,
      };
    }
  } else {
    // Default: only future events
    filter.start = { $gte: new Date() };
  }

  // Verified filter
  if (verified !== undefined && typeof verified === 'string') {
    filter.verified = verified === 'true';
  } else if (options.defaultVerified !== undefined) {
    filter.verified = options.defaultVerified;
  }

  return filter;
}
