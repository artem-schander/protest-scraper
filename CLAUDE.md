# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collaborative open-source REST API service for collecting and sharing upcoming protests and demonstrations across Germany. The service supports both automated scraping integration and manual user submissions via JWT-secured endpoints.

**Tech Stack:**
- Backend: Node.js with Express (ESM modules)
- Database: MongoDB (native driver, no ORM)
- Authentication: JWT (JSON Web Token) + OAuth (Google, Apple)
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
npx vitest test/api.test.ts       # Run specific test file
```

### Scraper Operations
```bash
# Import protests to database (preferred method)
yarn import                       # Dev mode: import next 40 days
yarn import -- --days 90          # Dev mode: custom date range
yarn import:prod --days 360       # Production: import next 360 days

# Standalone file export (CSV/JSON/ICS - legacy)
yarn scrape                       # Dev mode: export to output/ folder
yarn scrape:prod --days 90        # Production: export to files
```

### Docker
```bash
docker compose up -d --build      # Build and start all services
docker compose logs api           # View API logs
docker build .                    # Test Docker build
```

**Important:** This project uses **Yarn**, not npm. All package management must use `yarn` commands.

## Architecture

### Module System

**ESM Modules:** The project uses `"type": "module"` in package.json. All imports must use `.js` extensions even for TypeScript files:
```typescript
import { foo } from './bar.js';  // Correct
import { foo } from './bar';     // Wrong - will fail at runtime
```

**CLI Script Pattern:** Scripts that can be both imported and run directly wrap execution in:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  // CLI setup only when run directly
  program.option('--days <n>', 'description', 'default').parse(process.argv);
}
```
This prevents CLI setup from running when the file is imported (avoiding commander conflicts).

### Directory Structure

```
src/
├── scraper/                    # Data scraping & import
│   ├── scrape-protests.ts      # Standalone scraper (outputs files)
│   └── import-to-db.ts         # MongoDB import script
├── routes/                     # Express route handlers
│   ├── auth.ts                 # Authentication (/api/auth/*)
│   ├── protests.ts             # Protest CRUD (/api/protests/*)
│   └── export.ts               # Exports (/api/export/*)
├── middleware/                 # Express middleware
│   ├── auth.ts                 # JWT verification & RBAC
│   └── errorHandler.ts         # Global error handling
├── utils/                      # Utilities
│   ├── geocode.ts              # Geocoding & address formatting
│   ├── filter-builder.ts       # MongoDB query builder
│   ├── jwt.ts                  # JWT token generation
│   ├── password.ts             # bcrypt hashing
│   ├── export.ts               # CSV/JSON/ICS generation
│   └── delay.ts                # Rate limiting helper
├── services/
│   └── email.ts                # Email verification (nodemailer)
├── db/
│   └── connection.ts           # MongoDB client & indexes
├── types/                      # TypeScript interfaces
│   ├── protest.ts              # Protest data models
│   └── user.ts                 # User & auth models
├── app.ts                      # Express app factory
└── server.ts                   # HTTP server entry point

test/
├── api.test.ts                 # API endpoints (67 tests)
├── scraper/
│   └── scrape-protests.test.ts # Scraper logic (17 tests)
└── utils/
    └── geocode.test.ts         # Location formatting (16 tests)
```

### Data Flow

**Scraping → Database Import:**
1. `import-to-db.ts` calls scraper functions from `scrape-protests.ts`
2. Each parser fetches from source, normalizes dates/locations
3. Events deduplicated by `title + start + city + source`
4. `geocode.ts` adds coordinates and formats addresses
5. Database import checks for existing events by `url + start`
6. Skips if `manuallyEdited: true` or `deleted: true`

**API Request Flow:**
1. Request → Express router
2. `authenticate` middleware validates JWT (protected routes only)
3. `authorize(role)` middleware checks permissions
4. `buildProtestFilter()` constructs MongoDB query from request params
5. Database query executes with geospatial/text indexes
6. Response formatted or `errorHandler` catches errors

### Authentication Architecture

**Three-tier Role-Based Access Control:**
- **USER**: Submit protests (require manual verification), read public data
- **MODERATOR**: Submit auto-verified protests, edit any protest
- **ADMIN**: Full permissions (create, edit, delete)

**JWT Implementation:**
- Payload: `{ userId, email, role }`
- Generated in `src/utils/jwt.ts` using `jsonwebtoken`
- Validated via `authenticate` middleware in `src/middleware/auth.ts`
- Default expiry: 7 days (configurable via `JWT_EXPIRES_IN`)

**OAuth Providers:**
- Google OAuth 2.0 with PKCE (Proof Key for Code Exchange)
- Apple Sign In with private key authentication
- Both use `arctic` library for OAuth flow
- State tokens stored in-memory Map (production should use Redis)
- Auto-creates user from OAuth account, links by email

**Email Verification:**
- Uses `nodemailer` for SMTP delivery
- 24-hour token expiry
- Gracefully degrades when email config missing (dev mode)
- Welcome email sent after verification

### Location Data Architecture

**Three location representations:**

1. **`originalLocation`** (optional): Raw scraped location from source
   - Example: `"10557 Berlin, Paul-Löbe-Allee 1"`
   - Preserved for reference, not used for geocoding

2. **`location`** (required): User-friendly formatted address
   - Example: `"10557 Berlin, Mitte, Tiergarten, Paul-Löbe-Allee"`
   - Generated by `formatLocationDetails()` from Nominatim `display_name`
   - Used for display in API responses

3. **`geoLocation`** (optional): GeoJSON Point for geospatial queries
   - Format: `{ type: 'Point', coordinates: [longitude, latitude] }`
   - Enables "protests near me" feature with 2dsphere index

**Geocoding Flow:**
```
Source Data → originalLocation preserved
            → Nominatim API call
            → display_name (verbose) → formatLocationDetails() → location (formatted)
            → lat/lon → geoLocation (GeoJSON Point)
```

**Address Formatting:**
The `formatLocationDetails()` function transforms verbose Nominatim addresses:
- Input: `"Am Treptower Park, Plänterwald, Treptow-Köpenick, Berlin, 12435, Deutschland"`
- Output: `"12435 Berlin, Treptow-Köpenick, Plänterwald, Am Treptower Park"`

Algorithm:
1. Reverse comma-separated parts (country becomes first)
2. Remove country
3. Detect postal code with regex (supports DE, AT, CH, FR, NL, UK, PL formats)
4. Combine postal code with city
5. Join remaining parts with commas

### Database Layer

**Connection Management:**
- `connectToDatabase()`: Establishes connection and creates indexes (idempotent)
- `getDatabase()`: Returns existing connection (throws if not initialized)
- `closeConnection()`: Closes connection gracefully

**Index Strategy:**
All indexes created automatically on startup in `src/db/connection.ts`:
- `protests`: city, country, start, verified, source, language, city+start composite, **2dsphere geospatial** on `geoLocation`
- `users`: email (unique)

**No Migrations:** Schema changes handled via automatic index creation. MongoDB is schemaless.

### Scraper Architecture

**Dual-Mode Operation:**
1. **File Export** (`yarn scrape`): Outputs CSV/JSON/ICS files to `output/` folder (legacy, standalone)
2. **Database Import** (`yarn import`): Scrapes and imports directly to MongoDB (preferred)

**Four Data Sources:**
1. **Berlin Police** (`parseBerlin`): HTML table scraping with postal codes
2. **Dresden City** (`parseDresden`): JSON API
3. **Friedenskooperative** (`parseFriedenskooperative`): POST API + HTML parsing, loops through 5 categories (Demonstration, Vigil, Government Event, Counter-Demo, Blockade)
4. **DemokraTEAM** (`parseDemokrateam`): POST API for 3 months forward, filters by label 4324 (Demo/Protest)

**Key Functions:**
- `parseGermanDate()`: Handles DD.MM.YYYY, DD.MM HH:mm, DD. MM HH:mm YYYY, etc.
- `parseAttendees()`: Extracts numbers from German text ("ca. 1000 Teilnehmer", "5000-10000 Personen")
- `dedupe()`: Removes duplicates by `title.toLowerCase() + start + city + source`
- `withinNextDays()`: Filters events within date range

**Conflict Prevention:**
- Import checks existing by `url + start`
- Skips update if `manuallyEdited: true` (set when moderator edits via PUT)
- Skips update if `deleted: true` (soft delete prevents re-import)

### API Query System

**Query Parameters are Always Strings:**
Express query params are `string | undefined`, not typed. Type definitions reflect this:
```typescript
interface ProtestQueryFilters {
  city?: string;
  days?: string;      // Not number!
  verified?: string;  // Not boolean!
  limit?: string;
}
```

**Filter Priority:**
- Date: explicit `startDate`/`endDate` → `days` → default (future events only)
- Location: geolocation (`lat`/`lon` with radius) → exact `city` match
- Search is case-insensitive regex with special character escaping

**Geospatial Queries:**
Uses `$geoWithin` + `$centerSphere` (not `$near`) for sorting compatibility:
```typescript
geoLocation: {
  $geoWithin: {
    $centerSphere: [[longitude, latitude], radiusKm / 6378.1]
  }
}
```
Earth radius: 6378.1 km (for radians conversion)

### Export System

**Three Formats:**
- **CSV**: Comma-separated values with quoted fields
- **JSON**: Array of protest objects
- **ICS**: iCalendar format (subscribable in Google Calendar, Apple Calendar, etc.)

**ICS Calendar Features:**
- Geographic coordinates embedded (GEO property)
- Categories: city, source, country, event type (e.g., "Demonstration", "Vigil")
- Supports subscription URLs with filters (e.g., `/api/export/ics?city=Berlin&days=90`)

## Important Implementation Details

### Geocoding
- **Provider**: OpenStreetMap Nominatim (free, no API key required)
- **Rate Limit**: 1 request per second (production), 100ms in dev
- **Caching**: Results cached to `cache/geocode.json` (file-based)
- **Fallback Strategy**: If detailed address fails, retry with "city, country"
- **Country Mapping**: ISO 3166-1 alpha-2 codes → full names (e.g., "DE" → "Germany")

### Date Handling
- **Storage**: UTC `Date` objects in MongoDB
- **API Input**: ISO 8601 strings (e.g., "2025-10-15T14:00:00.000Z")
- **Scraper Parsing**: German formats with `dayjs` in `Europe/Berlin` timezone
- **Filter Behavior**: `endDate` is inclusive (set to 23:59:59.999 of that day)

### Testing
- Uses `mongodb-memory-server` for isolated MongoDB instances
- Each test suite creates its own database (no shared state)
- No mocking - real database operations for integration testing
- Rate limiters use 1-second windows in tests (vs 15 min production)
- All tests clean up connections in `afterAll()` hooks

## Common Development Patterns

### Adding a New Scraper Source

1. Create parser function in `src/scraper/scrape-protests.ts`:
```typescript
export async function parseNewSource(): Promise<ProtestEvent[]> {
  const events: ProtestEvent[] = [];
  // Fetch and parse HTML/JSON
  // Use parseGermanDate() for dates
  // Use parseAttendees() for attendee counts
  return events;
}
```

2. Add to `sources` array in **both** files:
   - `src/scraper/scrape-protests.ts` (line ~933)
   - `src/scraper/import-to-db.ts` (line ~45)

3. Test with `yarn scrape` before database import

### Adding a New API Filter

1. Add field to `ProtestQueryFilters` in `src/types/protest.ts`
2. Update `buildProtestFilter()` in `src/utils/filter-builder.ts`
3. Add database index in `src/db/connection.ts:initializeIndexes()` if needed
4. Add tests to `test/api.test.ts`
5. Update README documentation

### Modifying Database Schema

1. Update TypeScript interface in `src/types/protest.ts` or `src/types/user.ts`
2. Update indexes in `src/db/connection.ts` if adding indexed fields
3. No migrations needed - MongoDB is schemaless
4. Existing documents will coexist (add null checks for new optional fields)

## Environment Variables

**Required:**
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT signing

**Optional (Email):**
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`
- OR `SENDGRID_API_KEY` for SendGrid integration

**Optional (OAuth):**
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Apple: `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_PATH`, `APPLE_REDIRECT_URI`

**Optional (Production):**
- `NODE_ENV=production` - Enables production OAuth redirect to frontend
- `FRONTEND_URL` - Frontend domain for OAuth redirects
- `REQUIRE_EMAIL_VERIFICATION=true` - Enforce email verification at login
- `JWT_EXPIRES_IN` - Token expiry (default: "7d")

## Important Notes

**Scraper Conflict Protection:**
- `manuallyEdited: true` prevents scraper from overwriting manual edits
- `deleted: true` prevents re-importing deleted events (soft delete)
- Always check these flags before updating existing protests

**Rate Limits:**
- Authentication endpoints: 5/15min (register), 10/15min (login), 3/15min (resend verification)
- Nominatim geocoding: 1 request per second (enforced with delays)
- Respect source websites' rate limits (delays built into scrapers)

**TypeScript Configuration:**
- Strict mode enabled
- ES2022 target with ESNext modules
- `moduleResolution: bundler` (Node.js 18+ feature)
- Always use `.js` extensions in imports
