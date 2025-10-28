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
yarn build                        # Compile TypeScript to dist/ and resolve path aliases

# Testing
yarn test                         # Run unit and integration tests (default)
yarn test:unit                    # Run only unit tests
yarn test:integration             # Run only integration tests
yarn test:e2e                     # Run only E2E tests (parser validation)
yarn test:all                     # Run all tests including E2E
yarn test:watch                   # Run tests in watch mode
yarn coverage                     # Run tests with coverage report
```

**Test Organization:**
- `test/unit/` - Pure logic tests (no DB, no network)
- `test/integration/` - Tests with in-memory DB or mocked network
- `test/e2e/` - Real external API calls (for CI validation)

**Build Process:** The build uses `tsc` to compile TypeScript, then `tsc-alias` to replace path aliases (`@/` → relative paths) so Node.js can run the compiled code. Dev mode uses `tsx` which handles aliases natively.

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

### User Management
```bash
# Promote user to moderator or admin
yarn set-role -e user@example.com -r MODERATOR
yarn set-role -e user@example.com -r ADMIN
yarn set-role -e user@example.com -r USER      # Demote back to regular user

# Production
yarn set-role:prod -e user@example.com -r MODERATOR
```

### Database Maintenance
```bash
# Cleanup duplicate events (uses fuzzy date matching)
yarn cleanup-duplicates --dry-run  # Preview what would be deleted (safe)
yarn cleanup-duplicates            # Remove duplicates and merge manual edits

# Production
yarn cleanup-duplicates:prod --dry-run
yarn cleanup-duplicates:prod
```

**Duplicate Detection Logic:**
- Same `url`, `title`, `city`, `source`
- Start dates within **±3 days** of each other
- Keeps oldest event (by `createdAt`)
- Merges manual edits from newer duplicates before deletion
- Skips `deleted: true` and `fullyManual: true` events

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
import { foo } from '@/utils/bar.js';  // Correct - aliased path
import { foo } from './bar.js';        // Wrong - use aliased paths instead
import { foo } from './bar';           // Wrong - missing .js extension
```

**Import Path Aliases:** ALWAYS use aliased paths with `@/` prefix, never relative paths:
```typescript
// ✅ CORRECT - Aliased imports
import { ProtestEvent } from '@/scraper/scrape-protests.js';
import { connectToDatabase } from '@/db/connection.js';
import delay from '@/utils/delay.js';

// ❌ WRONG - Relative imports (don't use these)
import { ProtestEvent } from './scrape-protests.js';
import { connectToDatabase } from '../../db/connection.js';
import delay from '../utils/delay.js';

// ✅ CORRECT - Use aliased paths instead
import { ProtestEvent } from '@/scraper/scrape-protests.js';
import { connectToDatabase } from '@/db/connection.js';
import delay from '@/utils/delay.js';
```

The `@/` alias maps to the `src/` directory (configured in `tsconfig.json`).

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
│   ├── config/                 # Configuration system
│   │   ├── countries.ts        # ISO country code mappings
│   │   └── locales.ts          # Locale configs (timezone, formats, etc.)
│   ├── sources/                # Scraper sources registry
│   │   ├── registry.ts         # Central source registration
│   │   └── germany/            # German sources
│   │       ├── index.ts        # Exports all German parsers
│   │       ├── berlin.ts       # Berlin Police parser
│   │       ├── dresden.ts      # Dresden City parser
│   │       ├── friedenskooperative.ts  # Friedenskooperative parser
│   │       └── demokrateam.ts  # DemokraTEAM parser
│   ├── utils/                  # Scraper utilities
│   │   ├── date-parser.ts      # Locale-aware date parsing
│   │   └── attendee-parser.ts  # Locale-aware attendee parsing
│   ├── scrape-protests.ts      # Standalone scraper (outputs files)
│   └── import-to-db.ts         # MongoDB import script
├── scripts/                    # CLI utilities
│   └── set-user-role.ts        # Promote/demote user roles
├── routes/                     # Express route handlers
│   ├── admin-users.ts          # Admin-only user management
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
│   ├── robots.ts               # robots.txt compliance checking
│   └── delay.ts                # Rate limiting helper
├── services/
│   ├── email.ts                # Email verification (nodemailer)
│   └── moderation-websocket.ts # WebSocket server for real-time moderation
├── db/
│   └── connection.ts           # MongoDB client & indexes
├── types/                      # TypeScript interfaces
│   ├── protest.ts              # Protest data models
│   └── user.ts                 # User & auth models
├── app.ts                      # Express app factory
└── server.ts                   # HTTP server entry point

test/
├── admin-users.test.ts         # Admin user management API
├── api.test.ts                 # API endpoints (67 tests)
├── scraper/
│   └── scrape-protests.test.ts # Scraper logic (17 tests)
└── utils/
    └── geocode.test.ts         # Location formatting (16 tests)
```

### Scraper Architecture (Internationalization System)

**Registry-Based Multi-Country Support:**

The scraper is architected for easy internationalization with locale-aware parsing:

1. **Configuration Layer** (`src/scraper/config/`):
   - `countries.ts`: ISO 3166-1 alpha-2 country code mappings
   - `locales.ts`: Locale configurations (DE, AT, FR, US) with:
     - Timezone (IANA format)
     - Language tags (BCP 47)
     - Month name mappings (local → numeric)
     - Date format patterns (for dayjs parsing)
     - Number format patterns (approximate, ranges, thousands)

2. **Utilities Layer** (`src/scraper/utils/`):
   - `date-parser.ts`: Generic `parseDate(str, locale)` replaces German-specific parsing
   - `attendee-parser.ts`: Generic `parseAttendees(text, locale, keywords)` with language-specific helpers

3. **Sources Layer** (`src/scraper/sources/`):
   - `registry.ts`: Central source registration with metadata
   - `<country>/`: Organized by country (e.g., `germany/`, `france/`)
   - Each parser imports locale config and uses generic utilities

4. **Entry Points**:
   - `scrape-protests.ts`: File export (CSV/JSON/ICS)
   - `import-to-db.ts`: Database import
   - Both automatically load sources from registry

**Example Flow:**
```
Source Parser (berlin.ts)
  → Get locale: LOCALES['DE']
  → Parse date: parseDate("23. Oktober 2025 14:30", locale)
  → Parse attendees: parseGermanAttendees("ca. 1000 Teilnehmer", locale)
  → Return standardized ProtestEvent[]
```

### Data Flow

**Scraping → Database Import:**
1. `import-to-db.ts` loads enabled sources from registry
2. Each source parser fetches and normalizes data using locale-aware utilities
3. Events deduplicated by `title + start + city + source`
4. `geocode.ts` adds coordinates and formats addresses
5. Database import checks for existing events by `url + start`
6. Skips if `manuallyEdited: true` or `deleted: true`

**CRITICAL: Dresden Source Status Handling**

Dresden events have a two-tier status system that must be handled correctly:

1. **Status "beschieden"** (approved/granted by authorities):
   - `verified: true` → Automatically visible, never in moderation queue
   - Official approval from Dresden city authorities

2. **Status "angemeldet"** (registered but not yet approved):
   - `verified: false` → Still publicly visible, never in moderation queue
   - Event is registered with authorities but pending approval
   - When Dresden re-publishes with "beschieden", scraper updates to `verified: true`

3. **Other statuses** (rejected/cancelled):
   - If event already exists in database → marked as `deleted: true`
   - If new event → skipped (not imported)

**Implementation:**
- `src/scraper/sources/germany/dresden.ts` - `mapDresdenStatus()` function
- Returns `{ verified, shouldDelete }` based on status
- Import logic in `import-to-db.ts` handles `shouldDelete` flag

**CRITICAL: Moderation Queue vs Public View Filtering**

The system distinguishes between scraper-imported and manually submitted events:

**Key Fields:**
- `createdBy` - User ID who created the event (only set for manually submitted events)
- `verified` - Boolean flag for verification status

**Filtering Logic (`src/utils/filter-builder.ts`):**

1. **Moderation Queue** (`verified=false`):
   - Shows ONLY manually submitted unverified events
   - Filter: `{ verified: false, createdBy: { $exists: true } }`
   - Scraper-imported events NEVER appear here (even if `verified: false`)

2. **Public View** (default or `verified=true`):
   - Shows all verified events OR all scraper-imported events
   - Filter: `{ $or: [{ verified: true }, { createdBy: { $exists: false } }] }`
   - Includes unverified scraper events (like Dresden "angemeldet")

**Why This Design:**
- Scraper-imported events are from official sources → always trustworthy
- User-submitted events require manual moderation
- Dresden "angemeldet" events are publicly visible but not yet verified
- Only user-submitted events clog the moderation queue

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

**JWT Token Architecture:**
- **Access Token Expiry**: 15 minutes (hardcoded in `src/utils/jwt.ts`)
- **Refresh Window**: 30 days (tokens can be refreshed within this period)
- **Payload**: `{ userId, email, role, refreshUntil }` where `refreshUntil` is a Unix timestamp
- **Implementation**:
  - Generated via `generateToken(payload)` in `src/utils/jwt.ts` using `jsonwebtoken`
  - Stored in HTTP-only cookies (`auth-token`) for XSS protection
  - Validated via `authenticate` middleware in `src/middleware/auth.ts`
  - Refresh handled by `verifyRefreshToken()` which ignores expiration but checks `refreshUntil` claim
- **Refresh Flow**:
  1. Access token expires after 15 minutes (JWT standard `exp` claim)
  2. Frontend receives 401 error on next API request
  3. `apiRequest()` in frontend automatically calls `POST /api/auth/refresh`
  4. Backend checks if current time < `refreshUntil` (30 days from issue)
  5. If valid, issues new 15-minute token with same `refreshUntil`
  6. Frontend retries original request with new token (from cookie)
  7. If refresh fails (past 30 days), user is logged out

**Email Verification:**
- Registration issues a 6-character short code (not a link). The plain code is sent via `sendVerificationEmail(to, code)` and only a SHA-256 hash is stored in MongoDB (`verificationCodeHash`, `verificationCodeExpires`).
- Users must call `POST /api/auth/verify-email` with `{ email, code }` before they can log in (unless `REQUIRE_EMAIL_VERIFICATION=false`).
- `POST /api/auth/resend-verification` re-issues a new code, resets attempt counters, and enforces a rate limit (3 per 15 minutes by default).
- Failed verification attempts increment `verificationCodeAttempts`; hitting the limit returns HTTP 429 and requires requesting a new code.
- Email templates live in `src/services/email.ts`; HTML and plain-text bodies emphasise copy/paste of the six-character code.

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

### WebSocket Real-Time Moderation

**Architecture:**
- WebSocket server runs on `/ws/moderation` endpoint
- Cookie-based authentication (reads JWT from `auth-token` HTTP-only cookie)
- Only MODERATOR and ADMIN roles can connect
- Singleton service (`ModerationWebSocketService` in `src/services/moderation-websocket.ts`)

**Event Locking System:**
Prevents concurrent editing by multiple moderators:
- When a moderator opens an event for editing, it becomes "locked"
- Server tracks locks in-memory: `Map<eventId, userId>`
- All other connected moderators receive `event_locked` notification
- Lock automatically releases when:
  - Moderator closes the edit modal (`unview_event` message)
  - WebSocket connection closes (browser tab closed)
  - Moderator disconnects

**Message Types:**

*Client → Server:*
- `view_event` - Lock event for editing
- `unview_event` - Release lock
- `event_updated` - Notify others of update
- `event_deleted` - Notify others of deletion
- `request_locks` - Request current lock state (on page mount)
- `ping` - Keep connection alive

*Server → Client:*
- `event_locked` - Event locked by another moderator (includes `{ userId, email }`)
- `event_unlocked` - Event is now available
- `event_updated` - Event was updated, reload data
- `event_deleted` - Event was deleted, remove from list
- `event_created` - New event submitted, update badge count
- `pong` - Ping response

**Implementation Details:**
- Each connection gets unique `clientId`: `{userId}-{timestamp}`
- Locks are per-client, not per-user (same user in different browsers = different clients)
- `broadcastExcept(clientId)` excludes the sender from broadcasts
- `sendCurrentLocks()` sends existing locks to newly connected clients
- Server logs connections/disconnections with moderator email

**Integration Points:**
- `POST /api/protests` broadcasts `event_created` when users submit events
- Frontend connects via singleton `ModerationWebSocketClient` in Header component
- Moderation page registers event handlers and requests locks on mount

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

**Current Data Sources (Germany):**
1. **Berlin Police** (`sources/germany/berlin.ts`): HTML table scraping with postal codes
2. **Dresden City** (`sources/germany/dresden.ts`): JSON API with status-based verification
   - Status "beschieden" (granted) → `verified: true`
   - Status "angemeldet" (registered) → `verified: false`
   - Unknown status (e.g., rejected/cancelled) → `shouldDelete: true`
   - Import script automatically marks events with `shouldDelete: true` as deleted in database
3. **Friedenskooperative** (`sources/germany/friedenskooperative.ts`): POST API + HTML parsing, loops through 5 categories (Demonstration, Vigil, Government Event, Counter-Demo, Blockade)
4. **DemokraTEAM** (`sources/germany/demokrateam.ts`): POST API for 3 months forward, filters by label 4324 (Demo/Protest)

All sources registered in `sources/registry.ts` with metadata (country, city, description).

**Key Utilities:**
- `parseDate(str, locale)`: Generic date parsing with locale-specific formats and month names
  - Returns `ParsedDate` with `date` and `hasTime` flag when `returnDetails: true`
  - Detects time patterns to distinguish "no time" from "midnight"
- `parseAttendees(text, locale, keywords)`: Generic attendee extraction with language-specific patterns
- `parseGermanAttendees()`: Helper for German keywords ("Teilnehmer", "Personen", etc.)
- `isAllowedByRobots(url, userAgent)`: Checks robots.txt compliance using `robots-parser` library
  - Properly handles Allow/Disallow precedence (more specific rules win)
  - 1-hour cache to avoid repeated fetches
  - Allows everything if robots.txt is missing or fetch fails
- `dedupe()`: Removes duplicates by `title.toLowerCase() + start + city + source`
- `withinNextDays()`: Filters events within date range

**Selective Update System:**

The scraper uses a sophisticated field-level tracking system to balance automated updates with manual editorial control.

**Three-Tier Protection Levels:**

1. **Always Update (Source Authority):**
   - `verified` - Status changes from source must propagate
   - `deleted` - Deletion/cancellation from source must be respected
   - These fields update even on manually edited events

2. **Selective Update (Content Protection):**
   - `title`, `location`, `start`, `end`, `attendees`, `categories`, `city`, `country`, `language`
   - Protected once manually edited via `editedFields` array
   - Scraper only updates fields NOT in `editedFields`

3. **Never Update (Editorial Metadata):**
   - `createdBy`, `editedBy`, `createdAt`, `manuallyEdited`, `editedFields`, `fullyManual`
   - Preserved forever, never overwritten by scraper

**Field-Level Tracking:**

When moderator updates an event via `PUT /api/protests/:id`, the endpoint compares old vs new values and tracks changed fields:
```typescript
const editedFields = new Set(existing.editedFields || []);
if (updates.title !== undefined && updates.title !== existing.title) {
  editedFields.add('title');
}
// ... similar for location, start, end, attendees, categories, etc.
```

**Import Logic:**

When scraper re-imports existing event in `import-to-db.ts`:
```typescript
// Skip if fully manual (complete disconnect)
if (existing?.fullyManual) {
  skipped++;
  continue;
}

// Build selective update object
const updateFields: Partial<Protest> = {
  verified: event.verified ?? true,  // Always update
  updatedAt: new Date(),
};

const editedFields = existing.editedFields || [];

// Only update fields NOT in editedFields
if (!editedFields.includes('title')) {
  updateFields.title = event.title;
}
if (!editedFields.includes('location')) {
  updateFields.location = event.location;
}
// ... etc.

// Preserve editorial metadata
updateFields.createdBy = existing.createdBy;
updateFields.editedBy = existing.editedBy;
updateFields.editedFields = existing.editedFields;
updateFields.manuallyEdited = existing.manuallyEdited;
updateFields.fullyManual = existing.fullyManual;
```

**Full Manual Disconnect:**

Moderators can set `fullyManual: true` to completely disconnect an event from the scraper:
- Ignores ALL updates (including status and deletion)
- Use when event data is unreliable or permanently corrected
- Set via `PUT /api/protests/:id` with `fullyManual: true` in payload

**Conflict Detection (Fuzzy Date Matching):**
- Import uses **fuzzy date matching** to detect duplicates
- Matches by: `url` + `title` + `city` + `source` + start date within **±3 days**
- This handles:
  - ✅ **Rescheduled events** (date changed by 1-3 days) → updates existing event
  - ✅ **Recurring events** (7+ days apart) → treated as separate events
- Skips if `deleted: true` (soft delete prevents re-import, unless event comes back from source)
- Updates selectively based on `editedFields` tracking
- Run `yarn cleanup-duplicates` to remove existing duplicates in database

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

### robots.txt Compliance
- **Library**: Uses `robots-parser` (3M+ weekly downloads) for spec-compliant parsing
- **Implementation**: `isAllowedByRobots(url, userAgent)` in `src/utils/robots.ts`
- **Precedence**: Properly handles Allow/Disallow rules (most specific path wins)
- **Caching**: 1-hour TTL to avoid repeated fetches of robots.txt
- **Graceful Degradation**: Allows everything if robots.txt is missing or fetch fails
- **Usage**: All scrapers check robots.txt before fetching data
- **Example**: DemokraTEAM's `/wp-admin/admin-ajax.php` is allowed despite `/wp-admin/` being disallowed

### Date Handling
- **Storage**: UTC `Date` objects in MongoDB
- **API Input**: ISO 8601 strings (e.g., "2025-10-15T14:00:00.000Z")
- **Scraper Parsing**: German formats with `dayjs` in `Europe/Berlin` timezone
- **Time Presence Detection**: `parseDate()` returns `ParsedDate` with `hasTime` flag
  - Detects time patterns (`\d{1,2}[:.]\d{2}`) to distinguish "no time stated" from "midnight"
  - Events without time get `startTimeKnown: false` (display as "TBA" in frontend)
  - Prevents confusion between "starts at midnight" vs "time not specified"
- **Filter Behavior**: `endDate` is inclusive (set to 23:59:59.999 of that day)

### Testing

**Test Organization:**

Tests are organized by type in separate directories:

- **Unit Tests** (`test/unit/`): Pure logic tests with mocked external dependencies
  - Utils: filter-builder, export, robots, JWT
  - Scraper utils: date-parser, attendee-parser
  - **Parser tests with mocked APIs** (uses `axios-mock-adapter`)
    - Example: `test/unit/scraper/sources/germany/dresden.test.ts`
    - Fast, deterministic, test parsing logic in isolation
  - Run with: `yarn test:unit`

- **Integration Tests** (`test/integration/`): Tests with in-memory DB + mocked network
  - API endpoints (API, admin-users) with mongodb-memory-server
  - Geocoding with cached responses
  - Scraper with dedupe/filtering logic
  - Run with: `yarn test:integration`

- **E2E Tests** (`test/e2e/`): Real external API calls for parser validation
  - **Parser tests WITHOUT mocks** - call real external APIs
    - Example: `test/e2e/scraper/sources/germany/dresden.e2e.test.ts`
    - Validates parsers still work against live sources
    - May fail if external service is down or changes structure
  - Used for CI validation (scheduled, not on every commit)
  - NOT run by default with `yarn test` (only with `yarn test:e2e` or `yarn test:all`)
  - Run with: `yarn test:e2e` or `yarn test:all`

**IMPORTANT: Every parser MUST have both test types:**
1. **Unit test** with mocked API responses (in `test/unit/scraper/sources/`)
2. **E2E test** calling the real API (in `test/e2e/scraper/sources/`)

This ensures:
- Fast, reliable tests for development (unit tests with mocks)
- Validation that parsers work with real APIs (E2E tests without mocks)
- Early detection when external APIs change structure (CI runs E2E tests)

**Test Infrastructure:**
- Uses `mongodb-memory-server` for isolated MongoDB instances
- Each test suite creates its own database (no shared state)
- No mocking - real database operations for integration testing
- Rate limiters use 1-second windows in tests (vs 15 min production)
- All tests clean up connections in `afterAll()` hooks

**Running Tests:**
```bash
yarn test              # Unit + integration (default for PR checks)
yarn test:unit         # Only unit tests
yarn test:integration  # Only integration tests
yarn test:e2e          # Only E2E tests (parser validation)
yarn test:all          # All tests including E2E
yarn test:watch        # Watch mode for active development
yarn coverage          # Generate coverage report
```

## Common Development Patterns

### Adding a New Scraper Source

**New Architecture (Internationalization-Ready):**

The scraper uses a registry-based system for easy addition of new sources across countries.

#### For a New Source in an Existing Country (e.g., Germany)

1. Create parser file in `src/scraper/sources/<country>/`:
```typescript
// src/scraper/sources/germany/hamburg.ts
import { ProtestEvent } from '@/scraper/scrape-protests.js';
import { LOCALES } from '@/scraper/config/locales.js';
import { parseDate } from '@/scraper/utils/date-parser.js';
import { parseGermanAttendees } from '@/scraper/utils/attendee-parser.js';

export async function parseHamburgPolice(): Promise<ProtestEvent[]> {
  const locale = LOCALES['DE'];
  const events: ProtestEvent[] = [];

  // Fetch and parse HTML/JSON
  // Use parseDate(dateStr, locale) for dates
  // Use parseGermanAttendees(text, locale) for attendee counts

  return events;
}
```

2. Add export to country index (`src/scraper/sources/germany/index.ts`):
```typescript
export { parseHamburgPolice } from './hamburg.js';
```

3. Add to registry (`src/scraper/sources/registry.ts`):
```typescript
import { parseHamburgPolice } from './germany/index.js';

export const SOURCES: ScraperSource[] = [
  // ... existing sources
  {
    id: 'hamburg-police',
    name: 'Hamburg Police',
    country: 'DE',
    city: 'Hamburg',
    parser: parseHamburgPolice,
    enabled: true,
    description: 'Official assembly registry from Hamburg Police',
  },
];
```

#### For a New Country (e.g., France)

1. Create country directory: `src/scraper/sources/france/`

2. Create parser file:
```typescript
// src/scraper/sources/france/paris.ts
import { ProtestEvent } from '@/scraper/scrape-protests.js';
import { LOCALES } from '@/scraper/config/locales.js';
import { parseDate } from '@/scraper/utils/date-parser.js';
import { parseFrenchAttendees } from '@/scraper/utils/attendee-parser.js';

export async function parseParisPolice(): Promise<ProtestEvent[]> {
  const locale = LOCALES['FR'];  // Uses French config from config/locales.ts
  const events: ProtestEvent[] = [];

  // Use locale-aware utilities
  const date = parseDate(dateStr, locale);  // Handles French date formats
  const attendees = parseFrenchAttendees(text, locale);

  return events;
}
```

3. Create country index (`src/scraper/sources/france/index.ts`)

4. Add to registry with country code 'FR'

5. Test with `yarn scrape` before database import

**Key Benefits:**
- No hardcoded German-specific logic
- Automatic pickup by both `scrape-protests.ts` and `import-to-db.ts`
- Locale-aware date/number parsing
- Clear organization by country

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

### Cleaning Up Duplicate Events

When you discover duplicates in the database (often from date/time changes in sources):

1. **Preview duplicates (safe, no changes):**
   ```bash
   yarn cleanup-duplicates --dry-run
   ```

2. **Review the output:**
   - Shows duplicate groups with their IDs, titles, dates, cities
   - Reports how many would be deleted
   - Shows which duplicates have manual edits that would be merged

3. **Run the cleanup:**
   ```bash
   yarn cleanup-duplicates
   ```

4. **What happens:**
   - Finds duplicates using fuzzy date matching (±3 days)
   - Keeps the oldest event (by `createdAt`)
   - Merges manual edits from newer duplicates into the original
   - Deletes newer duplicates
   - Outputs JSON summary with counts

5. **Production:**
   ```bash
   yarn cleanup-duplicates:prod --dry-run  # Always preview first!
   yarn cleanup-duplicates:prod
   ```

**The script automatically:**
- Skips `deleted: true` events
- Skips `fullyManual: true` events
- Preserves manual edits by merging `editedFields` before deletion
- Uses the same fuzzy matching logic as the import script

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
