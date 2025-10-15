# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collaborative open-source REST API service for collecting and sharing upcoming protests and demonstrations. Supports both automated scraping and manual user submissions via JWT-secured endpoints. The service is internationalized with country codes (ISO 3166-1 alpha-2) to support protests beyond Germany.

**Tech Stack:**
- Backend: Node.js with Express (ESM modules)
- Database: MongoDB (native driver, no ORM)
- Authentication: JWT (JSON Web Token)
- Build: TypeScript with strict mode
- Testing: Vitest with in-memory MongoDB
- Deployment: Docker + Docker Compose
- Package Manager: **Yarn** (not npm)

## Commands

### Development
```bash
# First time setup
cp .env.example .env
docker compose up -d              # Start MongoDB
yarn install                      # Install dependencies (use yarn, not npm)
yarn dev                          # Start dev server with watch mode

# Building
yarn build                        # Compile TypeScript to dist/

# Testing
yarn test                         # Run all tests once
yarn test:watch                   # Run tests in watch mode
```

### Scraper Commands
```bash
# Import protests to database (preferred method)
yarn import                       # Dev mode: import next 40 days
yarn import -- --days 60          # Dev mode: import next 60 days
yarn import:prod --days 60        # Production: import next 60 days

# Standalone file export (CSV/JSON/ICS)
yarn scrape                       # Dev mode: export to files
yarn scrape:prod --days 90        # Production: export to files
```

### Docker
```bash
docker compose up -d --build      # Build and start all services
docker compose logs api           # View API logs
docker compose logs mongodb       # View MongoDB logs
docker compose down               # Stop all services
```

**Important:** This project uses **Yarn**, not npm. All package management must use `yarn` commands. The Dockerfile is configured for yarn.

## Architecture

### Module System & CLI Patterns

**ESM Modules:** The project uses `"type": "module"` in package.json. All imports must use `.js` extensions even for TypeScript files:
```typescript
import { foo } from './bar.js';  // Correct
import { foo } from './bar';     // Wrong
```

**CLI Script Pattern:** For scripts that can be both imported as modules and run directly (like `scrape-protests.ts`), wrap the CLI execution in:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  // CLI setup and execution only when run directly
  program.option('--days <n>', 'description', 'default').parse(process.argv);
  // ... main execution
}
```
This prevents CLI setup from running when the file is imported as a module (avoiding commander conflicts).

### Database Layer

**Connection Management:**
- `connectToDatabase()`: Establishes connection and creates indexes (idempotent, safe to call multiple times)
- `getDatabase()`: Returns existing connection (throws if not initialized)
- `closeConnection()`: Closes connection gracefully

**Index Strategy:**
All indexes are created automatically on startup in `src/db/connection.ts`:
- `protests` collection: city, country, start, verified, source, language, city+start composite, 2dsphere geospatial
- `users` collection: email (unique)

**No Migrations:** Schema changes are handled via automatic index creation. There is no migration system.

### Authentication Flow

**Three-tier RBAC:**
1. **USER**: Submit protests (require verification), read public data
2. **MODERATOR**: Submit auto-verified protests, edit any protest
3. **ADMIN**: Full permissions (add, edit, delete, manage users)

**JWT Implementation:**
- Tokens contain: `userId`, `email`, `role`
- Validated via `authenticate` middleware in `src/middleware/auth.ts`
- Role-based access via `authorize(UserRole.MODERATOR, UserRole.ADMIN)` middleware

**Password Security:**
- Hashed with bcrypt before storage (see `src/utils/password.ts`)
- Never store plaintext passwords
- JWT secret must be in `.env` file

### API Architecture

**Route Structure:**
```
src/
├── app.ts                    # Express app factory (routes, middleware)
├── server.ts                 # Entry point (connects DB, starts server)
├── routes/
│   ├── auth.ts              # POST /api/auth/{register,login}
│   ├── protests.ts          # CRUD /api/protests
│   └── export.ts            # GET /api/export/{csv,json,ics}
├── middleware/
│   ├── auth.ts              # JWT validation + role checking
│   └── errorHandler.ts      # Global error handler
└── types/
    ├── user.ts              # User, UserRole
    └── protest.ts           # Protest, ProtestInput, ProtestQueryFilters
```

**Query Parameter Types:**
Express query parameters are always `string | undefined`, not `number` or `boolean`. Type definitions in `src/types/protest.ts` reflect this:
```typescript
interface ProtestQueryFilters {
  city?: string;
  days?: string;      // Not number!
  verified?: string;  // Not boolean!
  limit?: string;     // Not number!
}
```
Parse strings to numbers/booleans in route handlers.

### Scraper Architecture

**Dual-Mode Operation:**
1. **File Export Mode** (`scrape-protests.ts`): Scrapes to CSV/JSON/ICS files (legacy, standalone)
2. **Database Import Mode** (`import-to-db.ts`): Scrapes and imports directly to MongoDB (preferred)

**Import Logic (`import-to-db.ts`):**
- Checks for existing protests by URL + start date
- Skips if `manuallyEdited: true` or `deleted: true` (prevents overwriting manual changes)
- Updates existing protests only if not manually modified
- Inserts new protests as verified

**Scraper Sources:**
- `parseBerlin()`: HTML table parsing from Berlin police
- `parseDresden()`: JSON API from Dresden city
- `parseFriedenskooperative()`: AJAX POST + HTML parsing with category filtering
- `parseDemokrateam()`: AJAX POST + HTML parsing with label filtering

**Key Functions:**
- `parseGermanDate()`: Handles multiple German date formats (DD.MM.YYYY, DD.MM HH:mm, etc.)
- `parseAttendees()`: Extracts attendee numbers from German text patterns
- `dedupe()`: Removes duplicates by title+start+city+source
- `withinNextDays()`: Filters events within date range

### Geocoding System

**Two-Stage Fallback:**
1. Try full address geocoding (street, postal code, city)
2. If fails, retry with just "city, country" using country code mapping

**Implementation:**
- `src/utils/geocode.ts`: Shared geocoding utility with Nominatim API
- `src/scraper/scrape-protests.ts`: Local geocoding functions for file export
- Both implement the same fallback pattern with `COUNTRY_NAMES` mapping

**Country Code Mapping:**
```typescript
const COUNTRY_NAMES: Record<string, string> = {
  'DE': 'Germany',
  'AT': 'Austria',
  // ISO 3166-1 alpha-2 -> full name
};
```

**Caching:**
- Geocoded results cached to `geocode-cache.json`
- Cache key is the full location string
- Rate limit: 1 request per second (Nominatim requirement)

### Data Model

**Protest Schema:**
```typescript
interface Protest {
  _id?: ObjectId;
  source: string;              // Data source URL
  city: string | null;
  country?: string | null;     // ISO 3166-1 alpha-2 (e.g., "DE", "AT")
  title: string;
  start: Date | null;
  end: Date | null;
  language?: string | null;    // e.g., "de-DE"
  location: string | null;     // Normalized address from geocoding
  originalLocation?: string | null;  // Original location before normalization
  geoLocation?: GeoLocation;   // GeoJSON Point [lon, lat] for geospatial queries
  url: string;
  attendees: number | null;
  categories?: string[];       // e.g., ["Demonstration", "Vigil"]
  verified: boolean;
  createdBy?: string;          // User ID (if manual submission)
  manuallyEdited?: boolean;    // Prevents scraper overwrites
  deleted?: boolean;           // Soft delete flag
  createdAt: Date;
  updatedAt: Date;
}
```

**Geospatial Queries:**
GeoJSON format with 2dsphere index:
```typescript
geoLocation: {
  type: 'Point',
  coordinates: [longitude, latitude]  // [lon, lat] order!
}
```

Query pattern for "protests near me":
```typescript
{
  geoLocation: {
    $geoWithin: {
      $centerSphere: [[lon, lat], radiusKm / 6378.1]
    }
  }
}
```

### Export System

**Three formats supported:**
- CSV: Comma-separated values
- JSON: Array of protest objects
- ICS: iCalendar format (subscribable in calendar apps)

**ICS Enhancements:**
- Geographic coordinates embedded (`GEO` property)
- Categories for filtering: city, source, event type
- Supports calendar subscription URLs with filters

**Filter Parameters (all endpoints):**
- `city`, `source`, `country`, `language`: String filters
- `days`: Number of days forward from today
- `verified`: Show only verified protests (default: true)
- `lat`, `lon`, `radius`: Geolocation search (radius in km)
- `limit`, `skip`: Pagination

## Key Development Patterns

### Testing
- Tests use `mongodb-memory-server` for isolated MongoDB instances
- Each test suite creates its own database
- No mocking - real database operations
- Test utilities in test files handle setup/teardown

### Error Handling
- Global error handler in `src/middleware/errorHandler.ts`
- Express async errors caught automatically
- Scraper errors logged to stderr, don't stop other sources

### TypeScript Configuration
- Strict mode enabled
- ES2022 target with ESNext modules
- `moduleResolution: bundler` (Node.js 18+ feature)
- `rootDir: ./src`, `outDir: ./dist`

### Docker Best Practices
- `.dockerignore`: Excludes output files (protests.json, geocode-cache.json) but allows tsconfig.json and package files
- Multi-stage build: builder stage compiles TS, production stage copies dist/
- Uses yarn, not npm
- No `version` key in docker-compose.yml (obsolete)

## Important Notes

**Scraper Conflict Protection:**
- `manuallyEdited: true` flag prevents scraper overwrites
- `deleted: true` flag prevents re-importing deleted events
- Always check these flags before updating existing protests

**Internationalization:**
- Country codes are ISO 3166-1 alpha-2 format
- Service is not limited to Germany - add country-specific scrapers as needed
- Geocoding fallback uses country names mapped from codes

**Rate Limits:**
- Nominatim geocoding: 1 request per second
- Respect source websites' rate limits (delays built into scrapers)

**Environment Variables:**
Required in `.env`:
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret for JWT signing
- `JWT_EXPIRES_IN`: Token expiration (e.g., "7d")
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: development/production
