import { ObjectId } from 'mongodb';

export interface GeoLocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface Protest {
  _id?: ObjectId;
  source: string;
  city: string | null;
  title: string;
  start: Date | null;
  end: Date | null;
  location: string | null;
  geoLocation?: GeoLocation; // GeoJSON Point for geospatial queries
  url: string;
  attendees: number | null;
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
  title: string;
  start?: Date | null;
  end?: Date | null;
  location?: string | null;
  url?: string;
  attendees?: number | null;
}

export interface ProtestUpdateInput {
  city?: string | null;
  title?: string;
  start?: Date | null;
  end?: Date | null;
  location?: string | null;
  url?: string;
  attendees?: number | null;
  verified?: boolean;
}

export interface ProtestQueryFilters {
  city?: string;
  days?: number; // number of days from now to filter
  verified?: boolean;
  limit?: number;
  skip?: number;
  lat?: number; // latitude for geolocation search
  lon?: number; // longitude for geolocation search
  radius?: number; // radius in kilometers for geolocation search
}
