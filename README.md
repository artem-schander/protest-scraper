# 🪧 Protest Scraper API

[![Tests](https://github.com/artem-schander/protest-scraper/actions/workflows/test.yml/badge.svg)](https://github.com/artem-schander/protest-scraper/actions/workflows/test.yml)
[![E2E Tests](https://github.com/artem-schander/protest-scraper/actions/workflows/e2e.yml/badge.svg)](https://github.com/artem-schander/protest-scraper/actions/workflows/e2e.yml)
[![codecov](https://codecov.io/gh/artem-schander/protest-scraper/branch/main/graph/badge.svg)](https://codecov.io/gh/artem-schander/protest-scraper)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.18.1-brightgreen)](https://nodejs.org/)

**🌐 Production Service:** [API](https://scraper.protest-listing.com) | [Web App](https://protest-listing.com)

**A collaborative open-source listing service to collect and share upcoming protests and demonstrations.**
Built with **Node.js**, **Express**, and **MongoDB**, designed to support both **automatic scraping** and **manual user submissions** via JWT-secured REST API.

> **✅ Fully Functional**
> The scraper component and REST API are fully implemented. You can deploy the service using Docker Compose. See the [Roadmap](#-roadmap--progress) for future enhancements.

> **🎨 Frontend Available**
> A fully-featured [SvelteKit frontend](https://github.com/artem-schander/protest-scraper-frontend) is available with map-based filtering, i18n (EN/DE), and calendar exports.

## 📚 Documentation

- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute to this project
- **[Code of Conduct](CODE_OF_CONDUCT.md)** - Community guidelines and standards
- **[API Documentation](#-api-overview)** - REST API endpoints and usage
- **[Issue Templates](.github/ISSUE_TEMPLATE/)** - Bug reports, feature requests, new data sources

---

## 🚀 Features

- **Automated scraping** of official protest data from different sources
- Public REST API for upcoming protests (filter by city or date range)
- JWT-based authentication with **6-character email verification codes**
- Role system (`USER`, `MODERATOR`, `ADMIN`)
- Admin & Moderator routes for verifying, editing, or deleting entries
- **Automatic cleanup** of old protests (deleted 2 weeks after event date)
- Integration-ready with automated scrapers (import endpoint)
- Dockerized setup with MongoDB
- Comprehensive test suite with Vitest

---

## 🧩 Tech Stack

| Component | Tool |
|------------|------|
| Backend | Node.js (Express) |
| Database | MongoDB (native driver) |
| Auth | JWT (JSON Web Token) |
| Deployment | Docker + Docker Compose |

---

## 🧰 Setup

### Prerequisites
- Node.js ≥ 20.18.1
- Docker & Docker Compose

### Installation

```bash
git clone https://github.com/artem-schander/protest-scraper.git
cd protest-scraper/scraper
yarn install
cp .env.example .env
# Edit .env and set MONGODB_URI, JWT_SECRET, EMAIL_* credentials
docker compose up -d
```

### Running in Dev Mode

```bash
yarn dev
```

### Importing Protest Data

The scraper fetches protests from official sources and imports them directly into MongoDB:

```bash
yarn import                    # Import protests (default: next 40 days)
yarn import -- --days 60       # Import protests for next 60 days
```

This command:
1. Scrapes protests from different sources
2. Deduplicates events
3. Imports them to MongoDB as verified protests
4. Updates existing events (unless manually edited or deleted)

**Conflict Protection:** The scraper respects manual changes:
- Events edited via API (PUT) are marked as `manuallyEdited: true` and won't be overwritten
- Events deleted via API (DELETE) are soft-deleted (`deleted: true`) and won't be re-imported
- This prevents losing manual corrections when the scraper runs again

**Automatic Cleanup:** Old protests are automatically deleted from the database:
- MongoDB TTL index removes protests **2 weeks after the event date**
- Keeps database size manageable without manual maintenance
- Background cleanup runs automatically every 60 seconds

**Legacy File Export:** The original scraper (`npm run scrape`) still creates CSV/JSON/ICS files if needed. See [Scraper Standalone Usage](#-scraper-standalone-usage) below.

### Running Tests

```bash
yarn test              # Run unit + integration tests (default)
yarn test:unit         # Only unit tests (mocked dependencies)
yarn test:integration  # Only integration tests (in-memory DB)
yarn test:e2e          # Only E2E tests (real external API calls)
yarn test:all          # All tests including E2E
yarn test:watch        # Watch mode for development
yarn coverage          # Generate coverage report
```

**Test Organization:**
- **Unit tests** (`test/unit/`) - Mocked external dependencies, fast
- **Integration tests** (`test/integration/`) - In-memory DB, mocked network
- **E2E tests** (`test/e2e/`) - Real API calls, validates parsers still work

**IMPORTANT:** Every scraper parser MUST have both:
1. Unit test with mocked API (fast, deterministic)
2. E2E test with real API (validates against live source)

Example:
- `test/unit/scraper/sources/germany/dresden.test.ts` (mocked)
- `test/e2e/scraper/sources/germany/dresden.e2e.test.ts` (real API)

This ensures reliable development (unit) and early detection of upstream changes (E2E in CI).

### Running in Production

```bash
yarn build
docker compose up -d --build
```

---

## 🔄 CI/CD & GitHub Actions

Automated testing workflows are configured in `.github/workflows/`:

### Continuous Integration
**Runs on:** Every push/PR to `main` branch
- ✅ Unit tests (mocked dependencies)
- ✅ Integration tests (in-memory DB)
- ❌ **Blocks deployment** if tests fail

**Setup:** Enable branch protection for `main` and require the "Test Gate" check to pass.

### Nightly E2E Tests
**Runs on:** 2 AM UTC daily (cron schedule)
- 🌐 Tests parsers against **real external APIs**
- 🔍 Detects when upstream sources change
- 📝 **Auto-creates GitHub issue** on failure

**Manual trigger:** Go to Actions tab → E2E Tests → Run workflow

See [`.github/workflows/README.md`](.github/workflows/README.md) for setup instructions and customization.

---

## 📚 API Overview

### Authentication Endpoints

| Method | Endpoint | Rate Limit | Description |
|--------|----------|------------|-------------|
| `POST` | `/api/auth/register` | 5/15min | Register new user (sends 6-character code) |
| `POST` | `/api/auth/login` | 10/15min | Obtain JWT token (requires verified email) |
| `POST` | `/api/auth/verify-email` | 10/15min | Submit `{ email, code }` to mark email verified |
| `POST` | `/api/auth/resend-verification` | 3/15min | Resend verification code |
| `GET` | `/api/auth/google` | - | Initiate Google OAuth flow |
| `GET` | `/api/auth/google/callback` | - | Google OAuth callback |
| `GET` | `/api/auth/apple` | - | Initiate Apple OAuth flow |
| `GET` | `/api/auth/apple/callback` | - | Apple OAuth callback |

### Protest & Export Endpoints

| Method | Endpoint | Auth | Description |
|--------|-----------|------|-------------|
| `GET` | `/api/protests` | Optional | List protests (filter by `?city=Berlin&days=40`) |
| `POST` | `/api/protests` | ✅ | Add new protest |
| `PUT` | `/api/protests/:id` | MODERATOR / ADMIN | Edit protest |
| `DELETE` | `/api/protests/:id` | ADMIN | Delete protest |
| `GET` | `/api/export/csv` | - | Export protests as CSV (supports filters) |
| `GET` | `/api/export/json` | - | Export protests as JSON (supports filters) |
| `GET` | `/api/export/ics` | - | Export as iCalendar - **subscribable!** (supports filters) |

### API Examples

#### Register a new user

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

Response:
```json
{
  "message": "Registration successful. Enter the verification code sent to your email address.",
  "requiresVerification": true,
  "email": "user@example.com"
}
```

#### Verify the email

```bash
curl -X POST http://localhost:3000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "code": "AB42QH"
  }'
```

Response:
```json
{
  "message": "Email verified successfully.",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "role": "USER",
    "emailVerified": true
  }
}
```

If the code is incorrect or expired, the API returns HTTP 400/410 with guidance on requesting a new code. After too many wrong attempts the server responds with HTTP 429 until `/api/auth/resend-verification` is called.

#### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

Response:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "role": "USER",
    "emailVerified": true
  }
}
```

Unverified accounts receive HTTP 403:
```json
{
  "error": "Email not verified. Please enter the verification code that was sent to you.",
  "requiresVerification": true,
  "emailVerified": false
}
```

#### List protests (public)

```bash
# All upcoming verified protests
curl http://localhost:3000/api/protests

# Filter by city
curl "http://localhost:3000/api/protests?city=Berlin"

# Filter by country (ISO 3166-1 alpha-2 code)
curl "http://localhost:3000/api/protests?country=DE"

# Filter by data source
curl "http://localhost:3000/api/protests?source=www.berlin.de"

# Filter by language
curl "http://localhost:3000/api/protests?language=de-DE"

# Search for protests with "climate" in the title
curl "http://localhost:3000/api/protests?search=climate"

# Search for "democracy" or "Demokratie" (case-insensitive)
curl "http://localhost:3000/api/protests?search=demokratie"

# Filter by date range (relative - next 30 days from today)
curl "http://localhost:3000/api/protests?days=30"

# Filter by explicit date range (absolute dates)
curl "http://localhost:3000/api/protests?startDate=2025-10-15&endDate=2025-10-31"

# Filter by start date only (all events from October 15 forward)
curl "http://localhost:3000/api/protests?startDate=2025-10-15"

# Geolocation search - "Protests near me"
# Find protests within 50km of Berlin (lat: 52.52, lon: 13.405)
curl "http://localhost:3000/api/protests?lat=52.52&lon=13.405&radius=50"

# Combined filters with pagination
curl "http://localhost:3000/api/protests?city=Berlin&days=30&limit=20&skip=0"

# Complex filter: German protests in Berlin for October 2025
curl "http://localhost:3000/api/protests?city=Berlin&country=DE&language=de-DE&startDate=2025-10-01&endDate=2025-10-31"

# Search for climate protests in Germany
curl "http://localhost:3000/api/protests?search=climate&country=DE"
```

Response:
```json
{
  "protests": [
    {
      "id": "507f1f77bcf86cd799439012",
      "source": "www.berlin.de",
      "city": "Berlin",
      "title": "Demo für Klimaschutz",
      "start": "2025-10-15T14:00:00.000Z",
      "end": null,
      "location": "Brandenburger Tor",
      "language": "de-DE",
      "coordinates": {
        "lat": 52.516275,
        "lon": 13.377704
      },
      "url": "https://...",
      "attendees": 500,
      "verified": true,
      "createdAt": "2025-10-12T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 42,
    "limit": 50,
    "skip": 0
  }
}
```

#### Create a protest (authenticated)

```bash
curl -X POST http://localhost:3000/api/protests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "Demonstration für Menschenrechte",
    "city": "München",
    "start": "2025-11-01T15:00:00.000Z",
    "location": "Marienplatz",
    "url": "https://example.org/event",
    "attendees": 200
  }'
```

Response (USER role - unverified):
```json
{
  "message": "Protest created (pending verification)",
  "protest": {
    "id": "507f1f77bcf86cd799439013",
    "verified": false,
    ...
  }
}
```

Response (MODERATOR/ADMIN role - auto-verified):
```json
{
  "message": "Protest created and verified",
  "protest": {
    "id": "507f1f77bcf86cd799439013",
    "verified": true,
    ...
  }
}
```

#### Verify email

After registration, users receive an email with a verification link:

```bash
# User clicks link in email (GET request)
curl "http://localhost:3000/api/auth/verify-email?token=abc123..."
```

Response:
```json
{
  "message": "Email verified successfully! You can now log in.",
  "verified": true
}
```

#### Resend verification email

```bash
curl -X POST http://localhost:3000/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

Response:
```json
{
  "message": "Verification email sent. Please check your inbox."
}
```

#### Login with Google OAuth

```bash
# Step 1: Redirect user to Google OAuth (opens in browser)
open http://localhost:3000/api/auth/google

# Step 2: User authorizes and is redirected back
# Step 3: Receive JWT token automatically
```

Development response:
```json
{
  "message": "Google login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439014",
    "email": "user@gmail.com",
    "role": "USER",
    "emailVerified": true
  }
}
```

Production behavior: Redirects to frontend with token

#### Login with Apple OAuth

```bash
# Step 1: Redirect user to Apple Sign In (opens in browser)
open http://localhost:3000/api/auth/apple

# Step 2: User authorizes and is redirected back
# Step 3: Receive JWT token automatically
```

Development response:
```json
{
  "message": "Apple login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439015",
    "email": "user@icloud.com",
    "role": "USER",
    "emailVerified": true
  }
}
```

Production behavior: Redirects to frontend with token

**Note:** Apple OAuth callback uses POST instead of GET for enhanced security.

#### Update a protest (MODERATOR/ADMIN only)

```bash
curl -X PUT http://localhost:3000/api/protests/507f1f77bcf86cd799439013 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "Updated title",
    "verified": true,
    "attendees": 1000
  }'
```

#### Delete a protest (ADMIN only)

```bash
curl -X DELETE http://localhost:3000/api/protests/507f1f77bcf86cd799439013 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Note:** Deletions are "soft deletes" - the protest remains in the database with a `deleted: true` flag but won't appear in public listings or exports. This prevents the scraper from re-importing deleted events.

#### Export protests as CSV

```bash
# All upcoming protests
curl "http://localhost:3000/api/export/csv" -o protests.csv

# Filter by city and date range
curl "http://localhost:3000/api/export/csv?city=Berlin&days=30" -o berlin-protests.csv

# Filter by country and explicit date range
curl "http://localhost:3000/api/export/csv?country=DE&startDate=2025-10-01&endDate=2025-10-31" -o germany-october.csv

# Filter by source and geolocation
curl "http://localhost:3000/api/export/csv?source=www.friedenskooperative.de&lat=52.52&lon=13.405&radius=100" -o peace-berlin-area.csv
```

#### Export protests as JSON

```bash
# All upcoming protests
curl "http://localhost:3000/api/export/json" -o protests.json

# Filter by city
curl "http://localhost:3000/api/export/json?city=Dresden" -o dresden-protests.json

# Filter by language and country
curl "http://localhost:3000/api/export/json?language=de-DE&country=AT" -o austria-german.json
```

#### Subscribe to protests calendar (ICS)

The ICS endpoint is **subscribable** - you can add it as a calendar subscription in Google Calendar, Apple Calendar, Outlook, etc.

```bash
# Download ICS file
curl "http://localhost:3000/api/export/ics" -o protests.ics

# Subscribe to all Berlin protests (next 90 days) in your calendar app
# Use this URL: http://localhost:3000/api/export/ics?city=Berlin&days=90
```

**Calendar Subscription URLs:**
- All protests: `http://your-domain.com/api/export/ics`
- Berlin only: `http://your-domain.com/api/export/ics?city=Berlin`
- Germany only: `http://your-domain.com/api/export/ics?country=DE`
- Climate protests: `http://your-domain.com/api/export/ics?search=climate`
- Next 30 days: `http://your-domain.com/api/export/ics?days=30`
- Berlin, next 30 days: `http://your-domain.com/api/export/ics?city=Berlin&days=30`
- October 2025: `http://your-domain.com/api/export/ics?startDate=2025-10-01&endDate=2025-10-31`
- Near me (50km radius): `http://your-domain.com/api/export/ics?lat=52.52&lon=13.405&radius=50`
- Specific source: `http://your-domain.com/api/export/ics?source=www.friedenskooperative.de`

**Filter Parameters:**

All endpoints (`/api/protests`, `/api/export/csv`, `/api/export/json`, `/api/export/ics`) support the following filters:

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `city` | string | Filter by city name | `Berlin`, `Dresden` |
| `source` | string | Filter by data source | `www.berlin.de`, `www.friedenskooperative.de` |
| `country` | string | Filter by ISO 3166-1 alpha-2 country code | `DE`, `AT`, `CH` |
| `language` | string | Filter by language code | `de-DE`, `en-US` |
| `search` | string | Full-text search in title (case-insensitive) | `climate`, `democracy` |
| `startDate` | string | Start date (ISO 8601) - events from this date forward | `2025-10-15` |
| `endDate` | string | End date (ISO 8601) - events up to this date (inclusive) | `2025-10-31` |
| `days` | number | Number of days forward from today (alternative to startDate/endDate) | `30`, `60` |
| `verified` | boolean | Show only verified protests (default: `true`) | `true`, `false` |
| `lat` | number | Latitude for geolocation search (requires `lon`) | `52.52` |
| `lon` | number | Longitude for geolocation search (requires `lat`) | `13.405` |
| `radius` | number | Search radius in kilometers (default: `50`, only with lat/lon) | `25`, `100` |
| `limit` | number | Max results per page (default: `50`, max: `100`) | `20`, `50` |
| `skip` | number | Offset for pagination (default: `0`) | `0`, `50` |

**Filter Priority:**
- Date filtering: `startDate`/`endDate` > `days` parameter > default (future events only)
- Location filtering: `lat`/`lon` (geolocation) > `city` (exact match)

**Notes:**
- `limit` and `skip` only apply to `/api/protests` endpoint (not export endpoints)
- `country` codes are case-insensitive but stored as uppercase (e.g., `de` becomes `DE`)
- `endDate` is inclusive - it includes all events starting on that day (until 23:59:59.999)
- `search` performs case-insensitive partial matching in the title field (e.g., `search=climate` matches "Climate Protest", "Klimaschutz", etc.)
- When using geolocation (`lat`/`lon`), the `city` filter is automatically ignored
- Export endpoints default to `verified=true` for public safety

---

## 🔐 Authentication & Security

### Rate Limiting (Spam Protection)

All authentication endpoints are protected by rate limiting:

- **Registration**: 5 attempts per 15 minutes per IP
- **Login**: 10 attempts per 15 minutes per IP
- **Resend Verification**: 3 attempts per 15 minutes per IP

When rate limit is exceeded, the API returns `429 Too Many Requests` with retry information in `RateLimit-*` headers.

### Email Verification

**Setup Required**: Configure SMTP settings in `.env` file

```bash
# Gmail example (use App Password, not regular password)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM='"Protest Listing" <noreply@protest-listing.com>'
```

**Alternative Email Providers:**
- **SendGrid**: Set `SENDGRID_API_KEY` (100 emails/day free)
- **Mailgun**: 5,000 emails/month free for 3 months
- **AWS SES**: 62,000 emails/month free (if on AWS)
- **Resend**: 100 emails/day free

**Email Verification Flow:**
1. User registers → receives verification email (24-hour token expiry)
2. User clicks link in email → email verified
3. User can log in (optional: enforce `REQUIRE_EMAIL_VERIFICATION=true`)

**Features:**
- HTML + plain text email templates
- Automatic welcome email after verification
- Resend verification email endpoint
- Gracefully handles missing email config (development mode)

### OAuth Authentication

**Supported Providers:**
- Google OAuth 2.0
- Apple Sign In

**Google OAuth Setup:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
4. Add to `.env`:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

**Apple OAuth Setup** (optional):

1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list/serviceId)
2. Create a Service ID and configure Sign in with Apple
3. Generate an Apple Sign In private key (.p8 file)
4. Add authorized redirect URI: `http://localhost:3000/api/auth/apple/callback`
5. Add to `.env`:

```bash
APPLE_CLIENT_ID=your-apple-client-id
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-apple-key-id
APPLE_PRIVATE_KEY_PATH=path/to/AuthKey_XXXXX.p8
APPLE_REDIRECT_URI=http://localhost:3000/api/auth/apple/callback
```

**OAuth Features:**
- PKCE (Proof Key for Code Exchange) for security
- CSRF protection with state tokens
- Auto-creates user from OAuth account
- Email pre-verified for OAuth users
- Links existing accounts by email
- Works in development & production modes

**Production Configuration:**

```bash
# Production mode redirects to frontend
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.com
```

In production, OAuth callbacks redirect to `FRONTEND_URL/auth/callback?token=...`

---

## 🔑 Roles & Permissions

| Role | Can Add | Can Edit | Can Delete | Auto-Verified |
|------|----------|-----------|-------------|---------------|
| USER | ✅ | ❌ | ❌ | ❌ |
| MODERATOR | ✅ | ✅ | ❌ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ |

---

## 🔧 Scraper Standalone Usage

The protest scraper can be used as a standalone command-line tool without the API/database infrastructure.

### Prerequisites

```bash
yarn install
yarn build
```

### Command Line Options

```bash
node dist/scraper/scrape-protests.js [options]

Options:
  --days <n>      Days forward to scrape (default: 40)
  --csv <csv>     CSV output file (default: protests.csv)
  --json <json>   JSON output file (default: protests.json)
  --ics <ics>     iCalendar output file (default: protests.ics)
```

### Usage Examples

```bash
# Basic usage (next 40 days, default filenames)
node dist/scraper/scrape-protests.js

# Custom date range
node dist/scraper/scrape-protests.js --days 90

# Custom output files
node dist/scraper/scrape-protests.js \
  --days 30 \
  --csv demo-data.csv \
  --json demo-data.json \
  --ics demo-data.ics
```

### Data Sources

The scraper uses a **registry-based architecture** designed for internationalization. Currently supports German sources:

- **Berlin Police** (Versammlungsbehörde) - Official assembly registrations
- **Dresden City** (Versammlungsübersicht) - Official assembly list
- **Friedenskooperative** - Peace movement actions (5 categories)
- **DemokraTEAM** - Anti-fascist & democracy events (filtered for demos/protests only)

**Architecture Highlights:**
- Locale-aware date and number parsing
- Easy addition of new countries (see `src/scraper/sources/registry.ts`)
- Sources organized by country in `src/scraper/sources/<country>/`
- Generic utilities support multiple languages and date formats
- **robots.txt compliance** - Uses `robots-parser` library to respect Allow/Disallow directives before scraping
- **Time presence tracking** - Distinguishes between "no time provided" vs "midnight" using `startTimeKnown`/`endTimeKnown` flags

### Output Format

#### JSON Structure
```json
{
  "source": "www.demokrateam.org",
  "city": "Berlin",
  "title": "Demo für Demokratie",
  "start": "2025-10-15T14:00:00.000Z",
  "end": null,
  "location": "Berlin, Brandenburger Tor",
  "language": "de-DE",
  "url": "https://www.demokrateam.org/aktionen/...",
  "attendees": 5000
}
```

#### CSV Format
```csv
source,city,title,start,end,location,language,url,attendees
"www.demokrateam.org","Berlin","Demo für Demokratie","2025-10-15T14:00:00.000Z","","Berlin, Brandenburger Tor","de-DE","https://...",5000
```

#### ICS Format
Standard iCalendar format compatible with Google Calendar, Apple Calendar, Outlook, etc.

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | Data source name |
| `city` | string \| null | City where event takes place |
| `title` | string | Event title/theme |
| `start` | ISO 8601 string \| null | Event start date/time (UTC) |
| `startTimeKnown` | boolean | Whether the source provided a specific time (false = defaults to 00:00, show as "TBA") |
| `end` | ISO 8601 string \| null | Event end date/time (UTC) |
| `endTimeKnown` | boolean | Whether the source provided an end time |
| `location` | string \| null | Normalized location description |
| `url` | string | Source URL for event details |
| `attendees` | number \| null | Expected/announced number of attendees |

### Error Handling

The scraper includes:
- Automatic retry with delays to respect rate limits
- Individual source error handling (one source failure won't stop others)
- Detailed error logging to stderr
- Final result count logged to stdout as JSON

---

## 🗺️ Roadmap & Progress

### ✅ Completed Features

#### Scraper Core
- [x] Berlin Police scraper (table parsing with date/time extraction)
- [x] Dresden City scraper (JSON API integration)
- [x] Friedenskooperative scraper (hybrid POST API + HTML parsing)
- [x] DemokraTEAM scraper (hybrid POST API + HTML parsing with label filtering)
- [x] German date parser (supports multiple formats: DD.MM.YYYY, DD.MM HH:mm, etc.)
- [x] **Time presence detection** (distinguishes "no time" from "midnight" via `startTimeKnown`/`endTimeKnown`)
- [x] Attendee number extraction from German text patterns
- [x] Duplicate detection and removal
- [x] Command-line interface with options
- [x] Geocoding addresses to coordinates
- [x] Date range filtering (respects `--days` parameter across all parsers)
- [x] **robots.txt compliance** (uses `robots-parser` library to respect Allow/Disallow rules)
- [x] CSV export (file-based and API endpoint)
- [x] JSON export (file-based and API endpoint)
- [x] ICS (iCalendar) export (file-based and API endpoint)
- [x] MongoDB import script with deduplication
- [x] Comprehensive test suite (350 tests: parsing, deduplication, filtering, robots.txt)

#### Data Model
- [x] Source tracking
- [x] City extraction and normalization
- [x] Location details
- [x] Start/end time support with time presence tracking (`startTimeKnown`/`endTimeKnown`)
- [x] Event URLs
- [x] Optional attendee count field

### 🚧 In Progress / Planned Features

#### Scraper Enhancements
- [ ] Köln Police scraper (requires official police source URL)
- [ ] Hamburg scraper integration
- [ ] Munich scraper integration
- [ ] Additional regional sources

#### API & Database
- [x] MongoDB connection and indexes
- [x] TypeScript type definitions
- [x] Express REST API setup
- [x] JWT authentication middleware
- [x] User registration endpoint
- [x] Login endpoint
- [x] **Rate limiting for spam protection (5/15min registration, 10/15min login)**
- [x] **Email verification system with nodemailer**
- [x] **OAuth authentication (Google, Apple)**
- [x] Public protest listing endpoint with filters (city, date range, pagination)
- [x] **Full-text search in protest titles**
- [x] Protected protest creation endpoint
- [x] Moderator edit endpoint
- [x] Admin delete endpoint
- [x] Manual verification workflow for USER submissions
- [x] Auto-verification for MODERATOR/ADMIN submissions
- [x] Export endpoints (CSV, JSON, ICS) with filter support
- [x] Subscribable ICS calendar feeds with custom filters
- [x] Geolocation search ("protests near me" feature)
- [x] Automatic geocoding of city names to coordinates
- [x] **Automatic cleanup of old protests (TTL index - 2 weeks after event)**
- [x] Comprehensive API test suite

#### Deployment & DevOps
- [x] Docker Compose setup with MongoDB
- [x] Production Dockerfile (multi-stage build)
- [x] Environment configuration (.env.example)
- [ ] CI/CD pipeline
- [ ] Automated scraper schedule (cron job)

#### Documentation & Quality
- [x] README with usage instructions
- [x] Scraper standalone documentation
- [x] Roadmap checklist
- [x] API endpoint documentation with curl examples
- [x] Authentication flow documentation
- [x] Contributing guidelines
- [x] Code of conduct

### 📋 Feature Priority

**High Priority:**
1. ~~Complete API implementation (endpoints, auth, database)~~ ✅ **DONE**
2. ~~Docker containerization~~ ✅ **DONE**
3. Automated scraping schedule (cron job to run scraper periodically)
4. ~~API documentation~~ ✅ **DONE**

**Medium Priority:**
1. Additional scraper sources (Hamburg, Munich, etc.)
2. Webhook/notification system for new protests
3. Search and advanced filtering
4. Event categorization/tagging

**Low Priority:**
1. Frontend dashboard
2. Admin panel UI
3. Email notifications
4. Mobile app API

---

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or suggesting new data sources, your help is appreciated.

### How to Contribute

1. **Read the [Contributing Guide](CONTRIBUTING.md)** - Detailed guidelines for contributors
2. **Check [open issues](https://github.com/artem-schander/protest-scraper/issues)** - Look for `good first issue` or `help wanted` labels
3. **Follow the [Code of Conduct](CODE_OF_CONDUCT.md)** - Be respectful and constructive
4. **Use issue templates** - Bug reports, feature requests, or new data sources

### Quick Start for Contributors

```bash
# Fork and clone the repository
git clone https://github.com/artem-schander/protest-scraper.git
cd protest-scraper

# Install dependencies
yarn install

# Start MongoDB
docker compose up -d

# Run tests
yarn test
yarn coverage

# Start development server
yarn dev
```

### Adding New Data Sources

We're always looking to expand coverage! If you know of an official protest registry:

1. Open an issue using the **New Data Source** template
2. Check the [Contributing Guide](CONTRIBUTING.md#adding-new-scrapers) for implementation details
3. Each scraper needs both unit tests (mocked) and E2E tests (live API)

---

## 📄 License

AGPL-3.0 License © 2025 Artem Schander
