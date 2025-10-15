import { ObjectId } from 'mongodb';

export interface GeoLocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface Protest {
  _id?: ObjectId;
  source: string;
  city: string | null;
  country?: string | null; // ISO 3166-1 alpha-2 country code (e.g., "DE", "US")
  title: string;
  start: Date | null;
  end: Date | null;
  language?: string | null; // e.g., "de-DE"
  location: string | null;
  originalLocation?: string | null; // Original location from source (before normalization)
  geoLocation?: GeoLocation; // GeoJSON Point for geospatial queries
  url: string;
  attendees: number | null;
  categories?: string[]; // Event categories (e.g., "Demonstration", "Vigil", "Blockade")
  verified: boolean;
  createdBy?: string; // User ID who created (if manual submission)
  manuallyEdited?: boolean; // Set to true when moderator/admin edits via API
  deleted?: boolean; // Soft delete flag - prevents scraper from re-importing
  createdAt: Date;
  updatedAt: Date;
}

export interface ProtestInput {
  source?: string;
  city?: string | null;
  country?: string | null; // ISO 3166-1 alpha-2 country code (e.g., "DE", "US")
  title: string;
  start?: Date | null;
  end?: Date | null;
  language?: string | null; // e.g., "de-DE"
  location?: string | null;
  url?: string;
  attendees?: number | null;
}

export interface ProtestUpdateInput {
  city?: string | null;
  country?: string | null; // ISO 3166-1 alpha-2 country code (e.g., "DE", "US")
  title?: string;
  start?: Date | null;
  end?: Date | null;
  language?: string | null;
  location?: string | null;
  url?: string;
  attendees?: number | null;
  verified?: boolean;
}

export interface ProtestQueryFilters {
  source?: string;
  city?: string;
  country?: string; // ISO 3166-1 alpha-2 country code (e.g., "DE", "US")
  language?: string; // e.g., "de-DE"
  search?: string; // full-text search in title (case-insensitive partial match)
  days?: string; // number of days from now to filter (query param is string)
  startDate?: string; // ISO 8601 date string (e.g., "2025-10-15") - filter start >= this date
  endDate?: string; // ISO 8601 date string (e.g., "2025-10-30") - filter start <= this date
  verified?: string; // boolean as string (query param is string)
  limit?: string; // query param is always string
  skip?: string; // query param is always string
  lat?: string; // latitude for geolocation search (query param is string)
  lon?: string; // longitude for geolocation search (query param is string)
  radius?: string; // radius in kilometers for geolocation search (query param is string)
}
